/** SQLite 仓储层 v2（plan P2）。语句预编译；写操作由服务层包事务。 */
import type Database from 'better-sqlite3'
import type { HistoryEntry, LifeState, MetaState } from '@lorecraft/core'

export interface LifeRow {
  id: string
  version: number
  phase: string
  data: LifeState
  createdAt: string
}

export interface RequestRow {
  lifeId: string
  requestId: string
  kind: string
  status: string
  response: string | null
}

export interface MemoryTaskRow {
  id: string
  lifeId: string
  fromSeq: number
  toSeq: number
  status: 'pending' | 'done' | 'failed'
  error: string | null
}

export class Repos {
  constructor(private readonly db: Database.Database) {}

  // ---- meta ----
  loadMeta(): MetaState | null {
    const row = this.db.prepare('SELECT data FROM meta WHERE id = 1').get() as
      | { data: string }
      | undefined
    return row ? (JSON.parse(row.data) as MetaState) : null
  }

  saveMeta(meta: MetaState): void {
    this.db
      .prepare(
        'INSERT INTO meta (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
      )
      .run(JSON.stringify(meta))
  }

  // ---- lives ----
  getLife(id: string): LifeRow | null {
    const row = this.db
      .prepare('SELECT id, version, phase, data, created_at FROM lives WHERE id = ?')
      .get(id) as
      | { id: string; version: number; phase: string; data: string; created_at: string }
      | undefined
    if (!row) return null
    return { id: row.id, version: row.version, phase: row.phase, data: JSON.parse(row.data) as LifeState, createdAt: row.created_at }
  }

  getActiveLife(): LifeRow | null {
    const row = this.db
      .prepare("SELECT id, version, phase, data, created_at FROM lives WHERE phase != 'ended' ORDER BY created_at DESC LIMIT 1")
      .get() as
      | { id: string; version: number; phase: string; data: string; created_at: string }
      | undefined
    if (!row) return null
    return { id: row.id, version: row.version, phase: row.phase, data: JSON.parse(row.data) as LifeState, createdAt: row.created_at }
  }

