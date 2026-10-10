/** SQLite 仓储层（plan P2）。全部语句预编译；写操作由服务层包在事务里。 */
import type Database from 'better-sqlite3'
import type { MetaState, RunState, TurnRecord } from '@lorecraft/core'

export interface RunRow {
  id: string
  version: number
  phase: string
  data: RunState
  createdAt: string
}

export interface RequestRow {
  runId: string
  requestId: string
  kind: string
  status: string
  response: string | null
}

export interface MemoryTaskRow {
  id: string
  runId: string
  kind: 'world' | 'death'
  worldId: string | null
  fromTurn: number
  toTurn: number
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

  // ---- runs ----
  getRun(id: string): RunRow | null {
    const row = this.db
      .prepare('SELECT id, version, phase, data, created_at FROM runs WHERE id = ?')
      .get(id) as { id: string; version: number; phase: string; data: string; created_at: string } | undefined
    if (!row) return null
    return { id: row.id, version: row.version, phase: row.phase, data: JSON.parse(row.data) as RunState, createdAt: row.created_at }
  }

  getActiveRun(): RunRow | null {
    const row = this.db
      .prepare("SELECT id, version, phase, data, created_at FROM runs WHERE phase != 'dead' ORDER BY created_at DESC LIMIT 1")
      .get() as { id: string; version: number; phase: string; data: string; created_at: string } | undefined
    if (!row) return null
    return { id: row.id, version: row.version, phase: row.phase, data: JSON.parse(row.data) as RunState, createdAt: row.created_at }
  }

  insertRun(run: RunState, now: string): void {
    this.db
      .prepare('INSERT INTO runs (id, version, phase, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(run.id, run.version, run.phase, JSON.stringify(run), now, now)
  }

  /** 乐观并发保存：expectedVersion 不匹配则返回 false */
  saveRun(run: RunState, expectedVersion: number, now: string): boolean {
    const res = this.db
      .prepare('UPDATE runs SET version = ?, phase = ?, data = ?, updated_at = ? WHERE id = ? AND version = ?')
      .run(run.version, run.phase, JSON.stringify(run), now, run.id, expectedVersion)
    return res.changes === 1
  }

  /** 只更新派生数据（滚动摘要），不 bump 版本 */
  saveRunDataOnly(run: RunState, now: string): void {
    this.db
      .prepare('UPDATE runs SET data = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(run), now, run.id)
  }

  // ---- requests（幂等） ----
  getRequest(runId: string, requestId: string): RequestRow | null {
    const row = this.db
      .prepare('SELECT run_id, request_id, kind, status, response FROM requests WHERE run_id = ? AND request_id = ?')
      .get(runId, requestId) as { run_id: string; request_id: string; kind: string; status: string; response: string | null } | undefined
    if (!row) return null
    return { runId: row.run_id, requestId: row.request_id, kind: row.kind, status: row.status, response: row.response }
  }

  claimRequest(runId: string, requestId: string, kind: string, now: string): void {
    this.db
      .prepare('INSERT INTO requests (run_id, request_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(runId, requestId, kind, 'in_progress', now, now)
  }

  completeRequest(runId: string, requestId: string, response: string, now: string): void {
    this.db
      .prepare("UPDATE requests SET status = 'done', response = ?, updated_at = ? WHERE run_id = ? AND request_id = ?")
      .run(response, now, runId, requestId)
  }

  releaseRequest(runId: string, requestId: string): void {
    this.db
      .prepare('DELETE FROM requests WHERE run_id = ? AND request_id = ? AND status = ?')
      .run(runId, requestId, 'in_progress')
  }

  // ---- turn_logs ----
  insertTurnLog(runId: string, record: TurnRecord, requestId: string | null, now: string): void {
    this.db
      .prepare('INSERT INTO turn_logs (run_id, turn, request_id, degraded, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(runId, record.turn, requestId, record.degraded ? 1 : 0, JSON.stringify(record), now)
  }

  turnRange(runId: string, fromTurn: number, toTurn: number): TurnRecord[] {
    const rows = this.db
      .prepare('SELECT payload FROM turn_logs WHERE run_id = ? AND turn > ? AND turn <= ? ORDER BY turn')
      .all(runId, fromTurn, toTurn) as { payload: string }[]
    return rows.map((r) => JSON.parse(r.payload) as TurnRecord)
  }

  // ---- memory_tasks ----
  insertMemoryTask(task: Omit<MemoryTaskRow, 'status' | 'error'>, now: string): void {
    this.db
      .prepare("INSERT INTO memory_tasks (id, run_id, kind, world_id, from_turn, to_turn, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)")
      .run(task.id, task.runId, task.kind, task.worldId, task.fromTurn, task.toTurn, now, now)
  }

  hasMemoryTask(runId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS x FROM memory_tasks WHERE run_id = ? LIMIT 1')
      .get(runId) as { x: number } | undefined
    return Boolean(row)
  }

  openMemoryTaskCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM memory_tasks WHERE status IN ('pending','failed')")
      .get() as { n: number }
    return row.n
  }

  openMemoryTasks(runId: string): MemoryTaskRow[] {    const rows = this.db
      .prepare("SELECT id, run_id, kind, world_id, from_turn, to_turn, status, error FROM memory_tasks WHERE run_id = ? AND status IN ('pending','failed') ORDER BY created_at")
      .all(runId) as { id: string; run_id: string; kind: string; world_id: string | null; from_turn: number; to_turn: number; status: string; error: string | null }[]
    return rows.map((r) => ({
      id: r.id,
      runId: r.run_id,
      kind: r.kind as 'world' | 'death',
      worldId: r.world_id,
      fromTurn: r.from_turn,
      toTurn: r.to_turn,
      status: r.status as MemoryTaskRow['status'],
      error: r.error,
    }))
  }

  markMemoryTask(id: string, status: 'done' | 'failed', error: string | null, now: string): void {
    this.db
      .prepare('UPDATE memory_tasks SET status = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(status, error, now, id)
  }

  // ---- usage / events ----
  insertUsage(u: { runId: string | null; provider: string; model: string; kind: string; promptTokens: number; completionTokens: number; durationMs: number | null }, now: string): void {
    this.db
      .prepare('INSERT INTO usage_logs (run_id, provider, model, kind, prompt_tokens, completion_tokens, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(u.runId, u.provider, u.model, u.kind, u.promptTokens, u.completionTokens, u.durationMs, now)
  }

  insertEvent(runId: string | null, kind: string, payload: string | null, now: string): void {
    this.db
      .prepare('INSERT INTO events (run_id, kind, payload, created_at) VALUES (?, ?, ?, ?)')
      .run(runId, kind, payload, now)
  }

  hasEvent(runId: string, kind: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS x FROM events WHERE run_id = ? AND kind = ? LIMIT 1')
      .get(runId, kind) as { x: number } | undefined
    return Boolean(row)
  }
}
