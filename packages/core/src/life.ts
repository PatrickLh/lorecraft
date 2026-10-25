/**
 * 一世生命周期（plan P1）：出身开局、时间推进（时段/温饱/衰老/善终）、
 * 固定行动结算、事件结算、结局检查、履历。
 */
import {
  ATTR_MAX,
  BASE_ATTRS,
  DAYS_PER_YEAR,
  FOOD_MAX,
  FOOD_TICK_SLOTS,
  GOOD_DEATH_AGE,
  LIFE_SUMMARY_KEY_EVENTS_MAX,
  SLOTS_PER_DAY,
  STARVE_DEATH_DAYS,
  STARVE_HP_LOSS_PER_DAY,
  START_AGE,
} from './constants.js'
import { ageOf } from './calendar.js'
import type {
  ActionDefView,
  EndingDef,
  EventChoiceView,
  EventDefView,
  GrowKey,
  HistoryEntry,
  LifeState,
  LifeSummary,
  MartialDef,
  MetaState,
  OriginDefView,
  OutcomeView,
} from './types.js'
import { applyGrow, ensureGrowthToday, rollTrainGrowth } from './growth.js'
import type { Rng } from './battle.js'

export function createLife(id: string, origin: OriginDefView, now: string): LifeState {
  const attrs: LifeState['attrs'] = { ...BASE_ATTRS }
  for (const [k, v] of Object.entries(origin.attrDelta ?? {})) {
    const key = k as keyof typeof BASE_ATTRS
    attrs[key] = Math.min(ATTR_MAX, attrs[key] + (v ?? 0))
  }
  return {
    id,
    version: 1,
    phase: 'alive',
    createdAt: now,
    originId: origin.id,
    destinyId: origin.destiny,
    day: 0,
    slot: 0,
    attrs,
    food: origin.food,
    money: origin.money,
    rep: origin.rep,
    factions: { ...(origin.factions ?? {}) },
    npcs: { ...(origin.npcs ?? {}) },
    sectId: null,
    locationId: origin.locationId,
    martials: origin.martials ? origin.martials.map((m) => ({ ...m })) : [],
    flags: [],
    pendingEventId: null,
    eventCooldowns: {},
    injured: false,
    starveDays: 0,
    pendingBattle: null,
    growthToday: { day: 0, llmUsed: 0, trained: {} },
    history: [],
    logSeq: 0,
    summary: null,
    summarizedThroughSeq: 0,
    memorySettledThroughSeq: 0,
    endType: null,
    deathCause: null,
    endingId: null,
    endedAtDay: null,
    endNarrative: null,
  }
}

export function pushHistory(
  life: LifeState,
  kind: HistoryEntry['kind'],
  label: string,
  text: string,
  degraded = false
): void {
  life.logSeq += 1
  const entry: HistoryEntry = {
    seq: life.logSeq,
    day: life.day,
    slot: life.slot,
    kind,
    label,
    text,
    degraded,
  }
  life.history.push(entry)
  if (life.history.length > 60) life.history.shift()
}

export interface TimeTickResult {
  facts: string[]
  /** 断粮死亡 */
  diedOfStarve: boolean
  /** 年岁到了善终 */
  goodDeath: boolean
  /** 衰老事实 */
  decayFact: string | null
}

/**
 * 推进时段。每 2 时段温饱 -1；日切时结算断粮与 HP 流失；年切时衰老与善终。
 * 注意：会就地修改 life（调用方持有副本）。
 */