  insertLife(life: LifeState, now: string): void {
    this.db
      .prepare('INSERT INTO lives (id, version, phase, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(life.id, life.version, life.phase, JSON.stringify(life), now, now)
  }

  /** 乐观并发保存：expectedVersion 不匹配返回 false */
  saveLife(life: LifeState, expectedVersion: number, now: string): boolean {
    const res = this.db
      .prepare('UPDATE lives SET version = ?, phase = ?, data = ?, updated_at = ? WHERE id = ? AND version = ?')
      .run(life.version, life.phase, JSON.stringify(life), now, life.id, expectedVersion)
    return res.changes === 1
  }

  /** 只更新派生数据（滚动摘要），不 bump 版本 */
  saveLifeDataOnly(life: LifeState, now: string): void {
    this.db
      .prepare('UPDATE lives SET data = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(life), now, life.id)
  }

  // ---- requests（幂等） ----
  getRequest(lifeId: string, requestId: string): RequestRow | null {
    const row = this.db
      .prepare('SELECT life_id, request_id, kind, status, response FROM requests WHERE life_id = ? AND request_id = ?')
      .get(lifeId, requestId) as
      | { life_id: string; request_id: string; kind: string; status: string; response: string | null }
      | undefined
    if (!row) return null
    return { lifeId: row.life_id, requestId: row.request_id, kind: row.kind, status: row.status, response: row.response }
  }

  claimRequest(lifeId: string, requestId: string, kind: string, now: string): void {
    this.db
      .prepare('INSERT INTO requests (life_id, request_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(lifeId, requestId, kind, 'in_progress', now, now)
  }

  completeRequest(lifeId: string, requestId: string, response: string, now: string): void {
    this.db
      .prepare("UPDATE requests SET status = 'done', response = ?, updated_at = ? WHERE life_id = ? AND request_id = ?")
      .run(response, now, lifeId, requestId)
  }

  releaseRequest(lifeId: string, requestId: string): void {
    this.db
      .prepare("DELETE FROM requests WHERE life_id = ? AND request_id = ? AND status = 'in_progress'")
      .run(lifeId, requestId)
  }

  /** 兼容旧存档：旧回合响应已保存推荐，但当时未写入 life 快照。 */
  latestActSuggestions(lifeId: string): { seq: number; suggestions: string[] } | null {
    const row = this.db.prepare("SELECT response FROM requests WHERE life_id = ? AND kind = 'act' AND status = 'done' ORDER BY updated_at DESC, rowid DESC LIMIT 1").get(lifeId) as { response: string } | undefined
    if (!row) return null
    try {
      const response = JSON.parse(row.response) as { life?: { logSeq?: number }; suggestions?: unknown }
      if (typeof response.life?.logSeq !== 'number' || !Array.isArray(response.suggestions) || !response.suggestions.every(s => typeof s === 'string')) return null
      return { seq: response.life.logSeq, suggestions: response.suggestions.slice(0, 3) as string[] }
    } catch { return null }
  }

  // ---- turn_logs（行动/战斗历史，记忆提炼数据源） ----
  insertTurnLog(lifeId: string, entry: HistoryEntry, requestId: string | null, now: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO turn_logs (life_id, seq, kind, request_id, degraded, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(lifeId, entry.seq, entry.kind, requestId, entry.degraded ? 1 : 0, JSON.stringify(entry), now)
  }

  seqRange(lifeId: string, fromSeq: number, toSeq: number): HistoryEntry[] {
    const rows = this.db
      .prepare('SELECT payload FROM turn_logs WHERE life_id = ? AND seq > ? AND seq <= ? ORDER BY seq')
      .all(lifeId, fromSeq, toSeq) as { payload: string }[]
    return rows.map((r) => JSON.parse(r.payload) as HistoryEntry)
  }

  // ---- memory_tasks ----
  insertMemoryTask(task: Omit<MemoryTaskRow, 'status' | 'error'>, now: string): void {
    this.db
      .prepare("INSERT INTO memory_tasks (id, life_id, from_seq, to_seq, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)")
      .run(task.id, task.lifeId, task.fromSeq, task.toSeq, now, now)
  }

  hasMemoryTask(lifeId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS x FROM memory_tasks WHERE life_id = ? LIMIT 1')
      .get(lifeId) as { x: number } | undefined
    return Boolean(row)
  }

  openMemoryTasks(lifeId: string): MemoryTaskRow[] {
    const rows = this.db
      .prepare("SELECT id, life_id, from_seq, to_seq, status, error FROM memory_tasks WHERE life_id = ? AND status IN ('pending','failed') ORDER BY created_at")
      .all(lifeId) as { id: string; life_id: string; from_seq: number; to_seq: number; status: string; error: string | null }[]
    return rows.map((r) => ({
      id: r.id,
      lifeId: r.life_id,
      fromSeq: r.from_seq,
      toSeq: r.to_seq,
      status: r.status as MemoryTaskRow['status'],
      error: r.error,
    }))
  }

  markMemoryTask(id: string, status: 'done' | 'failed', error: string | null, now: string): void {
    this.db
      .prepare('UPDATE memory_tasks SET status = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(status, error, now, id)
  }

  openMemoryTaskCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM memory_tasks WHERE status IN ('pending','failed')")
      .get() as { n: number }
    return row.n
  }

  // ---- usage / events ----
  insertUsage(u: { lifeId: string | null; provider: string; model: string; kind: string; promptTokens: number; completionTokens: number; durationMs: number | null }, now: string): void {
    this.db
      .prepare('INSERT INTO usage_logs (run_id, provider, model, kind, prompt_tokens, completion_tokens, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(u.lifeId, u.provider, u.model, u.kind, u.promptTokens, u.completionTokens, u.durationMs, now)
  }

  insertEvent(lifeId: string | null, kind: string, payload: string | null, now: string): void {
    this.db
      .prepare('INSERT INTO events (run_id, kind, payload, created_at) VALUES (?, ?, ?, ?)')
      .run(lifeId, kind, payload, now)
  }

  hasEvent(lifeId: string, kind: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS x FROM events WHERE run_id = ? AND kind = ? LIMIT 1')
      .get(lifeId, kind) as { x: number } | undefined
    return Boolean(row)
  }
}
