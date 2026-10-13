/** v2.0 全局响应式状态（plan P4）：刷新恢复、状态机、服务端快照权威、自动滚屏数据源。 */
import { reactive } from 'vue'
import { ApiError, api, actPath, battlePath, streamCall } from './api.js'
import type {
  ActResponse,
  BattleResponse,
  BattleState,
  EndInfo,
  EventPresentation,
  LifeState,
  MetaInfo,
  TurnUiState,
  WorldCatalog,
} from './types.js'

export interface LogEntry {
  id: number
  kind: 'player' | 'narrative' | 'system' | 'battle'
  text: string
  pending: boolean
}

interface AppState {
  booted: boolean
  loading: boolean
  error: string | null
  metaInfo: MetaInfo | null
  catalog: WorldCatalog | null
  life: LifeState | null
  ui: TurnUiState
  stagedNarrative: string
  suggestions: string[]
  availableEndings: { id: string; name: string; desc: string }[]
  log: LogEntry[]
  notices: { id: number; text: string; bad: boolean }[]
  pendingEvent: EventPresentation | null
  battle: BattleState | null
  endInfo: EndInfo | null
  lastDegradedReason: string | null
  history: MetaInfo['meta']['history']
  showHistory: boolean
}

export const state = reactive<AppState>({
  booted: false,
  loading: false,
  error: null,
  metaInfo: null,
  catalog: null,
  life: null,
  ui: 'idle',
  stagedNarrative: '',
  suggestions: [],
  availableEndings: [],
  log: [],
  notices: [],
  pendingEvent: null,
  battle: null,
  endInfo: null,
  lastDegradedReason: null,
  history: [],
  showHistory: false,
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

export function clearNotices(): void {
  state.notices = []
}

export function toggleHistory(): void {
  if (!state.showHistory) {
    void api.getHistory().then((h) => {
      state.history = h
      state.showHistory = true
    })
  } else {
    state.showHistory = false
  }
}

export async function boot(): Promise<void> {
  state.loading = true
  state.error = null
  try {
    const [metaInfo, catalog] = await Promise.all([api.getMeta(), api.getCatalog()])
    state.metaInfo = metaInfo
    state.catalog = catalog
    const active = await api.getActiveLife()
    let life = active.life
    if (life && life.phase === 'ended') {
      // 结算兜底（崩溃恢复）：以服务端 reconcile 为准
      const r = await api.settle(life.id)
      life = r.life
      state.metaInfo = await api.getMeta()
    }
    state.life = life
    restoreHistory(life)
    state.battle = life?.pendingBattle ?? null
    state.pendingEvent = active.event
    state.availableEndings = active.availableEndings
    state.booted = true
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e)
  } finally {
    state.loading = false
  }
}

/** 刷新与重连共用恢复路径，重建而非追加，避免重复对话。 */
function restoreHistory(life: LifeState | null): void {
  state.log = []
  state.suggestions = life?.phase === 'alive' && !life.pendingBattle ? life.suggestedActions ?? [] : []
  state.stagedNarrative = ''
  state.ui = 'idle'
  state.lastDegradedReason = null
  for (const h of life?.history ?? []) {
    const choice = h.playerInput ?? (h.kind !== 'system' && h.label !== '自由行动' ? h.label : '')
    if (choice) pushLog('player', choice)
    pushLog(h.kind === 'battle' ? 'battle' : h.kind === 'system' ? 'system' : 'narrative', h.text)
  }
}

async function refreshMetaInfo(): Promise<void> {
  state.metaInfo = await api.getMeta()
}

export async function startLife(originId: string): Promise<void> {
  state.loading = true
  try {
    const life = await api.createLife(originId)
    state.life = life
    state.log = []
    state.notices = []
    state.endInfo = null
    state.battle = null
    state.pendingEvent = null
    state.suggestions = []
    state.availableEndings = []
    state.ui = 'idle'
    const origin = state.catalog?.origins.find((o) => o.id === originId)
    pushLog('system', `—— 新的一生 · ${origin?.name ?? originId} ——`)
    pushLog('narrative', `${origin?.desc ?? ''}\n你十六岁，孤身一人，落在了钱塘城。`)
    await refreshMetaInfo()
  } catch (e) {
    notice(e instanceof ApiError ? e.message : String(e), true)
  } finally {
    state.loading = false
  }
}

async function applyEnd(endInfo: EndInfo | null, life: LifeState): Promise<void> {
  if (!endInfo) return
  state.endInfo = endInfo
  state.life = life
  state.battle = null
  await refreshMetaInfo()
}

async function handleActResult(result: ActResponse): Promise<void> {
  state.life = result.life
  state.suggestions = result.suggestions
  state.availableEndings = result.availableEndings
  state.metaInfo = { ...(state.metaInfo as MetaInfo), meta: result.meta, activeLifeId: state.metaInfo?.activeLifeId ?? result.life.id }
  state.ui = result.degraded ? 'degraded' : 'idle'
  state.lastDegradedReason = result.degradedReason
  if (result.battleStarted) {
    state.battle = result.life.pendingBattle
    notice(`战斗开始：${result.battleStarted.enemyName}${result.battleStarted.lethal ? '（此人下死手！）' : ''}`, result.battleStarted.lethal)
  }
  state.pendingEvent = result.event
  if (result.ended) await applyEnd(result.endInfo, result.life)
}

/** 行动（菜单/事件抉择/自由输入/选择结局） */
export async function submitAct(act: Record<string, unknown>, label: string): Promise<void> {
  const life = state.life
  if (!life || life.phase !== 'alive') return
  if (state.ui !== 'idle' && state.ui !== 'degraded') return
  state.ui = 'waiting'
  state.stagedNarrative = ''
  state.lastDegradedReason = null
  clearNotices()
  pushLog('player', label)
  const pendingEntry = pushLog('narrative', '', true)
  try {
    const result = await streamCall<ActResponse>({
      path: actPath(life.id),
      body: { requestId: crypto.randomUUID(), clientVersion: life.version, act },
      onDelta: (t) => {
        state.ui = 'streaming'
        state.stagedNarrative += t
        pendingEntry.text = state.stagedNarrative
      },
    })
    pendingEntry.pending = false
    pendingEntry.text = result.narrative
    await handleActResult(result)
  } catch (e) {
    pendingEntry.pending = false
    if (e instanceof ApiError && (e.code === 'version_conflict' || e.code === 'network' || e.code === 'stream_truncated')) {
      state.ui = 'connection_lost'
      notice('与服务器的连接/状态不同步，正在恢复……', true)
      await resync()
    } else {
      pendingEntry.text = pendingEntry.text || '（此行动未能完成。）'
      notice(e instanceof ApiError ? e.message : String(e), true)
      state.ui = 'idle'
    }
  }
}

/** 战斗指令 */
export async function submitBattleCommand(command: Record<string, unknown>, label: string): Promise<void> {
  const life = state.life
  if (!life || !state.battle || (state.ui !== 'idle' && state.ui !== 'degraded')) return
  state.ui = 'waiting'
  state.stagedNarrative = ''
  clearNotices()
  pushLog('battle', `❯ ${label}`)
  const pendingEntry = pushLog('battle', '', true)
  try {
    const result = await streamCall<BattleResponse>({
      path: battlePath(life.id),
      body: { requestId: crypto.randomUUID(), clientVersion: life.version, command },
      onDelta: (t) => {
        state.ui = 'streaming'
        state.stagedNarrative += t
        pendingEntry.text = state.stagedNarrative
      },
    })
    pendingEntry.pending = false
    pendingEntry.text = result.narrative
    state.life = result.life
    state.battle = result.life.pendingBattle
    state.suggestions = []
    state.availableEndings = result.availableEndings
    state.metaInfo = { ...(state.metaInfo as MetaInfo), meta: result.meta }
    state.ui = result.degraded ? 'degraded' : 'idle'
    state.lastDegradedReason = result.degradedReason
    if (result.ended) await applyEnd(result.endInfo, result.life)
  } catch (e) {
    pendingEntry.pending = false
    if (e instanceof ApiError && (e.code === 'version_conflict' || e.code === 'network' || e.code === 'stream_truncated')) {
      state.ui = 'connection_lost'
      notice('连接/状态不同步，正在恢复……', true)
      await resync()
    } else {
      pendingEntry.text = pendingEntry.text || '（此回合未能完成。）'
      notice(e instanceof ApiError ? e.message : String(e), true)
      state.ui = 'idle'
    }
  }
}

export async function resync(): Promise<boolean> {
  try {
    const active = await api.getActiveLife()
    state.life = active.life
    restoreHistory(active.life)
    state.availableEndings = active.availableEndings
    state.battle = active.life?.pendingBattle ?? null
    state.pendingEvent = active.event
    await refreshMetaInfo()
    state.ui = 'idle'
    return true
  } catch {
    return false
  }
}

export async function retryMemory(): Promise<void> {
  const id = state.life?.id ?? state.metaInfo?.activeLifeId
  if (!id) return
  try {
    const r = await api.retryMemory(id)
    await refreshMetaInfo()
    notice(r.failed > 0 ? `记忆提炼仍有 ${r.failed} 项待重试。` : '记忆提炼完成。')
  } catch (e) {
    notice(e instanceof ApiError ? e.message : String(e), true)
  }
}

export function martialName(id: string): string {
  const m = state.catalog?.martials.find((x) => x.id === id)
  return m ? `${m.name}` : id
}

export function locationName(id: string): string {
  return state.catalog?.locations.find((l) => l.id === id)?.name ?? id
}

export function originName(id: string): string {
  return state.catalog?.origins.find((o) => o.id === id)?.name ?? id
}

export function destinyName(id: string | null): string {
  if (!id) return '无'
  const map: Record<string, string> = {
    jiachuan_miji: '家传秘笈',
    miemen_chichou: '灭门之仇',
    shenshi_zhimi: '身世之谜',
  }
  return map[id] ?? id
}

export function npcName(id: string): string {
  return state.catalog?.npcs.find((n) => n.id === id)?.name ?? id
}

export function factionName(id: string): string {
  return state.catalog?.factions.find((f) => f.id === id)?.name ?? id
}
