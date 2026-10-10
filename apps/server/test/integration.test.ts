import { describe, expect, it } from 'vitest'
import type { Hono } from 'hono'
import {
  DEGRADED_NARRATIVE,
  INPUT_MAX_CHARS,
  type MetaState,
  type RunState,
} from '@lorecraft/core'
import { buildTurnPrompt, MockProvider } from '@lorecraft/llm'
import { getWorld } from '@lorecraft/worlddata'
import { loadConfig } from '../src/config.js'
import type { TurnResponse } from '../src/game.js'
import { openDb } from '../src/db.js'
import { GameService } from '../src/game.js'
import { HttpError } from '../src/errors.js'
import { Repos } from '../src/repos.js'
import { createApp } from '../src/routes.js'

const NOW = '2026-01-01T00:00:00Z'

interface Setup {
  db: ReturnType<typeof openDb>
  repos: Repos
  mock: MockProvider
  service: GameService
  app: Hono
}

function setup(): Setup {
  const db = openDb(':memory:')
  const repos = new Repos(db)
  const mock = new MockProvider()
  const config = { ...loadConfig({}), sqlitePath: ':memory:' }
  const service = new GameService({ db, config, provider: mock, repos })
  const app = createApp(service)
  return { db, repos, mock, service, app }
}

function httpErrorOf(fn: () => unknown): HttpError {
  try {
    fn()
  } catch (e) {
    if (e instanceof HttpError) return e
    throw e
  }
  throw new Error('expected HttpError, none thrown')
}

async function postJson(app: Hono, path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

/** 解析 SSE 文本中的 result 事件 */
function parseSseResult(text: string): { result?: TurnResponse; hasDelta: boolean; error?: unknown } {
  const lines = text.split('\n')
  let hasDelta = false
  let result: TurnResponse | undefined
  let error: unknown
  let currentEvent = ''
  for (const line of lines) {
    if (line.startsWith('event: ')) currentEvent = line.slice(7).trim()
    else if (line.startsWith('data: ')) {
      const data = line.slice(6)
      if (currentEvent === 'delta') hasDelta = true
      else if (currentEvent === 'result') result = JSON.parse(data) as TurnResponse
      else if (currentEvent === 'error') error = JSON.parse(data)
    }
  }
  return { result, hasDelta, error }
}

/** 依序提交 flag 命令（依赖顺序即数组顺序） */
async function runFlags(
  s: Setup,
  runId: string,
  run: RunState,
  commands: string[]
): Promise<{ run: RunState; last: TurnResponse }> {
  let cur = run
  let last!: TurnResponse
  for (const cmd of commands) {
    const res = await s.service.submitTurn(runId, crypto.randomUUID(), cur.version, cmd)
    if (res.degraded) throw new Error(`mock 回合意外降级：${res.degradedReason}`)
    cur = res.run
    last = res
  }
  return { run: cur, last }
}

const BIANLIDIAN_WIN = [
  '/flag read_ruleboard',
  '/flag no_shadow_customer',
  '/flag find_torch',
  '/flag hear_knock',
  '/flag knock_correct',
  '/flag coworker_note',
  '/flag manager_visit',
  '/flag manager_pacified',
  '/flag mirror_check',
]

describe('P2：run 生命周期 + 门禁', () => {
  it('创建新局；已有活跃局时 409（错误格式统一）', async () => {
    const s = setup()
    // 无活跃局是常态：200 + null（不产生 404 报错噪音）
    const none = await s.app.request('/api/runs/active')
    expect(none.status).toBe(200)
    expect(((await none.json()) as { run: RunState | null }).run).toBeNull()

    const { run } = s.service.createRun()
    expect(run.phase).toBe('hub')
    expect(run.lifespan).toBe(60)

    const err = httpErrorOf(() => s.service.createRun())
    expect(err.code).toBe('active_run_exists')

    const res = await postJson(s.app, '/api/runs', {})
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('active_run_exists')
  })

  it('未解锁世界 403；进入世界初始化 flag；HTTP 恢复当前局', async () => {
    const s = setup()
    const { run } = s.service.createRun()

    expect(httpErrorOf(() => s.service.enterWorld(run.id, 'qingyunmen')).code).toBe('world_locked')
    expect(httpErrorOf(() => s.service.enterWorld(run.id, 'nope')).code).toBe('world_not_found')

    const entered = s.service.enterWorld(run.id, 'bianlidian')
    expect(entered.phase).toBe('in_world')
    expect(entered.visit?.worldId).toBe('bianlidian')
    expect(Object.values(entered.visit?.flags ?? {}).every((v) => v === false)).toBe(true)

    const res = await s.app.request('/api/runs/active')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { run: RunState }
    expect(body.run.id).toBe(run.id)
    expect(body.run.version).toBe(entered.version)
  })

  it('每局每世界最多完成一次；跨局可再进', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    const entered = s.service.enterWorld(run.id, 'bianlidian')
    // 模拟已完成
    const done: RunState = {
      ...entered,
      phase: 'hub',
      visit: null,
      currentWorldId: null,
      worldCompletions: ['bianlidian'],
      version: entered.version + 1,
    }
    expect(s.repos.saveRun(done, entered.version, NOW)).toBe(true)
    expect(httpErrorOf(() => s.service.enterWorld(run.id, 'bianlidian')).code).toBe(
      'already_completed_this_run'
    )
  })
})