export function advanceTime(life: LifeState, slots: number): TimeTickResult {
  // 恢复温饱即打断连续断粮，不必等到下一次日切。
  if (life.food > 0) life.starveDays = 0
  const facts: string[] = []
  let diedOfStarve = false
  let goodDeath = false
  let decayFact: string | null = null
  for (let i = 0; i < slots; i++) {
    life.slot += 1
    if (life.slot % FOOD_TICK_SLOTS === 0 && life.food > 0) {
      life.food -= 1
    }
    if (life.slot >= SLOTS_PER_DAY) {
      life.slot = 0
      life.day += 1
      // 日切：断粮
      if (life.food <= 0) {
        life.starveDays += 1
        life.attrs.hp = Math.max(0, life.attrs.hp - STARVE_HP_LOSS_PER_DAY)
        facts.push(`饥肠辘辘（断粮第 ${life.starveDays} 天），生命 -${STARVE_HP_LOSS_PER_DAY}`)
        if (life.starveDays >= STARVE_DEATH_DAYS || life.attrs.hp <= 0) {
          diedOfStarve = true
        }
      } else {
        life.starveDays = 0
      }
      // 年切
      if (life.day % DAYS_PER_YEAR === 0) {
        const age = ageOf(life.day)
        facts.push(`新的一年到了，你 ${age} 岁了`)
        if (age >= GOOD_DEATH_AGE) {
          goodDeath = true
        }
      }
    }
  }
  return { facts, diedOfStarve, goodDeath, decayFact }
}

export interface FixedActionResult {
  life: LifeState
  facts: string[]
  /** 行动掷中的事件抽取机会（上层再从事件池选） */
  eventRoll: boolean
  /** 断粮死亡 / 年至善终（上层据此 markLifeEnd） */
  diedOfStarve: boolean
  goodDeath: boolean
  /** 银两不足等无法执行 */
  invalid?: string
}

/** 固定行动结算（修炼/用饭/做工/住宿等，requirement §5 层②） */
export function applyFixedAction(
  input: LifeState,
  action: ActionDefView,
  martialDefs: Map<string, MartialDef>,
  rng: Rng
): FixedActionResult {
  const life: LifeState = structuredCloneLife(input)
  const facts: string[] = []
  if (action.moneyCost && life.money < action.moneyCost) {
    return { life: input, facts, eventRoll: false, diedOfStarve: false, goodDeath: false, invalid: `银两不足（需 ${action.moneyCost} 两）` }
  }
  if (action.moneyCost) {
    life.money -= action.moneyCost
    facts.push(`花费 ${action.moneyCost} 两`)
  }
  if (action.foodGain) {
    life.food = Math.min(FOOD_MAX, life.food + action.foodGain)
    facts.push(`温饱恢复至 ${life.food}/${FOOD_MAX}`)
  }
  if (action.moneyGain) {
    const [lo, hi] = action.moneyGain
    const gain = lo + Math.floor(rng() * (hi - lo + 1))
    life.money += gain
    facts.push(`挣到 ${gain} 两银子（现有 ${life.money} 两）`)
  }
  if (action.hpGain) {
    const cap = life.injured ? Math.round(life.attrs.maxHp * 0.5) : life.attrs.maxHp
    life.attrs.hp = Math.min(cap, life.attrs.hp + action.hpGain)
    facts.push(`生命恢复至 ${life.attrs.hp}/${cap}`)
  }
  if (action.mpGain) {
    life.attrs.mp = Math.min(life.attrs.maxMp, life.attrs.mp + action.mpGain)
    facts.push(`真气恢复至 ${life.attrs.mp}/${life.attrs.maxMp}`)
  }
  if (action.healInjury) {
    if (life.injured) {
      life.injured = false
      facts.push('伤势痊愈，气血重新充盈（生命上限恢复）')
    } else {
      facts.push('并无大碍，调养了一番气血')
    }
  }
  if (action.growth) {
    if (rollTrainGrowth(life, action.growth.key, action.growth.chance, rng)) {
      applyGrow(life, action.growth.key, 1, 'train', martialDefs)
      facts.push(`修炼有所得：${growLabel(action.growth.key)} +1`)
    }
  }
  if (action.martialLevelChance && life.martials.length > 0) {
    if (rng() < action.martialLevelChance) {
      const upgradable = life.martials.filter((m) => m.level < 2)
      const pick = upgradable[Math.floor(rng() * upgradable.length)]
      if (pick) {
        const def = martialDefs.get(pick.id)
        pick.level = (pick.level + 1) as 0 | 1 | 2
        facts.push(`勤修不辍，「${def?.name ?? pick.id}」修为精进至${pick.level === 1 ? '小成' : '大成'}之境`)
      }
    }
  }
  const elapsedSlots = action.restToMorning ? SLOTS_PER_DAY - life.slot : action.slots ?? 1
  if (action.restToMorning) facts.push(`歇宿至翌日清晨（消耗 ${elapsedSlots} 个时段）`)
  const tick = advanceTime(life, elapsedSlots)
  if (tick.decayFact) facts.push(tick.decayFact)
  return {
    life,
    facts,
    eventRoll: (action.eventChance ?? 0) > 0 && rng() < (action.eventChance ?? 0),
    diedOfStarve: tick.diedOfStarve,
    goodDeath: tick.goodDeath,
  }
}

