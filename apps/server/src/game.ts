/**
 * v2.0 游戏编排服务（plan P2）：
 * 权威状态在服务端；LLM 演绎在事务外；requestId 幂等 + 版本校验；事务原子提交。
 */
import { availableEvents, resolveExplorationInput } from './exploration.js'
import { settleDailyChoice } from './daily.js'
import type Database from 'better-sqlite3'
import {
  advanceTime,
  fallbackDaily,
  rememberCharacters,
  applyBattleConsequences,
  applyFixedAction,
  applyGrow,
  applyLifeMemories,
  applyOutcome,
  battleTurn,
  BATTLE_NARRATIVE_MAX_CHARS,
  checkAchievedEnding,
  choiceAvailable,
  chosenEndingAvailable,
  availableChosenEndings,
  createLife,
  createMetaState,
  DEGRADED_NARRATIVE,
  INPUT_MAX_CHARS,
  markEventSeen,
  markLifeEnd,
  MEMORY_MAX_TOTAL,
  pickEvent,
  reqDiscountForLives,
  resolvePlayerFirst,
  restOfDay,
  settleLifeEnd,
  startBattle,
  structuredCloneLife,
  SUMMARY_EVERY_ACTIONS,
  validateGrowthDecl,
  type BattleCommand,
  type BattleState,
  type GrowKey,
  type HistoryEntry,
  type LifeState,
  type MetaState,
  type Rng,
} from '@lorecraft/core'
import {
  extractMemories,
  generateDaily,
  runCharacterExtraction,
  mergeMemoriesLlm,
  runActAttempt,
  runBattleAttempt,
  runEndingChapter,
  summarizeHistory,
  type LlmProvider,
} from '@lorecraft/llm'
import {
  ACTIONS,
  DESTINIES,
  ENDINGS,
  EVENTS,
  getEnemy,
  getLocation,
  getOrigin,
  LOCATIONS,
  MARTIALS,
  MARTIAL_DEFS,
  NPCS,
  ORIGINS,
  FACTIONS,
} from '@lorecraft/worlddata'
import type { AppConfig } from './config.js'
import { HttpError } from './errors.js'
import type { Repos } from './repos.js'

export interface TurnHooks {
  onDelta?: (text: string) => void
}

export type ActRequest =
  | { kind: 'daily_prepare'; retry?: boolean }
  | { kind: 'daily_choose'; planId: string; slot: number; index: number }
  | { kind: 'action'; actionId: string }
  | { kind: 'free'; input: string }
  | { kind: 'event_choice'; index: number }
  | { kind: 'travel'; locationId: string }
  | { kind: 'seek_event'; eventId: string }
  | { kind: 'ending'; endingId: string }

export interface EndInfo {
  endType: 'death' | 'ending'
  deathCause: string | null
  endingId: string | null
  endingName: string
  chapterTitle: string
  chapter: string
}

export interface EventPresentation {
  id: string
  title: string
  text: string
  /** index 为原始选项下标（供 event_choice 使用） */
  choices: { index: number; label: string }[]
}

export interface EndingOption {
  id: string
  name: string
  desc: string
}

export interface ActResponse {
  life: LifeState
  narrative: string
  degraded: boolean
  degradedReason: string | null
  suggestions: string[]
  event: EventPresentation | null
  battleStarted: { enemyName: string; lethal: boolean } | null
  ended: boolean
  endInfo: EndInfo | null
  availableEndings: EndingOption[]
  meta: MetaState
}

export interface BattleResponse {
  life: LifeState
  battle: BattleState
  narrative: string
  degraded: boolean
  degradedReason: string | null
  ended: boolean
  endInfo: EndInfo | null
  availableEndings: EndingOption[]
  meta: MetaState
}

export interface ServiceDeps {
  db: Database.Database
  config: AppConfig
  provider: LlmProvider
  repos: Repos
  now?: () => string
  genId?: () => string
  rng?: Rng
}

export class GameService {
  private readonly db: Database.Database
  private readonly repos: Repos
  private readonly config: AppConfig
  private readonly provider: LlmProvider
  private readonly now: () => string
  private readonly genId: () => string
  private readonly rng: Rng

  constructor(deps: ServiceDeps) {
    this.db = deps.db
    this.repos = deps.repos
    this.config = deps.config
    this.provider = deps.provider
    this.now = deps.now ?? (() => new Date().toISOString())
    this.genId = deps.genId ?? (() => crypto.randomUUID())
    this.rng = deps.rng ?? (() => Math.random())
  }

  // ---- meta / 目录 ----

  private ensureMeta(): MetaState {
    const meta = this.repos.loadMeta()
    // 形状防御：残留的 v1.0 meta（或任何残缺数据）一律重建
    if (
      meta &&
      typeof meta.livesCount === 'number' &&
      Array.isArray(meta.memories) &&
      Array.isArray(meta.unlockedOrigins) &&
      Array.isArray(meta.history)
    ) {
      return meta
    }
    const created = createMetaState(this.now())
    this.repos.saveMeta(created)
    return created
  }

  getMeta(): { meta: MetaState; activeLifeId: string | null; openMemoryTaskCount: number } {
    const meta = this.ensureMeta()
    return {
      meta,
      activeLifeId: this.repos.getActiveLife()?.id ?? null,
      openMemoryTaskCount: this.repos.openMemoryTaskCount(),
    }
  }