describe('P2：回合、幂等与并发', () => {
  it('SSE 流：delta + result；寿命 -1；turn_log 落库', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    const entered = s.service.enterWorld(run.id, 'bianlidian')

    const res = await postJson(s.app, `/api/runs/${run.id}/turn`, {
      requestId: 'req-1',
      clientVersion: entered.version,
      input: '检查收银台',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const parsed = parseSseResult(await res.text())
    expect(parsed.hasDelta).toBe(true)
    expect(parsed.result).toBeTruthy()
    expect(parsed.result?.run.lifespan).toBe(59)
    expect(parsed.result?.run.version).toBe(entered.version + 1)
    expect(parsed.result?.record.playerInput).toBe('检查收银台')

    const logs = s.repos.turnRange(run.id, 0, 1)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.turn).toBe(1)
  })

  it('相同 requestId 重放：返回同一结果，寿命不重复扣', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    const entered = s.service.enterWorld(run.id, 'bianlidian')

    const first = await s.service.submitTurn(run.id, 'same-req', entered.version, '走')
    const replay = await s.service.submitTurn(run.id, 'same-req', 999, '走')
    expect(replay.run.turn).toBe(first.run.turn)
    expect(replay.run.lifespan).toBe(first.run.lifespan)
    expect(replay.run.version).toBe(first.run.version)
  })

  it('并发提交（不同 requestId、同一版本）：只有一个提交成功', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    const entered = s.service.enterWorld(run.id, 'bianlidian')

    const results = await Promise.allSettled([
      s.service.submitTurn(run.id, 'a', entered.version, '动作A'),
      s.service.submitTurn(run.id, 'b', entered.version, '动作B'),
    ])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    const err = (rejected[0] as PromiseRejectedResult).reason
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).code).toBe('version_conflict')

    // 失败方的 claim 已释放：同 requestId 可重试
    const retry = await s.service.submitTurn(run.id, 'b', (fulfilled[0] as PromiseFulfilledResult<TurnResponse>).value.run.version, '动作B')
    expect(retry.run.turn).toBe(2)
  })

  it('客户端版本过期 → 409 version_conflict', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    s.service.enterWorld(run.id, 'bianlidian')
    const err = await s.service
      .submitTurn(run.id, 'stale', 999, '走')
      .catch((e: unknown) => e as HttpError)
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).code).toBe('version_conflict')
  })

  it('输入超长拒绝', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    s.service.enterWorld(run.id, 'bianlidian')
    const err = await s.service
      .submitTurn(run.id, 'long', 2, 'x'.repeat(INPUT_MAX_CHARS + 1))
      .catch((e: unknown) => e as HttpError)
    expect((err as HttpError).code).toBe('input_too_long')
  })
})