/** 「过一日」：消耗当日剩余时段 */
export function restOfDay(life: LifeState, rng: Rng): FixedActionResult {
  const remaining = SLOTS_PER_DAY - life.slot
  const life2: LifeState = structuredCloneLife(life)
  const facts: string[] = [`这一日就这么过去了（消耗 ${remaining} 个时辰）`]
  const tick = advanceTime(life2, remaining)
  facts.push(...tick.facts)
  return { life: life2, facts, eventRoll: false, diedOfStarve: tick.diedOfStarve, goodDeath: tick.goodDeath }
}

export interface OutcomeResult {
  life: LifeState
  facts: string[]
  /** 触发的战斗（敌人 id、是否致死、胜败追加 flag） */
  battle?: { enemyId: string; lethal: boolean; onWinFlags?: string[]; onLoseFlags?: string[] }
  died: boolean
  /** 断粮死亡（优先于 died 的 mischief 归因） */
  starved: boolean
  learned?: string
  learnFailed?: string
}

/** 事件选项结果结算（requirement §5 层①：手写事件自带成长）。reqDiscount：轮回继承的习得门槛减免 */
export function applyOutcome(
  input: LifeState,
  choice: EventChoiceView,
  martialDefs: Map<string, MartialDef>,
  rng: Rng,
  reqDiscount = 0
): OutcomeResult {
  const outcome = pickOutcome(choice, rng)
  const life: LifeState = structuredCloneLife(input)
  if (life.food > 0) life.starveDays = 0
  const facts: string[] = []
  let died = false
  let starved = false

  if (outcome.attrs) {
    for (const [k, v] of Object.entries(outcome.attrs)) {
      const key = k as GrowKey
      const delta = v ?? 0
      if (delta === 0) continue
      applyGrow(life, key, delta, 'event', martialDefs)
      facts.push(`${growLabel(key)} ${delta > 0 ? '+' : ''}${delta}`)
    }
  }
  if (outcome.hp) {
    const cap = life.injured ? Math.round(life.attrs.maxHp * 0.5) : life.attrs.maxHp
    life.attrs.hp = Math.max(0, Math.min(cap, life.attrs.hp + outcome.hp))
    facts.push(`生命 ${outcome.hp > 0 ? '+' : ''}${outcome.hp}（→ ${life.attrs.hp}）`)
    if (life.attrs.hp <= 0) died = true
  }
  if (outcome.mp) {
    life.attrs.mp = Math.min(life.attrs.maxMp, life.attrs.mp + outcome.mp)
    facts.push(`真气恢复至 ${life.attrs.mp}/${life.attrs.maxMp}`)
  }
  if (outcome.money) {
    life.money = Math.max(0, life.money + outcome.money)
    facts.push(`银两 ${outcome.money > 0 ? '+' : ''}${outcome.money}（现有 ${life.money} 两）`)
  }
  if (outcome.food) {
    life.food = Math.max(0, Math.min(FOOD_MAX, life.food + outcome.food))
    facts.push(`温饱 ${outcome.food > 0 ? '+' : ''}${outcome.food}`)
  }
  if (outcome.rep) {
    life.rep = Math.max(-100, Math.min(100, life.rep + outcome.rep))
    facts.push(`声望 ${outcome.rep > 0 ? '+' : ''}${outcome.rep}（${life.rep}）`)
  }
  if (outcome.factions) {
    for (const [id, delta] of Object.entries(outcome.factions)) {
      life.factions = {
        ...life.factions,
        [id]: Math.max(-100, Math.min(100, (life.factions[id] ?? 0) + (delta ?? 0))),
      }
      facts.push(`与 ${id} 的关系 ${((delta ?? 0) > 0 ? '+' : '') + (delta ?? 0)}`)
    }
  }
  if (outcome.npcs) {
    for (const [id, delta] of Object.entries(outcome.npcs)) {
      life.npcs = {
        ...life.npcs,
        [id]: Math.max(-100, Math.min(100, (life.npcs[id] ?? 0) + (delta ?? 0))),
      }
      facts.push(`${id} 对你的观感 ${((delta ?? 0) > 0 ? '+' : '') + (delta ?? 0)}`)
    }
  }
  if (outcome.sectJoin) {
    life.sectId = outcome.sectJoin
    facts.push(`你拜入 ${outcome.sectJoin} 门下`)
  }
  if (outcome.learn) {
    const def = martialDefs.get(outcome.learn.id)
    const existing = life.martials.find((m) => m.id === outcome.learn?.id)
    if (!def) {
      facts.push('机缘蒙尘，与此学无缘')
    } else if (!existing) {
      if (meetsMartialReqs(life, def, reqDiscount)) {
        life.martials = [...life.martials, { id: def.id, level: outcome.learn.level ?? 0 }]
        const tierName = def.tier >= 3 ? '一流' : def.tier === 2 ? '二流' : '三流'
        facts.push(`你领悟了「${def.name}」（${tierName}武学，入门）`)
      } else {
        facts.push(`「${def.name}」门槛未至（属性不足），强行参悟只会走火入魔，只得作罢`)
      }
    } else if (existing.level < 2) {
      existing.level = (existing.level + 1) as 0 | 1 | 2
      facts.push(`「${def.name}」更上一层楼（${existing.level === 1 ? '小成' : '大成'}）`)
    } else {
      facts.push('此学已臻大成，再无进境')
    }
  }
  if (outcome.injured) {
    life.injured = true
    facts.push('你受了内伤，生命上限临时受损（需医治）')
  }
  if (outcome.clearInjury && life.injured) {
    life.injured = false
    facts.push('伤势痊愈')
  }
  if (outcome.flags) {
    for (const f of outcome.flags) {
      if (!life.flags.includes(f)) life.flags.push(f)
    }
  }
  if (outcome.endDay) {
    const remaining = SLOTS_PER_DAY - life.slot
    const tick = advanceTime(life, remaining)
    facts.push(...tick.facts)
    if (tick.diedOfStarve) starved = true
  } else {
    const tick = advanceTime(life, 1)
    facts.push(...tick.facts)
    if (tick.diedOfStarve) starved = true
  }

  let battle: OutcomeResult['battle']
  if (outcome.battle) {
    battle = {
      enemyId: outcome.battle.enemy,
      lethal: outcome.battle.lethal ?? false,
      onWinFlags: outcome.battle.onWinFlags,
      onLoseFlags: outcome.battle.onLoseFlags,
    }
  }
  if (outcome.text) facts.unshift(outcome.text)
  return { life, facts, battle, died, starved }
}

