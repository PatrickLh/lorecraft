/**
 * 游戏编排服务（plan P2）：
 * - 权威状态在服务端，事务原子提交（快照/记录/奖励/继承同事务）
 * - LLM 调用在事务外，提交前重新校验版本
 * - requestId 幂等 + 版本校验防双击/并发多扣寿命
 */
import type Database from 'better-sqlite3'
import {
  applyTurn,
  applyWorldFirstClear,
  createMetaState,
  createRunState,
  enterWorld,
  fallbackMerge,
  INPUT_MAX_CHARS,
  isPrototypeComplete,
  MEMORY_MAX_TOTAL,
  registerDeath,
  registerRunStart,
  SUMMARY_EVERY_TURNS,
  unlockedWorldIds,
  type MemoryRecord,
  type MetaState,
  type RunState,
  type TurnOutcome,
  type TurnRecord,
} from '@lorecraft/core'
import {
  extractMemories,
  mergeMemoriesLlm,
  runTurnAttempt,
  summarizeHistory,
  type LlmProvider,
} from '@lorecraft/llm'
import { getWorld, WORLDS } from '@lorecraft/worlddata'
import type { AppConfig } from './config.js'
import { HttpError } from './errors.js'
import type { Repos } from './repos.js'

export interface TurnHooks {
  onDelta?: (text: string) => void
}

export interface WorldCard {
  id: string
  title: string
  theme: string
  intro: string
  unlocked: boolean
  permanentlyCleared: boolean
  clearedThisRun: boolean | null
  entryActions: string[]
}

export interface TurnResponse {
  run: RunState
  record: TurnRecord
  outcome: TurnOutcome
  actAdvancedTo: number | null
  degraded: boolean
  degradedReason: string | null
  suggestedActions: string[]
  worldCompleted: {
    worldId: string
    title: string
    lifespanReward: number
    firstClearCapBonusGranted: boolean
  } | null
  prototypeComplete: boolean
  meta: MetaState
}

export interface ServiceDeps {
  db: Database.Database
  config: AppConfig
  provider: LlmProvider
  repos: Repos
  now?: () => string
  genId?: () => string
}

export class GameService {
  private readonly db: Database.Database
  private readonly repos: Repos
  private readonly config: AppConfig
  private readonly provider: LlmProvider
  private readonly now: () => string
  private readonly genId: () => string

  constructor(deps: ServiceDeps) {
    this.db = deps.db
    this.repos = deps.repos
    this.config = deps.config
    this.provider = deps.provider
    this.now = deps.now ?? (() => new Date().toISOString())
    this.genId = deps.genId ?? (() => crypto.randomUUID())
  }

  // ---- meta / worlds ----

  private ensureMeta(): MetaState {
    const meta = this.repos.loadMeta()
    if (meta) return meta
    const created = createMetaState(this.now())
    this.repos.saveMeta(created)
    return created
  }

  getMeta(): {
    meta: MetaState
    unlockedWorldIds: string[]
    prototypeComplete: boolean
    activeRunId: string | null
    openMemoryTaskCount: number
  } {
    const meta = this.ensureMeta()
    const unlocked = unlockedWorldIds(meta, WORLDS)
    const active = this.repos.getActiveRun()
    return {
      meta,
      unlockedWorldIds: [...unlocked],
      prototypeComplete: isPrototypeComplete(meta, WORLDS.length),
      activeRunId: active?.id ?? null,
      openMemoryTaskCount: this.repos.openMemoryTaskCount(),
    }
  }

  listWorlds(): WorldCard[] {
    const { meta, unlockedWorldIds } = this.getMeta()
    const unlocked = new Set(unlockedWorldIds)
    const run = this.repos.getActiveRun()
    return WORLDS.map((w) => ({
      id: w.id,
      title: w.title,
      theme: w.theme,
      intro: w.intro,
      unlocked: unlocked.has(w.id),
      permanentlyCleared: meta.permanentClearedWorlds.includes(w.id),
      clearedThisRun: run ? run.data.worldCompletions.includes(w.id) : null,
      entryActions: w.entryActions,
    }))
  }

  // ---- run 生命周期 ----

  createRun(): { run: RunState; meta: MetaState } {
    const tx = this.dbTransaction(() => {
      const active = this.repos.getActiveRun()
      if (active) {
        // plan §2：死亡才结束 run；但三个世界全部永久通关后允许开新局
        const meta = this.ensureMeta()
        if (!isPrototypeComplete(meta, WORLDS.length)) {
          throw new HttpError(
            409,
            'active_run_exists',
            '已有进行中的局；死亡或完成全部世界后才能开启新局'
          )
        }
      }
      const meta0 = this.ensureMeta()
      const meta = registerRunStart(meta0)
      const run = createRunState(this.genId(), meta.lifespanCap, this.now())
      this.repos.insertRun(run, this.now())
      this.repos.saveMeta(meta)
      return { run, meta }
    })
    return tx()
  }