describe('P1/P5：完整通关线（便利店）+ 寿命上限继承（65）', () => {
  it('9 回合通关：+15 寿命、meta 上限 +5、解锁青云门、生成记忆任务', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    const entered = s.service.enterWorld(run.id, 'bianlidian')
    const { run: after, last } = await runFlags(s, run.id, entered, BIANLIDIAN_WIN)

    expect(last.outcome.kind).toBe('world_completed')
    expect(after.phase).toBe('hub')
    expect(after.worldCompletions).toEqual(['bianlidian'])
    // 60 - 9 + 15 = 66 → 截断到本局上限 60
    expect(after.lifespan).toBe(60)

    const meta = s.repos.loadMeta()
    expect(meta?.lifespanCap).toBe(65)
    expect(meta?.permanentClearedWorlds).toEqual(['bianlidian'])

    const info = s.service.getMeta()
    expect(info.unlockedWorldIds).toContain('qingyunmen')
    expect(info.prototypeComplete).toBe(false)

    const tasks = s.repos.openMemoryTasks(run.id)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.kind).toBe('world')

    // 本局同一世界不能重复通关
    expect(httpErrorOf(() => s.service.enterWorld(run.id, 'bianlidian')).code).toBe(
      'already_completed_this_run'
    )
  })
})

describe('P3：记忆提炼与重试', () => {
  it('通关记忆：提炼入库、重复 retry 不重复处理；失败标记后可恢复', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    const entered = s.service.enterWorld(run.id, 'bianlidian')
    await runFlags(s, run.id, entered, BIANLIDIAN_WIN)

    // 成功提炼
    s.mock.push({
      type: 'raw',
      text: JSON.stringify({ memories: ['守规则的人活到天亮', '店长只在凌晨三点出现，只收小票'] }),
    })
    let r = await s.service.retryMemory(run.id)
    expect(r.processed).toBe(1)
    expect(r.failed).toBe(0)
    expect(r.meta.memories.map((m) => m.text)).toContain('守规则的人活到天亮')

    // 再次 retry：无待处理任务
    r = await s.service.retryMemory(run.id)
    expect(r.processed).toBe(0)
    expect(r.meta.memories).toHaveLength(2)

    // 失败路径：待处理任务标记 failed，旧记忆保留
    s.repos.insertMemoryTask(
      { id: 'task-2', runId: run.id, kind: 'death', worldId: null, fromTurn: 0, toTurn: 1 },
      NOW
    )
    s.mock.push({ type: 'raw', text: 'not-json' })
    r = await s.service.retryMemory(run.id)
    expect(r.failed).toBe(1)
    expect(r.meta.memories).toHaveLength(2)
    expect(s.repos.openMemoryTasks(run.id)[0]?.status).toBe('failed')

    // 恢复：好脚本重试成功，且不重复发奖（奖励只在结算时发）
    s.mock.push({ type: 'raw', text: JSON.stringify({ memories: ['仓库敲门要等三声'] }) })
    r = await s.service.retryMemory(run.id)
    expect(r.processed).toBe(1)
    expect(r.failed).toBe(0)
    expect(r.meta.memories).toHaveLength(3)
    expect(s.repos.loadMeta()?.lifespanCap).toBe(65) // 无重复奖励
  })

  it('继承记忆注入后续世界/后续局的 prompt（验收：继承可感知）', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    const entered = s.service.enterWorld(run.id, 'bianlidian')
    await runFlags(s, run.id, entered, BIANLIDIAN_WIN)
    s.mock.push({ type: 'raw', text: JSON.stringify({ memories: ['便利店的第三条规则是假的'] }) })
    await s.service.retryMemory(run.id)

    // 同一局穿梭到下一个世界：prompt 已含继承记忆
    const enteredQy = s.service.enterWorld(run.id, 'qingyunmen')
    const promptQy = buildTurnPrompt({
      world: getWorld('qingyunmen')!,
      run: enteredQy,
      meta: s.repos.loadMeta()!,
      playerInput: '去执事堂',
    })
    expect(promptQy.turns[0]?.content).toContain('【继承记忆')
    expect(promptQy.turns[0]?.content).toContain('便利店的第三条规则是假的')
  })
})

