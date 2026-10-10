/** 全局响应式状态（plan P4：刷新恢复、状态区分、服务端快照权威）。 */
import { reactive } from 'vue'
import { ApiError, api, streamTurn } from './api.js'
import type {
  DeathCause,
  MetaInfo,
  RunState,
  TurnUiState,
  WorldCard,
} from './types.js'

export interface LogEntry {
  id: number
  kind: 'player' | 'narrative' | 'system'
  text: string
  /** 流式暂存中的叙事（最终结果到达后替换） */
  pending: boolean
}

interface AppState {
  booted: boolean
  loading: boolean
  error: string | null
  metaInfo: MetaInfo | null
  worlds: WorldCard[]
  run: RunState | null
  /** 回合 UI 状态机 */
  ui: TurnUiState
  stagedNarrative: string
  /** 最近一次回合/入场给出的建议行动 */
  suggestions: string[]
  log: LogEntry[]
  notices: { id: number; text: string; bad: boolean }[]
  deathCause: DeathCause | null
  deathNarrative: string | null
  lastDegradedReason: string | null
}

export const state = reactive<AppState>({
  booted: false,
  loading: false,
  error: null,
  metaInfo: null,
  worlds: [],
  run: null,
  ui: 'idle',
  stagedNarrative: '',
  suggestions: [],
  log: [],
  notices: [],
  deathCause: null,
  deathNarrative: null,
  lastDegradedReason: null,
})

let seq = 1

function pushLog(kind: LogEntry['kind'], text: string, pending = false): LogEntry {
  const entry: LogEntry = { id: seq++, kind, text, pending }
  state.log.push(entry)
  return entry
}

function notice(text: string, bad = false): void {
  state.notices.push({ id: seq++, text, bad })
}

function clearNotices(): void {
  state.notices = []
}

export function currentWorldCard(): WorldCard | null {
  if (!state.run?.currentWorldId) return null
  return state.worlds.find((w) => w.id === state.run?.currentWorldId) ?? null
}

/** 启动：拉取继承层与活跃局（刷新恢复，plan P4） */
export async function boot(): Promise<void> {
  state.loading = true
  state.error = null
  try {
    const [metaInfo, worlds] = await Promise.all([api.getMeta(), api.getWorlds()])
    state.metaInfo = metaInfo
    state.worlds = worlds
    const run = await api.getActiveRun()
    state.run = run
    if (run?.phase === 'dead') {
      state.deathCause = run.deathCause
      state.deathNarrative = run.deathNarrative
    }
    // 恢复世界内的最近叙事（最近 6 条）
    if (run && run.phase === 'in_world') {
      for (const r of run.history.slice(-6)) {
        pushLog('player', r.playerInput)
        pushLog('narrative', r.narrative)
      }
    }
    state.booted = true
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e)
  } finally {
    state.loading = false
  }
}

async function refreshMetaInfo(): Promise<void> {
  state.metaInfo = await api.getMeta()
  state.worlds = await api.getWorlds()
}

export async function newRun(): Promise<void> {
  state.loading = true
  try {
    const run = await api.createRun()
    state.run = run
    state.deathCause = null
    state.deathNarrative = null
    state.log = []
    state.notices = []
    await refreshMetaInfo()
  } catch (e) {
    notice(e instanceof ApiError ? e.message : String(e), true)
  } finally {
    state.loading = false
  }
}

export async function enterWorld(worldId: string): Promise<void> {
  if (!state.run) return
  state.loading = true
  try {
    const run = await api.enterWorld(state.run.id, worldId)
    state.run = run
    state.log = []
    state.notices = []
    const card = currentWorldCard()
    if (card) {
      pushLog('system', `—— 《${card.title}》· ${card.theme} ——`)
      pushLog('narrative', card.intro)
      state.suggestions = [...card.entryActions]
    }
  } catch (e) {
    notice(e instanceof ApiError ? e.message : String(e), true)
  } finally {
    state.loading = false
  }
}