function meetsMartialReqs(life: LifeState, def: MartialDef, discount: number): boolean {
  const req = (v: number | undefined, cur: number) => v === undefined || cur >= Math.max(1, v - discount)
  return (
    req(def.reqs.atk, life.attrs.atk) &&
    req(def.reqs.def, life.attrs.def) &&
    req(def.reqs.int, life.attrs.int) &&
    req(def.reqs.agi, life.attrs.agi)
  )
}

export function pickOutcome(choice: EventChoiceView, rng: Rng): OutcomeView {
  if (choice.outcome) return choice.outcome
  const pool = choice.randomOutcomes ?? []
  const total = pool.reduce((s, o) => s + o.weight, 0)
  let roll = rng() * total
  for (const o of pool) {
    roll -= o.weight
    if (roll <= 0) return o.outcome
  }
  const last = pool[pool.length - 1]
  return last?.outcome ?? {}
}

/** 达成型结局静默检查（priority 高者优先，plan §2 结局检查） */
export function checkAchievedEnding(
  life: LifeState,
  endings: EndingDef[],
  martialDefs: Map<string, MartialDef>
): EndingDef | null {
  const candidates = endings
    .filter((e) => e.kind === 'achieved')
    .filter((e) => endingCondMet(life, e, martialDefs))
    .sort((a, b) => b.priority - a.priority)
  return candidates[0] ?? null
}