describe('P5：死亡线 + 结算兜底 + 新局继承', () => {
  it('体质归零死亡：run 结束、死亡计数、settle 幂等、新局属性重置且寿命=继承上限', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    // 先通关便利店拿 65 上限
    const entered = s.service.enterWorld(run.id, 'bianlidian')
    await runFlags(s, run.id, entered, BIANLIDIAN_WIN)

    // 进风雪山庄（已随青云门链解锁？不——只通了便利店，解锁的是青云门）
    const entered2 = s.service.enterWorld(run.id, 'qingyunmen')
    expect(entered2.phase).toBe('in_world')

    let cur = entered2
    for (let i = 0; i < 3; i++) {
      cur = (await s.service.submitTurn(run.id, crypto.randomUUID(), cur.version, '/dmg con 3')).run
    }
    expect(cur.attrs.con).toBe(1)
    const deathTurn = await s.service.submitTurn(run.id, crypto.randomUUID(), cur.version, '/dmg con 3')
    expect(deathTurn.outcome).toEqual({ kind: 'dead', cause: 'con' })
    expect(deathTurn.run.phase).toBe('dead')
    expect(deathTurn.run.deathCause).toBe('con')

    const meta = s.repos.loadMeta()
    expect(meta?.deathCount).toBe(1)

    // settle 幂等
    const s1 = s.service.settleReconcile(run.id)
    const s2 = s.service.settleReconcile(run.id)
    expect(s1.meta.deathCount).toBe(1)
    expect(s2.meta.deathCount).toBe(1)

    // 新局：属性 10，寿命 = 65；死亡后新局 prompt 含继承记忆
    s.mock.push({ type: 'raw', text: JSON.stringify({ memories: ['无话店长只收小票'] }) })
    const mem = await s.service.retryMemory(run.id)
    expect(mem.processed).toBe(1)

    const { run: run2 } = s.service.createRun()
    expect(run2.attrs).toEqual({ con: 10, mind: 10, agi: 10 })
    expect(run2.lifespan).toBe(65)
    expect(run2.capSnapshot).toBe(65)
    const e2 = s.service.enterWorld(run2.id, 'bianlidian')
    const prompt = buildTurnPrompt({
      world: getWorld('bianlidian')!,
      run: e2,
      meta: s.repos.loadMeta()!,
      playerInput: '看向冷柜',
    })
    expect(prompt.turns[0]?.content).toContain('无话店长只收小票')
  })

  it('寿命归零死亡（降级回合也判死）', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    const entered = s.service.enterWorld(run.id, 'bianlidian')
    // 扣到 1 点：59 回合太多——直接改快照模拟长局
    const low: RunState = { ...entered, lifespan: 1, version: entered.version + 1 }
    expect(s.repos.saveRun(low, entered.version, NOW)).toBe(true)
    s.mock.push({ type: 'error', kind: 'timeout', message: '超时' })
    const res = await s.service.submitTurn(run.id, 'deg-death', low.version, '走')
    expect(res.degraded).toBe(true)
    expect(res.outcome).toEqual({ kind: 'dead', cause: 'lifespan' })
    expect(res.record.narrative).toBe(DEGRADED_NARRATIVE)
  })
})

describe('P3：降级回合与滚动摘要', () => {
  it('非法 JSON：重试后仍失败 → 环境回合（-1 寿命、无申报变更、确定性叙事）', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    const entered = s.service.enterWorld(run.id, 'bianlidian')
    const res = await s.service.submitTurn(run.id, 'bad-1', entered.version, '/bad-json 又_bad-json')
    expect(res.degraded).toBe(true)
    expect(res.run.lifespan).toBe(59)
    expect(res.run.visit?.flags['read_ruleboard']).toBe(false)
    expect(res.record.degraded).toBe(true)
    expect(res.record.narrative).toBe(DEGRADED_NARRATIVE)
  })

  it('第 10 回合触发滚动摘要：成功更新；失败保留旧摘要', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    let cur = s.service.enterWorld(run.id, 'bianlidian')
    for (let i = 1; i <= 9; i++) {
      cur = (await s.service.submitTurn(run.id, `t${i}`, cur.version, `行动${i}`)).run
    }
    // 队列顺序：先回合输出，后摘要输出
    s.mock.push({ type: 'raw', text: JSON.stringify({ narrative: '夜更深了。', suggestedActions: ['观察四周'] }) })
    s.mock.push({ type: 'raw', text: JSON.stringify({ summary: '店员熟悉了规则，平安度过前夜。' }) })
    const tenth = await s.service.submitTurn(run.id, 't10', cur.version, '行动10')
    cur = tenth.run
    expect(tenth.run.turn).toBe(10)
    const stored = s.service.getRun(run.id)
    expect(stored.summary).toContain('店员')
    expect(stored.summarizedThroughTurn).toBe(10)

    // 第 20 回合：摘要失败 → 保留旧摘要
    for (let i = 11; i <= 19; i++) {
      cur = (await s.service.submitTurn(run.id, `t${i}`, cur.version, `行动${i}`)).run
    }
    s.mock.push({ type: 'raw', text: JSON.stringify({ narrative: '长夜漫漫。', suggestedActions: ['观察四周'] }) })
    s.mock.push({ type: 'raw', text: 'nope' })
    await s.service.submitTurn(run.id, 't20', cur.version, '行动20')
    const after = s.service.getRun(run.id)
    expect(after.summary).toContain('店员')
    expect(after.summarizedThroughTurn).toBe(10)
  })
})