  catalog(): {
    locations: typeof LOCATIONS
    factions: typeof FACTIONS
    npcs: typeof NPCS
    actions: typeof ACTIONS
    martials: { id: string; name: string; category: string; tier: number; mpCost: number; desc: string }[]
    origins: { id: string; name: string; desc: string; available: boolean; unlockOnly: boolean }[]
  } {
    const meta = this.ensureMeta()
    return {
      locations: LOCATIONS,
      factions: FACTIONS,
      npcs: NPCS,
      actions: ACTIONS,
      martials: MARTIALS.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        tier: m.tier,
        mpCost: m.mpCost,
        desc: m.desc,
      })),
      origins: ORIGINS.map((o) => ({
        id: o.id,
        name: o.name,
        desc: o.desc,
        available: !o.unlockOnly || meta.unlockedOrigins.includes(o.id),
        unlockOnly: o.unlockOnly ?? false,
      })),
    }
  }

  // ---- 一世生命周期 ----

  createLife(originId: string): { life: LifeState; meta: MetaState } {
    const origin = getOrigin(originId)
    if (!origin) throw new HttpError(404, 'origin_not_found', `出身不存在：${originId}`)
    const tx = this.dbTransaction(() => {
      const active = this.repos.getActiveLife()
      if (active) {
        throw new HttpError(409, 'active_life_exists', '已有一世在进行中；这一世终结后才能转世重来')
      }
      const meta = this.ensureMeta()
      if (origin.unlockOnly && !meta.unlockedOrigins.includes(origin.id)) {
        throw new HttpError(403, 'origin_locked', '该出身尚未解锁')
      }
      const destiny = origin.destiny ?? DESTINIES[Math.floor(this.rng() * DESTINIES.length)]?.id ?? null
      const life = createLife(this.genId(), { ...origin, destiny }, this.now())
      this.repos.insertLife(life, this.now())
      this.repos.insertEvent(
        life.id,
        'life_start',
        JSON.stringify({ origin: origin.id, destiny }),
        this.now()
      )
      return { life, meta }
    })
    return tx()
  }

  getActiveLife(): LifeState | null {
    const life = this.repos.getActiveLife()?.data ?? null
    return life ? this.restoreSavedSuggestions(life) : null
  }

  getLatestEndedLife(): LifeState | null {
    return this.repos.getLatestEndedLife()
  }

  memoryStatus(lifeId: string): { pending: number; failed: number; lastError: string | null } {
    this.getLife(lifeId)
    const tasks = this.repos.openMemoryTasks(lifeId)
    return {
      pending: tasks.filter(t => t.status === 'pending').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      lastError: tasks.filter(t => t.status === 'failed').at(-1)?.error ?? null,
    }
  }

  getLife(id: string): LifeState {
    const row = this.repos.getLife(id)
    if (!row) throw new HttpError(404, 'life_not_found', '这一世不存在')
    return this.restoreSavedSuggestions(row.data)
  }

  private restoreSavedSuggestions(life: LifeState): LifeState {
    if (life.suggestedActions === undefined && life.phase === 'alive' && !life.pendingBattle) {
      const saved = this.repos.latestActSuggestions(life.id)
      if (saved?.seq === life.logSeq) life.suggestedActions = saved.suggestions
    }
    return life
  }

  history(): MetaState['history'] {
    return this.ensureMeta().history
  }

  async summarizeCharacters(lifeId: string, requestId: string, clientVersion: number): Promise<{ life: LifeState }> {
    const claim = this.claimOrReplay<{ life: LifeState }>(lifeId, requestId, 'characters')
    if (claim.replay) return claim.replay
    try {
      const row = this.repos.getLife(lifeId)
      if (!row) throw new HttpError(404, 'life_not_found', '这一世不存在')
      if (row.version !== clientVersion) throw new HttpError(409, 'version_conflict', '状态已更新，请重新打开江湖册')
      const result = await runCharacterExtraction(this.provider, row.data, this.config.llmAuxTimeoutMs)
      this.logUsage('characters', result.usage, lifeId)
      if (result.kind !== 'ok') throw new HttpError(500, 'characters_failed', '人物整理未完成，请稍后重试')
      return this.dbTransaction(() => {
        const fresh = this.repos.getLife(lifeId)
        if (!fresh || fresh.version !== row.version) throw new HttpError(409, 'version_conflict', '经历已更新，请重新整理')
        const life = structuredCloneLife(fresh.data)
        rememberCharacters(life, result.value.characters, [life.summary ?? '', ...life.history.map(h => h.text)].join('\n').slice(-12000))
        life.version++
        if (!this.repos.saveLife(life, fresh.version, this.now())) throw new HttpError(409, 'version_conflict', '状态已更新')
        const response = { life }
        this.repos.completeRequest(lifeId, requestId, JSON.stringify(response), this.now())
        return response
      })()
    } catch (e) { this.repos.releaseRequest(lifeId, requestId); throw e }
  }

  opportunities(lifeId: string) {
    return availableEvents(this.getLife(lifeId)).map(event => ({ id: event.id, title: event.title, text: event.text }))
  }

  // ---- 行动 ----

  async submitAct(
    lifeId: string,
    requestId: string,
    clientVersion: number,
    act: ActRequest,
    hooks?: TurnHooks
  ): Promise<ActResponse> {
    if (act.kind === 'free') {
      const text = act.input.trim()
      if (!text) throw new HttpError(400, 'empty_input', '输入不能为空')
      if (text.length > INPUT_MAX_CHARS) {
        throw new HttpError(400, 'input_too_long', `输入最多 ${INPUT_MAX_CHARS} 字`)
      }
    }
    if (act.kind === 'event_choice' && (!Number.isInteger(act.index) || act.index < 0)) {
      throw new HttpError(400, 'bad_choice', '非法选项')
    }

    const claim = this.claimOrReplay<ActResponse>(lifeId, requestId, 'act')
    if (claim.replay) return claim.replay

    const lifeRow = this.repos.getLife(lifeId)
    if (!lifeRow) throw new HttpError(404, 'life_not_found', '这一世不存在')
    if (lifeRow.data.phase !== 'alive') {
      this.repos.releaseRequest(lifeId, requestId)
      throw new HttpError(409, 'life_ended', '这一世已经终结')
    }
    if (lifeRow.data.pendingBattle) {
      this.repos.releaseRequest(lifeId, requestId)
      throw new HttpError(409, 'in_battle', '战斗中，请先结束战斗')
    }
    if (clientVersion !== lifeRow.version) {
      this.repos.releaseRequest(lifeId, requestId)
      throw new HttpError(409, 'version_conflict', `状态已更新（服务端版本 ${lifeRow.version}），请刷新`)
    }

    if (lifeRow.data.pendingEventId && act.kind !== 'event_choice') {
      this.repos.releaseRequest(lifeId, requestId)
      throw new HttpError(409, 'pending_event', '请先完成当前事件的抉择，再进行其他行动')
    }

    const originalInput = act.kind === 'free' ? act.input.trim() : null
    if (originalInput) act = resolveExplorationInput(originalInput, lifeRow.data.locationId) ?? act
    const meta = this.ensureMeta()
    const discount = reqDiscountForLives(meta.livesCount)

    let working = structuredCloneLife(lifeRow.data)
    let facts: string[] = []
    let narrative = ''
    let degraded = false
    let degradedReason: string | null = null
    let suggestions: string[] = []
    let battleStarted: ActResponse['battleStarted'] = null
    let historyKind: HistoryEntry['kind'] = 'action'
    let historyLabel = ''
    let eventCtx: { title: string; text: string; choiceLabel: string; facts: string[] } | null = null
    let freeInput = ''
    let playerInput = ''

    try {
      if (act.kind === 'daily_prepare') {
        if (working.dailyPlan?.day === working.day && working.dailyPlan.startSlot <= working.slot && !(act.retry && working.dailyPlan.source === 'fallback' && working.slot === working.dailyPlan.startSlot && working.dailyPlan.selectedRoute === null)) {
          throw new HttpError(409, 'daily_exists', '今日事件已准备好，请继续选择或刷新同步')
        }
        const generated = await generateDaily({ provider: this.provider, life: working, meta, locations: LOCATIONS, timeoutMs: this.config.llmDailyTimeoutMs })
        this.logUsage('daily', generated.usage, lifeId)
        const content = generated.kind === 'ok' ? generated.value : fallbackDaily(working.locationId, getLocation(working.locationId)?.name ?? '此地', working.day)
        working.dailyPlan = { ...content, id: this.genId(), day: working.day, startSlot: working.slot, selectedRoute: null, source: generated.kind === 'ok' ? 'llm' : 'fallback', generationError: generated.kind === 'degraded' ? generated.reason : undefined }
        historyKind = 'system'
        historyLabel = '今日事件已备妥'
        narrative = content.text
        facts = [generated.kind === 'ok' ? '今日分支已生成，选择后直接结算' : '编剧暂不可用，已准备可游玩的生计与修行事件']
      } else if (act.kind === 'daily_choose') {
        const plan = working.dailyPlan
        if (!plan || plan.id !== act.planId || plan.day !== working.day || act.slot !== working.slot) throw new HttpError(409, 'daily_stale', '此选项已过期，请刷新同步')
        if (!Number.isInteger(act.index) || act.index < 0 || act.index > 2) throw new HttpError(400, 'bad_choice', '非法选项')
        const offset = working.slot - plan.startSlot
        const route = offset === 0 ? plan.routes[act.index] : plan.routes[plan.selectedRoute ?? -1]
        const scene = offset === 0 ? null : route?.stages[offset - 1]
        const choice = offset === 0 ? route?.entry : scene?.choices[act.index]
        if (!route || !choice || (offset > 0 && working.locationId !== route.locationId)) throw new HttpError(409, 'daily_stale', '当前场景不符合此分支，请重新同步')
        const beforeLocation = working.locationId
        if (offset === 0) { plan.selectedRoute = act.index; working.locationId = route.locationId }
        const result = settleDailyChoice(working, choice, this.rng)
        if (result.invalid) throw new HttpError(400, 'invalid_action', result.invalid)
        working = result.life
        if (choice.followUp?.trim()) {
          const text = choice.followUp.trim().slice(0, 100)
          working.storyThreads = [...(working.storyThreads ?? []).filter(t => t.text !== text), { day: plan.day, text }].slice(-6)
        }
        facts = result.facts
        if (beforeLocation !== working.locationId) facts.unshift(`前往${getLocation(working.locationId)?.name ?? working.locationId}`)
        if (result.diedOfStarve) markLifeEnd(working, 'death', { deathCause: 'starve' })
        else if (result.goodDeath) markLifeEnd(working, 'ending', { endingId: 'shan_zhong' })
        historyKind = 'event'
        historyLabel = scene?.title ?? plan.title
        playerInput = choice.label
        narrative = [scene?.text, choice.result, facts.join('；')].filter(Boolean).join('\n\n')
        if (working.day !== plan.day) working.dailyPlan = null
      } else if (act.kind === 'action') {
        const action = ACTIONS.find((a) => a.id === act.actionId)
        if (!action) throw new HttpError(404, 'action_not_found', `行动不存在：${act.actionId}`)
        historyLabel = action.label
        playerInput = originalInput ?? action.label
        if (action.id === 'zuogong') working.locationId = 'matou'
        if (action.id === 'fangshi') working.locationId = 'fangshi'
        if (action.id === 'biaoju_banggong') working.locationId = 'biaoju'
        const res =
          action.id === 'guoyiri'
            ? restOfDay(working, this.rng)
            : applyFixedAction(working, action, MARTIAL_DEFS, this.rng)
        if (res.invalid) throw new HttpError(400, 'invalid_action', res.invalid)
        working = res.life
        facts = res.facts
        if (res.diedOfStarve) markLifeEnd(working, 'death', { deathCause: 'starve' })
        else if (res.goodDeath) markLifeEnd(working, 'ending', { endingId: 'shan_zhong' })
        if (working.phase === 'alive' && res.eventRoll) {
          const ev = pickEvent(working, EVENTS, this.rng)
          if (ev) {
            working.pendingEventId = ev.id
            markEventSeen(working, ev.id)
          }
        }
      } else if (act.kind === 'free') {
        historyLabel = '自由行动'
        freeInput = act.input.trim()
        playerInput = freeInput
        const tick = advanceTime(working, 1)
        if (tick.diedOfStarve) markLifeEnd(working, 'death', { deathCause: 'starve' })
        else if (tick.goodDeath) markLifeEnd(working, 'ending', { endingId: 'shan_zhong' })
      } else if (act.kind === 'travel') {
        const location = getLocation(act.locationId)
        if (!location) throw new HttpError(404, 'location_not_found', '此处不在当前江湖地图中')
        if (location.id === working.locationId) throw new HttpError(400, 'already_here', '你已在此处，可通过附近机缘寻找事件')
        working.locationId = location.id
        historyLabel = `前往${location.name}`
        playerInput = originalInput ?? historyLabel
        const tick = advanceTime(working, 1)
        facts = [`你来到${location.name}`]
        if (tick.diedOfStarve) markLifeEnd(working, 'death', { deathCause: 'starve' })
        else if (tick.goodDeath) markLifeEnd(working, 'ending', { endingId: 'shan_zhong' })
        if (working.phase === 'alive') {
          const event = pickEvent(working, EVENTS, this.rng)
          if (event) { working.pendingEventId = event.id; markEventSeen(working, event.id) }
        }
      } else if (act.kind === 'seek_event') {
        const event = availableEvents(working).find(e => e.id === act.eventId)
        if (!event) throw new HttpError(409, 'event_unavailable', '当前条件或冷却不满足，请查看附近机缘；其他地点的事件需先前往该地点')
        historyLabel = `寻找机缘：${event.title}`
        playerInput = originalInput ?? historyLabel
        working.pendingEventId = event.id
        markEventSeen(working, event.id)
        facts = ['发现事件，尚未选择选项，不发放任何奖励']
      } else if (act.kind === 'event_choice') {
        const ev = EVENTS.find((e) => e.id === working.pendingEventId)
        if (!ev) throw new HttpError(409, 'no_pending_event', '当前没有待抉择的事件')
        const choice = ev.choices[act.index]
        if (!choice) throw new HttpError(400, 'bad_choice', '选项不存在')
        if (!choiceAvailable(working, choice)) {
          throw new HttpError(400, 'choice_unavailable', '该选项当前不可选')
        }
        historyKind = 'event'
        historyLabel = ev.title
        playerInput = `【${ev.title}】${choice.label}`
        const outcome = applyOutcome(working, choice, MARTIAL_DEFS, this.rng, discount)
        working = outcome.life
        facts = outcome.facts
        markEventSeen(working, ev.id)
        working.pendingEventId = null
        eventCtx = { title: ev.title, text: ev.text, choiceLabel: choice.label, facts }
        if (outcome.battle) {
          const enemyDef = getEnemy(outcome.battle.enemyId)
          if (!enemyDef) throw new HttpError(500, 'enemy_missing', `敌人数据缺失：${outcome.battle.enemyId}`)
          let battle = startBattle(enemyDef, {
            onWinFlags: outcome.battle.onWinFlags,
            onLoseFlags: outcome.battle.onLoseFlags,
          })
          battle = resolvePlayerFirst(working, battle)
          working.pendingBattle = battle
          battleStarted = { enemyName: enemyDef.name, lethal: enemyDef.lethal }
        }
        if (outcome.starved) {
          markLifeEnd(working, 'death', { deathCause: 'starve' })
        } else if (outcome.died) {
          markLifeEnd(working, 'death', { deathCause: 'mischief' })
        }
      } else {
        const ending = ENDINGS.find((e) => e.id === act.endingId)
        if (!ending) throw new HttpError(404, 'ending_not_found', '结局不存在')
        if (!chosenEndingAvailable(working, ending, MARTIAL_DEFS)) {
          throw new HttpError(400, 'ending_unavailable', '该结局的条件尚未满足')
        }
        markLifeEnd(working, 'ending', { endingId: ending.id })
        historyLabel = ending.name
        playerInput = `【抉择】${ending.name}`
      }

      if (working.phase === 'alive' && working.attrs.hp <= 0) {
        markLifeEnd(working, 'death', { deathCause: 'mischief' })
      }

      // ---- LLM 行动演绎（事务外） ----
      if (act.kind !== 'daily_prepare' && act.kind !== 'daily_choose') working.dailyPlan = null
      if (working.phase === 'alive' && act.kind !== 'daily_prepare' && act.kind !== 'daily_choose') {
        const attempt = await runActAttempt({
          provider: this.provider,
          life: working,
          timeBefore: { day: lifeRow.data.day, slot: lifeRow.data.slot },
          meta,
          locationName: getLocation(working.locationId)?.name ?? '钱塘城',
          pendingEvent: this.presentEvent(working),
          event: eventCtx,
          facts,
          playerInput:
            act.kind === 'free'
              ? freeInput
              : (originalInput ?? historyLabel) + (facts.length > 0 ? `（${facts.join('；')}）` : ''),
          allowGrowth: act.kind === 'free' && !working.pendingEventId,
          validateGrowth: (life, growth) => validateGrowthDecl(life, growth),
          timeoutMs: this.config.llmTimeoutMs,
          onNarrativeDelta: hooks?.onDelta,
        })
        this.logUsage('act', attempt.usage, lifeId)
        if (attempt.kind === 'ok') {
          narrative = attempt.value.narrative
          rememberCharacters(working, attempt.value.characters ?? [], narrative)
          suggestions = attempt.value.suggestedActions ?? []
          if (attempt.value.growth && act.kind === 'free') {
            applyGrow(working, attempt.value.growth.key as GrowKey, 1, 'llm', MARTIAL_DEFS)
            facts = [...facts, `${attempt.value.growth.reason}（${attempt.value.growth.key} +1）`]
          }
        } else {
          degraded = true
          degradedReason = attempt.reason
          narrative = act.kind === 'free' ? DEGRADED_NARRATIVE : facts.join('；') || DEGRADED_NARRATIVE
        }
      }

      // ---- 达成型结局静默判定 ----
      if (working.phase === 'alive') {
        const achieved = checkAchievedEnding(working, ENDINGS, MARTIAL_DEFS)
        if (achieved) {
          markLifeEnd(working, 'ending', { endingId: achieved.id })
          if (!historyLabel) historyLabel = achieved.name
        }
      }

      // ---- 结局章（若本回合终结） ----
      let endInfo: EndInfo | null = null
      if (working.phase === 'ended') {
        endInfo = await this.buildEndInfo(working)
        working.endNarrative = `${endInfo.chapterTitle}\n\n${endInfo.chapter}`
        narrative = `${endInfo.chapterTitle}\n\n${endInfo.chapter}`
      }

      return await this.commitAct(lifeId, requestId, lifeRow.version, {
        life: working,
        narrative,
        degraded,
        degradedReason,
        suggestions,
        facts,
        historyKind,
        historyLabel,
        playerInput,
        battleStarted,
        endInfo,
        skipSummary: act.kind === 'daily_prepare' || act.kind === 'daily_choose',
      })
    } catch (e) {
      this.repos.releaseRequest(lifeId, requestId)
      throw e
    }
  }

  // ---- 战斗回合 ----

  async submitBattleTurn(
    lifeId: string,
    requestId: string,
    clientVersion: number,
    command: BattleCommand,
    hooks?: TurnHooks
  ): Promise<BattleResponse> {
    const claim = this.claimOrReplay<BattleResponse>(lifeId, requestId, 'battle')
    if (claim.replay) return claim.replay

    const lifeRow = this.repos.getLife(lifeId)
    if (!lifeRow) throw new HttpError(404, 'life_not_found', '这一世不存在')
    if (lifeRow.data.phase !== 'alive' || !lifeRow.data.pendingBattle) {
      this.repos.releaseRequest(lifeId, requestId)
      throw new HttpError(409, 'not_in_battle', '当前不在战斗中')
    }
    if (clientVersion !== lifeRow.version) {
      this.repos.releaseRequest(lifeId, requestId)
      throw new HttpError(409, 'version_conflict', '状态已更新，请刷新')
    }

    let working = structuredCloneLife(lifeRow.data)
    const battle0 = working.pendingBattle!
    const enemyDef = getEnemy(battle0.enemy.defId)
    if (!enemyDef) {
      this.repos.releaseRequest(lifeId, requestId)
      throw new HttpError(500, 'enemy_missing', '敌人数据缺失')
    }

    const res = battleTurn(working, battle0, command, MARTIAL_DEFS, this.rng)
    if (res.invalid) {
      this.repos.releaseRequest(lifeId, requestId)
      throw new HttpError(400, 'invalid_command', res.invalid)
    }
    working = res.life
    const battle = res.battle
    const facts = [...res.round.facts]

    if (battle.finished && battle.result) {
      const cons = applyBattleConsequences(working, battle, enemyDef, this.rng)
      working = cons.life
      facts.push(...cons.facts)
      if (cons.died) markLifeEnd(working, 'death', { deathCause: 'battle' })
      const ctx = battle.context
      if (battle.result === 'win' && ctx?.onWinFlags) {
        working.flags = [...new Set([...working.flags, ...ctx.onWinFlags])]
      }
      if (battle.result === 'lose' && ctx?.onLoseFlags) {
        working.flags = [...new Set([...working.flags, ...ctx.onLoseFlags])]
      }
    }
    working.pendingBattle = battle.finished ? null : battle

    // ---- LLM 战斗演绎（事务外） ----
    const attempt = await runBattleAttempt({
      provider: this.provider,
      enemyName: battle.enemy.name,
      turn: battle.turn,
      round: { facts, playerHp: working.attrs.hp },
      life: working,
      timeoutMs: this.config.llmTimeoutMs,
      onNarrativeDelta: hooks?.onDelta,
    })
    this.logUsage('battle', attempt.usage, lifeId)
    let narrative: string
    let degraded = false
    let degradedReason: string | null = null
    if (attempt.kind === 'ok') {
      narrative = attempt.value.narrative
    } else {
      degraded = true
      degradedReason = attempt.reason
      narrative = facts.join('；').slice(0, BATTLE_NARRATIVE_MAX_CHARS)
    }

    // ---- 达成型结局 / 终局章 ----
    let endInfo: EndInfo | null = null
    if (working.phase === 'alive') {
      const achieved = checkAchievedEnding(working, ENDINGS, MARTIAL_DEFS)
      if (achieved) markLifeEnd(working, 'ending', { endingId: achieved.id })
    }
    if (working.phase === 'ended') {
      endInfo = await this.buildEndInfo(working)
      working.endNarrative = `${endInfo.chapterTitle}\n\n${endInfo.chapter}`
      narrative = `${endInfo.chapterTitle}\n\n${endInfo.chapter}`
    }

    return await this.commitGeneric<BattleResponse>(lifeId, requestId, lifeRow.version, {
      life: working,
      historyKind: 'battle',
      historyLabel: `对战${battle0.enemy.name}`,
      playerInput: command.kind === 'skill' ? `使出「${MARTIAL_DEFS.get(command.martialId)?.name ?? command.martialId}」` : ({ attack: '普通攻击', defend: '防御', flee: '逃跑' } as const)[command.kind],
      historyText: narrative,
      build: (finalLife, finalMeta) => ({
        life: finalLife,
        battle,
        narrative,
        degraded,
        degradedReason,
        ended: finalLife.phase === 'ended',
        endInfo,
        availableEndings: this.availableEndings(finalLife),
        meta: finalMeta,
      }),
    })
  }

  // ---- 终局结算与记忆 ----

  settleReconcile(lifeId: string): { life: LifeState; meta: MetaState } {
    const tx = this.dbTransaction(() => {
      const row = this.repos.getLife(lifeId)
      if (!row) throw new HttpError(404, 'life_not_found', '这一世不存在')
      let life = row.data
      let meta = this.ensureMeta()
      if (life.phase === 'ended' && !this.repos.hasEvent(lifeId, 'life_end')) {
        meta = this.doEndSettlement(life, meta)
        life = { ...life, version: row.version + 1 }
        if (!this.repos.saveLife(life, row.version, this.now())) {
          throw new HttpError(409, 'version_conflict', '状态已更新')
        }
      }
      return { life: this.repos.getLife(lifeId)!.data, meta }
    })
    return tx()
  }

  async retryMemory(lifeId: string): Promise<{ processed: number; failed: number; meta: MetaState }> {
    this.getLife(lifeId)
    const tasks = this.repos.openMemoryTasks(lifeId)
    let processed = 0
    let failed = 0
    for (const task of tasks) {
      const entries = this.repos.seqRange(lifeId, task.fromSeq, task.toSeq)
      const sourceText = entries.map((h) => `${h.label}：${h.text}`).join('\n')
      if (!sourceText.trim()) {
        this.repos.markMemoryTask(task.id, 'done', null, this.now())
        processed++
        continue
      }
      const res = await extractMemories(this.provider, {
        sourceTitle: '前世一生',
        sourceText,
        timeoutMs: this.config.llmAuxTimeoutMs,
      })
      this.logUsage('memory', res.usage, lifeId)
      if (!res.ok) {
        this.repos.markMemoryTask(task.id, 'failed', res.error, this.now())
        this.repos.insertEvent(lifeId, 'memory_failed', res.error, this.now())
        failed++
        continue
      }
      const meta = this.ensureMeta()
      const nextMeta = await this.mergeMemories(meta, res.value, lifeId)
      this.repos.saveMeta(nextMeta)
      this.repos.markMemoryTask(task.id, 'done', null, this.now())
      processed++
    }
    return { processed, failed, meta: this.ensureMeta() }
  }

  private async mergeMemories(meta: MetaState, incoming: string[], lifeId: string): Promise<MetaState> {
    if (incoming.length === 0) return meta
    const projected = meta.memories.length + incoming.length
    if (projected <= MEMORY_MAX_TOTAL) {
      return applyLifeMemories(meta, incoming, { now: this.now(), genId: this.genId, maxTotal: MEMORY_MAX_TOTAL })
    }
    const merged = await mergeMemoriesLlm(this.provider, {
      memories: [...meta.memories.map((m) => m.text), ...incoming],
      maxTotal: MEMORY_MAX_TOTAL,
      timeoutMs: this.config.llmAuxTimeoutMs,
    })
    this.logUsage('memory', merged.usage, lifeId)
    if (merged.ok) {
      return applyLifeMemories(
        { ...meta, memories: [] },
        merged.value,
        { now: this.now(), genId: this.genId, maxTotal: MEMORY_MAX_TOTAL }
      )
    }
    return applyLifeMemories(meta, incoming, { now: this.now(), genId: this.genId, maxTotal: MEMORY_MAX_TOTAL })
  }

  // ---- 内部工具 ----

  private doEndSettlement(life: LifeState, meta: MetaState): MetaState {
    const newUnlocked = ORIGINS.filter((o) => o.unlockFlag && life.flags.includes(o.unlockFlag)).map(
      (o) => o.id
    )
    const next = settleLifeEnd(meta, life, this.now(), newUnlocked)
    this.repos.insertEvent(
      life.id,
      'life_end',
      JSON.stringify({ endType: life.endType, deathCause: life.deathCause, endingId: life.endingId }),
      this.now()
    )
    if (life.logSeq > life.memorySettledThroughSeq) {
      this.repos.insertMemoryTask(
        { id: this.genId(), lifeId: life.id, fromSeq: life.memorySettledThroughSeq, toSeq: life.logSeq },
        this.now()
      )
    }
    life.memorySettledThroughSeq = life.logSeq
    return next
  }

  private async buildEndInfo(life: LifeState): Promise<EndInfo> {
    const endingName =
      life.endType === 'ending'
        ? ENDINGS.find((e) => e.id === life.endingId)?.name ?? '一世终结'
        : life.deathCause === 'battle'
          ? '横死刀兵'
          : life.deathCause === 'starve'
            ? '饿殍雪夜'
            : '死于非命'
    const causeText =
      life.endType === 'ending'
        ? '此生功成'
        : `${life.deathCause === 'battle' ? '战败' : life.deathCause === 'starve' ? '断粮' : '祸事'}身亡`
    const attempt = await runEndingChapter({
      provider: this.provider,
      endingName,
      causeText,
      life,
      meta: this.ensureMeta(),
      timeoutMs: this.config.llmAuxTimeoutMs,
    })
    this.logUsage('ending', attempt.usage, life.id)
    if (attempt.kind === 'ok') {
      return {
        endType: (life.endType ?? 'death') as 'death' | 'ending',
        deathCause: life.deathCause,
        endingId: life.endingId,
        endingName,
        chapterTitle: attempt.value.title,
        chapter: attempt.value.narrative,
      }
    }
    const fallback =
      life.endType === 'ending'
        ? ENDINGS.find((e) => e.id === life.endingId)?.desc ?? '这一生，走到了终点。'
        : life.deathCause === 'battle'
          ? '江湖险恶，你终究没能避开那要命的一刀。'
          : life.deathCause === 'starve'
            ? '三天没吃到一口热饭，你倒在了没人看见的角落。'
            : '这一生，到此为止了。'
    return {
      endType: (life.endType ?? 'death') as 'death' | 'ending',
      deathCause: life.deathCause,
      endingId: life.endingId,
      endingName,
      chapterTitle: endingName,
      chapter: fallback,
    }
  }

  /** 供 GET 接口恢复事件呈现（刷新恢复用） */
  presentLifeEvent(life: LifeState): EventPresentation | null {
    return this.presentEvent(life)
  }

  /** 选择型结局中条件已满足者（作为行动出现，requirement §8） */
  availableEndings(life: LifeState): EndingOption[] {
    if (life.phase !== 'alive') return []
    return availableChosenEndings(life, ENDINGS, MARTIAL_DEFS).map((e) => ({
      id: e.id,
      name: e.name,
      desc: e.desc,
    }))
  }

  private presentEvent(life: LifeState): EventPresentation | null {
    if (!life.pendingEventId) return null
    const ev = EVENTS.find((e) => e.id === life.pendingEventId)
    if (!ev) return null
    return {
      id: ev.id,
      title: ev.title,
      text: ev.text,
      choices: ev.choices
        .map((c, index) => ({ index, label: c.label }))
        .filter((c) => choiceAvailable(life, ev.choices[c.index]!)),
    }
  }

  private logUsage(
    kind: string,
    usage: { promptTokens: number; completionTokens: number },
    lifeId: string
  ): void {
    this.repos.insertUsage(
      {
        lifeId,
        provider: this.provider.name,
        model: this.provider.model,
        kind,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        durationMs: null,
      },
      this.now()
    )
  }

  private claimOrReplay<T>(lifeId: string, requestId: string, kind: string): { replay: T | null } {
    const existing = this.repos.getRequest(lifeId, requestId)
    if (existing) {
      if (existing.status === 'done' && existing.response) {
        return { replay: JSON.parse(existing.response) as T }
      }
      throw new HttpError(409, 'request_in_progress', '相同 requestId 的请求正在处理中')
    }
    try {
      this.repos.claimRequest(lifeId, requestId, kind, this.now())
    } catch {
      throw new HttpError(409, 'request_in_progress', '相同 requestId 的请求正在处理中')
    }
    return { replay: null }
  }

  private async commitAct(
    lifeId: string,
    requestId: string,
    expectedVersion: number,
    args: {
      life: LifeState
      narrative: string
      degraded: boolean
      degradedReason: string | null
      suggestions: string[]
      facts: string[]
      historyKind: HistoryEntry['kind']
      historyLabel: string
      playerInput: string
      battleStarted: ActResponse['battleStarted']
      endInfo: EndInfo | null
      skipSummary?: boolean
    }
  ): Promise<ActResponse> {
    args.life.suggestedActions = args.life.phase === 'alive' && !args.life.pendingBattle ? [...args.suggestions] : []
    return this.commitGeneric<ActResponse>(lifeId, requestId, expectedVersion, {
      life: args.life,
      skipSummary: args.skipSummary,
      historyKind: args.historyKind,
      historyLabel: args.historyLabel,
      playerInput: args.playerInput,
      historyText: args.narrative || args.facts.join('；'),
      build: (finalLife, finalMeta) => ({
        life: finalLife,
        narrative: args.narrative || args.facts.join('；'),
        degraded: args.degraded,
        degradedReason: args.degradedReason,
        suggestions: args.suggestions,
        event: this.presentEvent(finalLife),
        battleStarted: args.battleStarted,
        ended: finalLife.phase === 'ended',
        endInfo: args.endInfo,
        availableEndings: this.availableEndings(finalLife),
        meta: finalMeta,
      }),
    })
  }

  private async commitGeneric<T>(
    lifeId: string,
    requestId: string,
    expectedVersion: number,
    args: {
      life: LifeState
      skipSummary?: boolean
      historyKind: HistoryEntry['kind']
      historyLabel: string
      historyText: string
      playerInput?: string
      build: (life: LifeState, meta: MetaState) => T
    }
  ): Promise<T> {
    const tx = this.dbTransaction(() => {
      const fresh = this.repos.getLife(lifeId)
      if (!fresh || fresh.version !== expectedVersion || fresh.data.phase !== 'alive') {
        throw new HttpError(409, 'version_conflict', '状态已更新，本次行动未提交，请刷新重试')
      }
      const life = structuredCloneLife(args.life)
      life.version = fresh.version + 1
      if (args.historyKind === 'battle') life.suggestedActions = []
      pushHistoryEntry(life, args.historyKind, args.historyLabel, args.historyText)
      life.history[life.history.length - 1]!.playerInput = args.playerInput
      let meta = this.ensureMeta()
      if (life.phase === 'ended' && !this.repos.hasEvent(lifeId, 'life_end')) {
        meta = this.doEndSettlement(life, meta)
      }
      if (!this.repos.saveLife(life, fresh.version, this.now())) {
        throw new HttpError(409, 'version_conflict', '状态已更新，本次行动未提交')
      }
      this.repos.saveMeta(meta)
      const last = life.history[life.history.length - 1]
      if (last) this.repos.insertTurnLog(lifeId, last, requestId, this.now())
      const response = args.build(life, meta)
      this.repos.completeRequest(lifeId, requestId, JSON.stringify(response), this.now())
      return { response, life }
    })
    const { response, life } = tx()
    if (!args.skipSummary && life.logSeq % SUMMARY_EVERY_ACTIONS === 0 && life.phase === 'alive') {
      await this.trySummarize(lifeId, life)
    }
    return response
  }

  private async trySummarize(lifeId: string, life: LifeState): Promise<void> {
    const entries = this.repos
      .seqRange(lifeId, life.summarizedThroughSeq, life.logSeq)
      .map((h) => ({ label: h.label, text: h.text }))
    if (entries.length === 0) return
    const res = await summarizeHistory(this.provider, {
      existingSummary: life.summary,
      entries,
      timeoutMs: this.config.llmAuxTimeoutMs,
    })
    this.logUsage('summary', res.usage, lifeId)
    if (!res.ok) {
      this.repos.insertEvent(lifeId, 'summary_failed', res.error, this.now())
      return
    }
    const row = this.repos.getLife(lifeId)
    if (!row) return
    this.repos.saveLifeDataOnly(
      { ...row.data, summary: res.value, summarizedThroughSeq: life.logSeq },
      this.now()
    )
  }

  private dbTransaction<T>(fn: () => T): () => T {
    const tx = this.db.transaction(fn)
    return () => tx() as T
  }
}

function pushHistoryEntry(
  life: LifeState,
  kind: HistoryEntry['kind'],
  label: string,
  text: string,
  degraded = false
): void {
  life.logSeq += 1
  life.history.push({
    seq: life.logSeq,
    day: life.day,
    slot: life.slot,
    kind,
    label,
    text,
    degraded,
  })
  if (life.history.length > 60) life.history.shift()
}