  getActiveRun(): RunState | null {
    return this.repos.getActiveRun()?.data ?? null
  }

  getRun(id: string): RunState {
    const row = this.repos.getRun(id)
    if (!row) throw new HttpError(404, 'run_not_found', '局不存在')
    return row.data
  }

  enterWorld(runId: string, worldId: string): RunState {
    const world = getWorld(worldId)
    if (!world) throw new HttpError(404, 'world_not_found', `世界不存在：${worldId}`)
    const tx = this.dbTransaction(() => {
      const row = this.repos.getRun(runId)
      if (!row) throw new HttpError(404, 'run_not_found', '局不存在')
      const meta = this.ensureMeta()
      const unlocked = unlockedWorldIds(meta, WORLDS).has(worldId)
      const res = enterWorld(row.data, world, { unlocked })
      if (!res.ok) {
        const map: Record<string, { status: 403 | 409; code: string; message: string }> = {
          world_locked: { status: 403, code: 'world_locked', message: '该世界尚未解锁' },
          already_completed_this_run: {
            status: 409,
            code: 'already_completed_this_run',
            message: '本局已完成过该世界',
          },
          not_in_hub: { status: 409, code: 'not_in_hub', message: '只有在枢纽中才能进入世界' },
        }
        const e = map[res.error]
        if (!e) throw new HttpError(409, res.error, '无法进入该世界')
        throw new HttpError(e.status, e.code, e.message)
      }
      const nextRun: RunState = { ...res.run, version: row.version + 1 }
      if (!this.repos.saveRun(nextRun, row.version, this.now())) {
        throw new HttpError(409, 'version_conflict', '状态已更新，请刷新')
      }
      return nextRun
    })
    return tx()
  }

  // ---- 回合 ----