describe('P5：验收矩阵——寿命上限 65 → 65 → 70 与原型完成', () => {
  it('首通便利店 65；跨局重通仍 65；再首通青云门 70；三世界全通后允许新局', async () => {
    const s = setup()
    // 局 1：通便利店 + 死在青云门
    const { run } = s.service.createRun()
    const e1 = s.service.enterWorld(run.id, 'bianlidian')
    await runFlags(s, run.id, e1, BIANLIDIAN_WIN)
    const e2 = s.service.enterWorld(run.id, 'qingyunmen')
    let cur = e2
    for (let i = 0; i < 4; i++) {
      cur = (await s.service.submitTurn(run.id, crypto.randomUUID(), cur.version, '/dmg con 3')).run
    }
    expect(cur.phase).toBe('dead')

    // 局 2：重通便利店（上限仍 65），再首通青云门（上限 70）
    const { run: run2 } = s.service.createRun()
    expect(run2.lifespan).toBe(65)
    const r2e1 = s.service.enterWorld(run2.id, 'bianlidian')
    const win1 = await runFlags(s, run2.id, r2e1, BIANLIDIAN_WIN)
    expect(win1.last.worldCompleted?.firstClearCapBonusGranted).toBe(false)
    expect(s.repos.loadMeta()?.lifespanCap).toBe(65)

    const qy = [
      '/flag get_mission',
      '/flag spirit_array',
      '/flag breakthrough',
      '/flag elder_favor',
      '/flag win_first_round',
      '/flag win_final',
    ]
    const r2e2 = s.service.enterWorld(run2.id, 'qingyunmen')
    const win2 = await runFlags(s, run2.id, r2e2, qy)
    expect(win2.last.worldCompleted?.firstClearCapBonusGranted).toBe(true)
    expect(s.repos.loadMeta()?.lifespanCap).toBe(70)

    // 同一局继续：首通风雪山庄（上限 75），三世界全部永久通关 → 原型完成
    const fx = [
      '/flag scout_inn',
      '/flag befriend_xiaoer',
      '/flag overhear_plot',
      '/flag identify_officer',
      '/flag win_duel',
      '/flag expose_innkeeper',
    ]
    const r2e3 = s.service.enterWorld(run2.id, 'fengxue')
    const win3 = await runFlags(s, run2.id, r2e3, fx)
    expect(win3.last.prototypeComplete).toBe(true)
    expect(s.repos.loadMeta()?.lifespanCap).toBe(75)

    // run2 仍在枢纽（未死亡），但全部世界已完成 → 允许开新局
    const { run: run3 } = s.service.createRun()
    expect(run3.lifespan).toBe(75)
  })
})

describe('HTTP /settle 与 /memory/retry 端点', () => {
  it('幂等 settle 与 memory retry 经 HTTP 可用', async () => {
    const s = setup()
    const { run } = s.service.createRun()
    const r1 = await postJson(s.app, `/api/runs/${run.id}/settle`, {})
    expect(r1.status).toBe(200)
    const r2 = await postJson(s.app, `/api/runs/${run.id}/settle`, {})
    expect(r2.status).toBe(200)
    const m1 = await postJson(s.app, `/api/runs/${run.id}/memory/retry`, {})
    expect(m1.status).toBe(200)
    const mb = (await m1.json()) as { processed: number }
    expect(mb.processed).toBe(0)
  })
})

describe('meta 端点', () => {
  it('GET /api/meta 返回继承层与解锁信息', async () => {
    const s = setup()
    const res = await s.app.request('/api/meta')
    const body = (await res.json()) as {
      meta: MetaState
      unlockedWorldIds: string[]
      prototypeComplete: boolean
    }
    expect(body.meta.lifespanCap).toBe(60)
    expect(body.unlockedWorldIds).toEqual(['bianlidian'])
    expect(body.prototypeComplete).toBe(false)
  })
})