/** 选择型结局的基础条件是否满足（满足才作为行动出现） */
export function chosenEndingAvailable(
  life: LifeState,
  ending: EndingDef,
  martialDefs: Map<string, MartialDef>
): boolean {
  return ending.kind === 'chosen' && endingCondMet(life, ending, martialDefs)
}

function endingCondMet(life: LifeState, e: EndingDef, martialDefs: Map<string, MartialDef>): boolean {
  const c = e.cond
  if (!c) return true
  if (c.atk !== undefined && life.attrs.atk < c.atk) return false
  if (c.int !== undefined && life.attrs.int < c.int) return false
  if (c.agi !== undefined && life.attrs.agi < c.agi) return false
  if (c.rep !== undefined && life.rep < c.rep) return false
  if (c.repMax !== undefined && life.rep > c.repMax) return false
  if (c.money !== undefined && life.money < c.money) return false
  if (c.ageMin !== undefined && ageOf(life.day) < c.ageMin) return false
  if (c.sect && life.sectId !== c.sect) return false
  if (c.faction) {
    const v = life.factions[c.faction.id] ?? 0
    if (v < (c.faction.min ?? 0)) return false
  }
  if (c.martialTierMin !== undefined) {
    const has = life.martials.some((m) => (martialDefs.get(m.id)?.tier ?? 0) >= c.martialTierMin!)
    if (!has) return false
  }
  return true
}

export function markLifeEnd(
  life: LifeState,
  endType: 'death' | 'ending',
  opts: { deathCause?: string; endingId?: string }
): void {
  life.phase = 'ended'
  life.endType = endType
  life.deathCause = opts.deathCause ?? null
  life.endingId = opts.endingId ?? null
  life.endedAtDay = life.day
}

export function buildLifeSummary(life: LifeState, index: number, now: string): LifeSummary {
  const keyEvents = life.history
    .filter((h) => h.kind === 'event')
    .slice(-LIFE_SUMMARY_KEY_EVENTS_MAX)
    .map((h) => h.label)
  return {
    index,
    originId: life.originId,
    destinyId: life.destinyId,
    startAge: START_AGE,
    endAge: ageOf(life.day),
    endType: life.endType ?? 'death',
    deathCause: life.deathCause,
    endingId: life.endingId,
    martials: life.martials.map((m) => ({ ...m })),
    peak: {
      atk: life.attrs.atk,
      def: life.attrs.def,
      int: life.attrs.int,
      agi: life.attrs.agi,
    },
    keyEvents,
    endedAt: now,
  }
}

/** 玩家当前可选的行动（选择型结局满足条件时追加） */
export function availableChosenEndings(
  life: LifeState,
  endings: EndingDef[],
  martialDefs: Map<string, MartialDef>
): EndingDef[] {
  return endings.filter((e) => chosenEndingAvailable(life, e, martialDefs))
}

export function growLabel(key: GrowKey): string {
  return {
    atk: '武力',
    def: '防御',
    int: '智力',
    agi: '敏捷',
    maxHp: '生命上限',
    maxMp: '真气上限',
  }[key]
}

export function structuredCloneLife(life: LifeState): LifeState {
  return {
    ...life,
    attrs: { ...life.attrs },
    characterNotes: life.characterNotes ? Object.fromEntries(Object.entries(life.characterNotes).map(([name, note]) => [name, { ...note }])) : undefined,
    factions: { ...life.factions },
    npcs: { ...life.npcs },
    martials: life.martials.map((m) => ({ ...m })),
    flags: [...life.flags],
    eventCooldowns: { ...life.eventCooldowns },
    pendingBattle: life.pendingBattle
      ? { ...life.pendingBattle, enemy: { ...life.pendingBattle.enemy }, rounds: [...life.pendingBattle.rounds] }
      : null,
    growthToday: {
      ...life.growthToday,
      trained: { ...life.growthToday.trained },
    },
    history: [...life.history],
  }
}

export function ensureGrowthDay(life: LifeState): void {
  ensureGrowthToday(life)
}