  async submitTurn(
    runId: string,
    requestId: string,
    clientVersion: number,
    input: string,
    hooks?: TurnHooks
  ): Promise<TurnResponse> {
    const text = input.trim()
    if (!text) throw new HttpError(400, 'empty_input', '输入不能为空')
    if (text.length > INPUT_MAX_CHARS) {
      throw new HttpError(400, 'input_too_long', `输入最多 ${INPUT_MAX_CHARS} 字`)
    }

    // 幂等重放：已完成的请求直接返回已提交结果（plan P2）
    const existing = this.repos.getRequest(runId, requestId)
    if (existing) {
      if (existing.status === 'done' && existing.response) {
        return JSON.parse(existing.response) as TurnResponse
      }
      throw new HttpError(409, 'request_in_progress', '相同 requestId 的请求正在处理中')
    }

    const runRow = this.repos.getRun(runId)
    if (!runRow) throw new HttpError(404, 'run_not_found', '局不存在')
    if (runRow.data.phase !== 'in_world') {
      throw new HttpError(409, 'not_in_world', '当前不在世界内，无法提交行动')
    }
    if (clientVersion !== runRow.version) {
      throw new HttpError(
        409,
        'version_conflict',
        `状态已更新（服务端版本 ${runRow.version}），请刷新后重试`
      )
    }

    // 占位 claim（唯一约束防并发双击）
    try {
      this.repos.claimRequest(runId, requestId, 'turn', this.now())
    } catch {
      throw new HttpError(409, 'request_in_progress', '相同 requestId 的请求正在处理中')
    }

    const run = runRow.data
    const worldId = run.currentWorldId ?? ''
    const world = getWorld(worldId)
    if (!world) {
      this.repos.releaseRequest(runId, requestId)
      throw new HttpError(500, 'world_missing', `世界数据缺失：${worldId}`)
    }
    const meta = this.ensureMeta()

    // LLM 在事务外调用（plan P2）
    const started = Date.now()
    const attempt = await runTurnAttempt({
      provider: this.provider,
      world,
      run,
      meta,
      playerInput: text,
      timeoutMs: this.config.llmTimeoutMs,
      onNarrativeDelta: hooks?.onDelta,
    })
    this.repos.insertUsage(
      {
        runId,
        provider: this.provider.name,
        model: this.provider.model,
        kind: 'turn',
        promptTokens: attempt.usage.promptTokens,
        completionTokens: attempt.usage.completionTokens,
        durationMs: Date.now() - started,
      },
      this.now()
    )

    let response!: TurnResponse
    try {
      const tx = this.dbTransaction(() => {
        // 提交前重新校验版本（plan P2）
        const fresh = this.repos.getRun(runId)
        if (!fresh || fresh.version !== runRow.version || fresh.data.phase !== 'in_world') {
          throw new HttpError(409, 'version_conflict', '状态已更新，本回合未提交，请刷新后重试')
        }
        const freshMeta = this.ensureMeta()
        const decl = attempt.kind === 'ok' ? attempt.decl : null
        const result = applyTurn(fresh.data, world, {
          decl,
          playerInput: text,
          now: this.now(),
          newItemId: this.genId,
        })

        let nextMeta = freshMeta
        let worldCompleted: TurnResponse['worldCompleted'] = null
        let settled = fresh.data.memorySettledThroughTurn
        if (result.outcome.kind === 'world_completed') {
          const fc = applyWorldFirstClear(nextMeta, result.outcome.worldId)
          nextMeta = fc.meta
          worldCompleted = {
            worldId: result.outcome.worldId,
            title: world.title,
            lifespanReward: result.outcome.lifespanReward,
            firstClearCapBonusGranted: fc.granted,
          }
          this.repos.insertEvent(runId, 'world_settled', JSON.stringify(worldCompleted), this.now())
          this.repos.insertMemoryTask(
            {
              id: this.genId(),
              runId,
              kind: 'world',
              worldId,
              fromTurn: settled,
              toTurn: result.record.turn,
            },
            this.now()
          )
          settled = result.record.turn
        }
        if (result.outcome.kind === 'dead') {
          nextMeta = registerDeath(nextMeta)
          this.repos.insertEvent(
            runId,
            'death',
            JSON.stringify({ cause: result.outcome.cause }),
            this.now()
          )
          this.repos.insertMemoryTask(
            {
              id: this.genId(),
              runId,
              kind: 'death',
              worldId: null,
              fromTurn: settled,
              toTurn: result.record.turn,
            },
            this.now()
          )
          settled = result.record.turn
        }

        const nextRun: RunState = {
          ...result.run,
          version: fresh.version + 1,
          memorySettledThroughTurn: settled,
        }
        if (!this.repos.saveRun(nextRun, fresh.version, this.now())) {
          throw new HttpError(409, 'version_conflict', '状态已更新，本回合未提交')
        }
        this.repos.saveMeta(nextMeta)
        this.repos.insertTurnLog(runId, result.record, requestId, this.now())

        response = {
          run: nextRun,
          record: result.record,
          outcome: result.outcome,
          actAdvancedTo: result.actAdvancedTo,
          degraded: attempt.kind === 'degraded',
          degradedReason: attempt.kind === 'degraded' ? attempt.reason : null,
          suggestedActions:
            attempt.kind === 'ok' ? (attempt.decl.suggestedActions ?? []) : [],
          worldCompleted,
          prototypeComplete: isPrototypeComplete(nextMeta, WORLDS.length),
          meta: nextMeta,
        }
        this.repos.completeRequest(runId, requestId, JSON.stringify(response), this.now())
      })
      tx()
    } catch (e) {
      // 版本冲突等失败释放 claim，让客户端可以用同一 requestId 重试
      this.repos.releaseRequest(runId, requestId)
      throw e
    }

    // 滚动摘要：提交后尝试（plan P3，失败保留旧摘要）
    if (response.run.turn % SUMMARY_EVERY_TURNS === 0 && response.run.phase !== 'dead') {
      await this.trySummarize(runId, response.run)
    }
    return response
  }

  // ---- 结算兜底（幂等 reconcile，plan P2 /settle） ----

  settleReconcile(runId: string): { run: RunState; meta: MetaState } {
    const tx = this.dbTransaction(() => {
      const row = this.repos.getRun(runId)
      if (!row) throw new HttpError(404, 'run_not_found', '局不存在')
      let run = row.data
      let meta = this.ensureMeta()
      let changed = false
      if (run.phase === 'dead' && !this.repos.hasEvent(runId, 'death')) {
        meta = registerDeath(meta)
        const cause = run.deathCause ?? 'lifespan'
        this.repos.insertEvent(runId, 'death', JSON.stringify({ cause }), this.now())
        if (!this.repos.hasMemoryTask(runId)) {
          this.repos.insertMemoryTask(
            {
              id: this.genId(),
              runId,
              kind: 'death',
              worldId: null,
              fromTurn: run.memorySettledThroughTurn,
              toTurn: run.turn,
            },
            this.now()
          )
        }
        run = { ...run, version: row.version + 1, memorySettledThroughTurn: run.turn }
        this.repos.saveRun(run, row.version, this.now())
        this.repos.saveMeta(meta)
        changed = true
      }
      if (!changed) {
        meta = this.ensureMeta()
      }
      return { run: this.repos.getRun(runId)!.data, meta }
    })
    return tx()
  }