/** 提交行动：SSE 暂存流 → 服务端权威快照（plan P4） */
export async function submit(input: string): Promise<void> {
  const run = state.run
  if (!run || run.phase !== 'in_world') return
  if (state.ui !== 'idle') return // 提交后禁止重复操作
  const text = input.trim()
  if (!text) return

  state.ui = 'waiting'
  state.stagedNarrative = ''
  state.lastDegradedReason = null
  clearNotices()
  pushLog('player', text)
  const pendingEntry = pushLog('narrative', '', true)

  const requestId = crypto.randomUUID()
  try {
    const result = await streamTurn({
      runId: run.id,
      requestId,
      clientVersion: run.version,
      input: text,
      onDelta: (t) => {
        state.ui = 'streaming'
        state.stagedNarrative += t
        pendingEntry.text = state.stagedNarrative
      },
    })

    // 服务端快照权威：替换暂存叙事
    pendingEntry.pending = false
    pendingEntry.text = result.record.narrative
    state.run = result.run
    if (result.suggestedActions.length > 0) state.suggestions = result.suggestedActions
    state.metaInfo = {
      ...(state.metaInfo as MetaInfo),
      meta: result.meta,
      prototypeComplete: result.prototypeComplete,
    }

    if (result.degraded) {
      state.ui = 'degraded'
      state.lastDegradedReason = result.degradedReason
    } else {
      state.ui = 'idle'
    }

    if (result.actAdvancedTo !== null) {
      const card = currentWorldCard()
      notice(`【幕转换】剧情推进到新的阶段。`)
      void card
    }
    if (result.outcome.kind === 'world_completed' && result.worldCompleted) {
      const wc = result.worldCompleted
      let msg = `已通关《${wc.title}》，当前寿命 +${wc.lifespanReward}`
      if (wc.firstClearCapBonusGranted) msg += '；首次永久通关：寿命上限 +5（下一局生效）'
      notice(msg)
      if (result.prototypeComplete) notice('★ 原型完成：三个世界均已通关。可以开启新局继续轮回。')
      state.run = { ...state.run, phase: 'hub', visit: null, currentWorldId: null }
    }
    if (result.outcome.kind === 'dead') {
      state.deathCause = result.outcome.cause
      state.deathNarrative = result.run.deathNarrative
      state.run = result.run
    }
  } catch (e) {
    pendingEntry.pending = false
    if (e instanceof ApiError && e.code === 'version_conflict') {
      // 状态已变：以服务端为准恢复
      await resync()
      notice('状态已过期，已恢复到服务器最新进度。请重新输入行动。', true)
    } else if (e instanceof ApiError && (e.code === 'network' || e.code === 'stream_truncated')) {
      // 断流：查询服务端结果，避免直接新建行动导致重复扣除（plan P4）
      state.ui = 'connection_lost'
      notice('与服务器的连接中断。正在查询该行动是否已提交……', true)
      const synced = await resync()
      if (synced) notice('已恢复到服务器最新进度。')
    } else {
      pendingEntry.text = pendingEntry.text || '（此回合未能完成。）'
      notice(e instanceof ApiError ? e.message : String(e), true)
      state.ui = 'idle'
    }
  }
}

/** 断流/版本冲突后的恢复：拉取服务端权威快照 */
export async function resync(): Promise<boolean> {
  try {
    const run = await api.getActiveRun()
    state.run = run
    if (run?.phase === 'dead') {
      state.deathCause = run.deathCause
      state.deathNarrative = run.deathNarrative
    }
    await refreshMetaInfo()
    state.ui = 'idle'
    return true
  } catch {
    return false
  }
}

export async function retryMemory(): Promise<void> {
  if (!state.run && !state.metaInfo?.activeRunId) return
  const id = state.run?.id ?? state.metaInfo?.activeRunId
  if (!id) return
  try {
    const r = await api.retryMemory(id)
    await refreshMetaInfo()
    notice(
      r.failed > 0
        ? `记忆提炼仍有 ${r.failed} 项待重试。`
        : `记忆提炼完成（${r.processed} 项）。`
    )
  } catch (e) {
    notice(e instanceof ApiError ? e.message : String(e), true)
  }
}