  // ---- 记忆任务重试（plan P2 /memory/retry；不重复发奖） ----

  async retryMemory(runId: string): Promise<{ processed: number; failed: number; meta: MetaState }> {
    this.getRun(runId) // 404 check
    const tasks = this.repos.openMemoryTasks(runId)
    let processed = 0
    let failed = 0
    for (const task of tasks) {
      const records = this.repos.turnRange(runId, task.fromTurn, task.toTurn)
      const sourceText = records
        .map((r) => `第${r.turn}回合｜玩家：「${r.playerInput}」｜${r.narrative}`)
        .join('\n')
      if (!sourceText.trim()) {
        this.repos.markMemoryTask(task.id, 'done', null, this.now())
        processed++
        continue
      }
      const title =
        task.kind === 'death'
          ? '本局终结经历'
          : `《${getWorld(task.worldId ?? '')?.title ?? task.worldId}》通关经历`
      const res = await extractMemories(this.provider, {
        sourceTitle: title,
        sourceText,
        timeoutMs: this.config.llmAuxTimeoutMs,
      })
      this.repos.insertUsage(
        {
          runId,
          provider: this.provider.name,
          model: this.provider.model,
          kind: 'memory',
          promptTokens: res.usage.promptTokens,
          completionTokens: res.usage.completionTokens,
          durationMs: null,
        },
        this.now()
      )
      if (!res.ok) {
        this.repos.markMemoryTask(task.id, 'failed', res.error, this.now())
        this.repos.insertEvent(runId, 'memory_failed', res.error, this.now())
        failed++
        continue
      }
      const meta = this.ensureMeta()
      const nextMeta = await this.mergeIntoMeta(meta, res.value, task.worldId ?? 'death')
      this.repos.saveMeta(nextMeta)
      this.repos.markMemoryTask(task.id, 'done', null, this.now())
      processed++
    }
    return { processed, failed, meta: this.ensureMeta() }
  }

  /** 新记忆并入继承层；超上限先尝试 LLM 合并，失败走去重+淘汰最旧（plan §2） */
  private async mergeIntoMeta(
    meta: MetaState,
    incoming: string[],
    source: string
  ): Promise<MetaState> {
    if (incoming.length === 0) return meta
    const projected = meta.memories.length + incoming.length
    if (projected <= MEMORY_MAX_TOTAL) {
      return {
        ...meta,
        memories: fallbackMerge(meta.memories, incoming, {
          source,
          now: this.now(),
          genId: this.genId,
        }),
      }
    }
    const merged = await mergeMemoriesLlm(this.provider, {
      memories: [...meta.memories.map((m: MemoryRecord) => m.text), ...incoming],
      maxTotal: MEMORY_MAX_TOTAL,
      timeoutMs: this.config.llmAuxTimeoutMs,
    })
    this.repos.insertUsage(
      {
        runId: null,
        provider: this.provider.name,
        model: this.provider.model,
        kind: 'memory',
        promptTokens: merged.usage.promptTokens,
        completionTokens: merged.usage.completionTokens,
        durationMs: null,
      },
      this.now()
    )
    if (merged.ok) {
      return {
        ...meta,
        memories: merged.value.map((text) => ({
          id: this.genId(),
          text,
          source: 'merged',
          createdAt: this.now(),
        })),
      }
    }
    return {
      ...meta,
      memories: fallbackMerge(meta.memories, incoming, {
        source,
        now: this.now(),
        genId: this.genId,
      }),
    }
  }

  private async trySummarize(runId: string, run: RunState): Promise<void> {
    const turns = this.repos.turnRange(runId, run.summarizedThroughTurn, run.turn)
    if (turns.length === 0) return
    const res = await summarizeHistory(this.provider, {
      existingSummary: run.summary,
      turns: turns.map((t) => ({ turn: t.turn, playerInput: t.playerInput, narrative: t.narrative })),
      timeoutMs: this.config.llmAuxTimeoutMs,
    })
    this.repos.insertUsage(
      {
        runId,
        provider: this.provider.name,
        model: this.provider.model,
        kind: 'summary',
        promptTokens: res.usage.promptTokens,
        completionTokens: res.usage.completionTokens,
        durationMs: null,
      },
      this.now()
    )
    if (!res.ok) {
      this.repos.insertEvent(runId, 'summary_failed', res.error, this.now())
      return
    }
    const row = this.repos.getRun(runId)
    if (!row) return
    this.repos.saveRunDataOnly(
      { ...row.data, summary: res.value, summarizedThroughTurn: run.turn },
      this.now()
    )
  }

  private dbTransaction<T>(fn: () => T): () => T {
    const tx = this.db.transaction(fn)
    return () => tx() as T
  }
}
