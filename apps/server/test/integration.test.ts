import { describe, expect, it } from 'vitest'
import type { Hono } from 'hono'
import type { LifeState, Rng } from '@lorecraft/core'
import { MockProvider } from '@lorecraft/llm'
import { loadConfig } from '../src/config.js'
import { openDb } from '../src/db.js'
import { GameService, type ActResponse, type BattleResponse } from '../src/game.js'
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

function setup(rng?: Rng): Setup {
  const db = openDb(':memory:')
  const repos = new Repos(db)
  const mock = new MockProvider()
  const config = { ...loadConfig({}), sqlitePath: ':memory:' }
  const service = new GameService({ db, config, provider: mock, repos, rng: rng ?? (() => .5) })
  const app = createApp(service)
  return { db, repos, mock, service, app }
}

function expectHttpError(fn: () => unknown): HttpError {
  try {
    fn()
  } catch (e) {
    if (e instanceof HttpError) return e
    throw e
  }
  throw new Error('expected HttpError')
}

async function postJson(app: Hono, path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

/** 队列化 rng：按序弹出，弹完回落到 0.5 */
function queuedRng(values: number[]): Rng {
  let i = 0
  return () => {
    const v = values[i]
    i += 1
    return v ?? 0.5
  }
}

async function act(
  s: Setup,
  lifeId: string,
  version: number,
  actBody: Record<string, unknown>,
  requestId: string = crypto.randomUUID()
): Promise<ActResponse> {
  return s.service.submitAct(lifeId, requestId, version, actBody as never)
}

async function battleTurn(
  s: Setup,
  lifeId: string,
  version: number,
  command: Record<string, unknown>,
  requestId: string = crypto.randomUUID()
): Promise<BattleResponse> {
  return s.service.submitBattleTurn(lifeId, requestId, version, command as never)
}

describe('P2：一世生命周期与门禁', () => {
  it('选出身开局；重复开局 409；锁定出身 403', () => {
    const s = setup()
    const { life } = s.service.createLife('nongjia_zi')
    expect(life.phase).toBe('alive')
    expect(life.day).toBe(0)
    expect(life.destinyId).not.toBeNull() // 随机身世线

    expect(expectHttpError(() => s.service.createLife('shijing_youer')).code).toBe('active_life_exists')
    expect(expectHttpError(() => s.service.createLife('nope')).code).toBe('origin_not_found')

    const s2 = setup()
    expect(expectHttpError(() => s2.service.createLife('menpai_dizi')).code).toBe('origin_locked')
  })

  it('HTTP：活跃局恢复返回 200 + null（无局时）；meta 与 catalog 可用', async () => {
    const s = setup()
    const none = await s.app.request('/api/lives/active')
    expect(none.status).toBe(200)
    expect(((await none.json()) as { life: LifeState | null }).life).toBeNull()

    s.service.createLife('nongjia_zi')
    const meta = await (await s.app.request('/api/meta')).json()
    expect((meta as { activeLifeId: string }).activeLifeId).toBeTruthy()
    const catalog = await (await s.app.request('/api/catalog')).json()
    const origins = (catalog as { origins: { available: boolean }[] }).origins
    expect(origins.filter((o) => o.available).length).toBe(4)
  })

  it('v1.0 残留 meta：迁移 v3 清空 + ensureMeta 形状防御，catalog 不再 500', () => {
    const db = openDb(':memory:')
    // 模拟用户库：迁移已到 v2，但 meta 里是 v1.0 形状的继承层
    db.prepare('INSERT INTO meta (id, data) VALUES (1, ?)').run(
      JSON.stringify({ lifespanCap: 60, permanentClearedWorlds: [], memories: [], deathCount: 0, runsCount: 1 })
    )
    const repos = new Repos(db)
    const mock = new MockProvider()
    const config = { ...loadConfig({}), sqlitePath: ':memory:' }
    const service = new GameService({ db, config, provider: mock, repos })

    const info = service.getMeta()
    expect(info.meta.livesCount).toBe(0) // v1 残留被重建
    expect(info.meta.unlockedOrigins).toEqual([])
    expect(() => service.catalog()).not.toThrow()
    const card = service.catalog().origins.find((o) => o.id === 'menpai_dizi')
    expect(card?.available).toBe(false)
  })
})

describe('P2：行动、幂等与并发', () => {
  it('固定行动（用饭）：温饱上升、版本+1；相同 requestId 重放同结果', async () => {
    const s = setup()
    const { life } = s.service.createLife('nongjia_zi')
    life.food = 4
    expect(s.repos.saveLife(life, life.version, NOW)).toBe(true)

    const res = await act(s, life.id, life.version, { kind: 'action', actionId: 'yongfan' }, 'req-meal')
    expect(res.life.food).toBe(8)
    expect(res.life.version).toBe(life.version + 1)
    expect(res.degraded).toBe(false)

    const replay = await act(s, life.id, 999, { kind: 'action', actionId: 'yongfan' }, 'req-meal')
    expect(replay.life.food).toBe(8) // 重放，不再消耗
  })

  it('银两不足 → 400 invalid_action，状态不变', async () => {
    const s = setup()
    const { life } = s.service.createLife('nongjia_zi')
    life.money = 0
    s.repos.saveLife(life, life.version, NOW)
    const err = await act(s, life.id, life.version, { kind: 'action', actionId: 'zhusu' }).catch(
      (e: unknown) => e as HttpError
    )
    expect((err as HttpError).code).toBe('invalid_action')
  })

  it('并发提交（不同 requestId 同版本）：仅一个成功', async () => {
    const s = setup()
    const { life } = s.service.createLife('nongjia_zi')
    const results = await Promise.allSettled([
      s.service.submitAct(life.id, 'a', life.version, { kind: 'action', actionId: 'yongfan' }),
      s.service.submitAct(life.id, 'b', life.version, { kind: 'action', actionId: 'yongfan' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    const err = (results[1] as PromiseRejectedResult).reason as HttpError
    expect(err).toBeInstanceOf(HttpError)
    expect(err.code).toBe('version_conflict')
  })

  it('自由行动 + mock /grow：小额成长生效；/bad-grow 降级不变', async () => {
    const s = setup()
    const { life } = s.service.createLife('shijing_youer')
    const atkBefore = life.attrs.atk

    const ok = await act(s, life.id, life.version, { kind: 'free', input: '/grow atk 路见不平出了一手' })
    expect(ok.degraded).toBe(false)
    expect(ok.life.attrs.atk).toBe(atkBefore + 1)

    const bad = await act(s, ok.life.version ? ok.life.id : life.id, ok.life.version, {
      kind: 'free',
      input: '/bad-grow 又_bad-grow',
    })
    expect(bad.degraded).toBe(true)
    expect(bad.life.attrs.int).toBe(ok.life.attrs.int) // 类别不匹配被拒，属性不变
  })

  it('SSE：act 流含 delta 与 result 事件', async () => {
    const s = setup()
    const { life } = s.service.createLife('nongjia_zi')
    const res = await postJson(s.app, `/api/lives/${life.id}/act`, {
      requestId: 'sse-1',
      clientVersion: life.version,
      act: { kind: 'action', actionId: 'yongfan' },
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('event: delta')
    expect(text).toContain('event: result')
  })
})

describe('P2：事件抉择与战斗', () => {
  /** 白盒：直接把待抉择事件注入活跃一世 */
  function injectEvent(s: Setup, life: LifeState, eventId: string): LifeState {
    const injected: LifeState = { ...life, pendingEventId: eventId }
    expect(s.repos.saveLife(injected, life.version, NOW)).toBe(true)
    return injected
  }

  it('事件抉择开战 → 战斗至结束（败北重伤）', async () => {
    const s = setup()
    const { life } = s.service.createLife('shijing_youer')
    const injected = injectEvent(s, life, 'e_baofei')

    const idx = 1 // 「拔拳相向」
    const chosen = await act(s, life.id, injected.version, { kind: 'event_choice', index: idx })
    expect(chosen.battleStarted?.enemyName).toBe('赵横')
    expect(chosen.life.pendingBattle).toBeTruthy()

    let cur: BattleResponse = chosen as unknown as BattleResponse
    let guard = 0
    while (cur.life.pendingBattle && guard < 100) {
      guard++
      cur = await battleTurn(s, life.id, cur.life.version, { kind: 'attack' })
    }
    expect(cur.life.pendingBattle).toBeNull()
    expect(['win', 'lose', 'fled']).toContain(cur.battle.result)
    if (cur.battle.result === 'lose') {
      expect(cur.life.injured).toBe(true)
      expect(cur.life.phase).toBe('alive') // 赵横不下死手
    }
  })

  it('战斗中禁止行动（409 in_battle）', async () => {
    const s = setup()
    const { life } = s.service.createLife('shijing_youer')
    const injected = injectEvent(s, life, 'e_baofei')
    const chosen = await act(s, life.id, injected.version, { kind: 'event_choice', index: 1 })
    expect(chosen.life.pendingBattle).toBeTruthy()
    const err = await s.service
      .submitAct(life.id, crypto.randomUUID(), chosen.life.version, {
        kind: 'action',
        actionId: 'yongfan',
      })
      .catch((e: unknown) => e as HttpError)
    expect((err as HttpError).code).toBe('in_battle')
  })

  it('不可用选项被拒绝（choice_unavailable）', async () => {
    const s = setup()
    const { life } = s.service.createLife('nongjia_zi')
    const injected = injectEvent(s, life, 'e_baofei')
    const err = await act(s, life.id, injected.version, { kind: 'event_choice', index: 99 }).catch(
      (e: unknown) => e as HttpError
    )
    expect((err as HttpError).code).toBe('bad_choice')
  })
})

describe('P2：死亡、轮回与继承', () => {
  /** 断粮后连过日子直到饿死 */
  async function starveToEnd(s: Setup, life: LifeState): Promise<ActResponse> {
    let cur = life
    for (let i = 0; i < 8; i++) {
      const res = await act(s, life.id, cur.version, { kind: 'action', actionId: 'guoyiri' })
      cur = res.life
      if (res.ended) return res
    }
    throw new Error('断粮 8 日仍未死亡')
  }

  it('断粮饿死 → 履历/记忆任务/新一世可用；settle 幂等', async () => {
    const s = setup()
    const { life } = s.service.createLife('nongjia_zi')
    life.food = 0
    expect(s.repos.saveLife(life, life.version, NOW)).toBe(true)

    const res = await starveToEnd(s, life)
    expect(res.life.phase).toBe('ended')
    expect(res.life.deathCause).toBe('starve')

    const settle1 = s.service.settleReconcile(life.id)
    const settle2 = s.service.settleReconcile(life.id)
    expect(settle1.meta.livesCount).toBe(1)
    expect(settle2.meta.livesCount).toBe(1)
    expect(settle1.meta.history[0]?.deathCause).toBe('starve')

    // 记忆提炼：成功 → 记忆入库；重复 retry 无重复
    s.mock.push({
      type: 'raw',
      text: JSON.stringify({ memories: ['贫民窟的破庙夜里能挡风', '坊市恶霸赵横欺软怕硬'] }),
    })
    const mem = await s.service.retryMemory(life.id)
    expect(mem.processed).toBe(1)
    expect(mem.meta.memories.length).toBe(2)
    const mem2 = await s.service.retryMemory(life.id)
    expect(mem2.processed).toBe(0)

    // 新一世可开局
    const { life: life2 } = s.service.createLife('shijing_youer')
    expect(life2.phase).toBe('alive')
  })

  it('选择型结局：满足条件可选并写结局章', async () => {
    const s = setup()
    const { life } = s.service.createLife('shanghang_xuetu')
    life.money = 350
    expect(s.repos.saveLife(life, life.version, NOW)).toBe(true)

    const res = await act(s, life.id, life.version, {
      kind: 'ending',
      endingId: 'yuanzou_haiwai',
    })
    expect(res.ended).toBe(true)
    expect(res.endInfo?.endingId).toBe('yuanzou_haiwai')
    expect(res.endInfo?.chapter.length).toBeGreaterThan(0)

    const settle = s.service.settleReconcile(life.id)
    expect(settle.meta.history[0]?.endingId).toBe('yuanzou_haiwai')
  })

  it('选择型结局条件不足 → 400', async () => {
    const s = setup()
    const { life } = s.service.createLife('nongjia_zi')
    const err = await act(s, life.id, life.version, {
      kind: 'ending',
      endingId: 'yuanzou_haiwai',
    }).catch((e: unknown) => e as HttpError)
    expect((err as HttpError).code).toBe('ending_unavailable')
  })

  it('轮回历史 API', async () => {
    const s = setup()
    const { life } = s.service.createLife('nongjia_zi')
    life.food = 0
    s.repos.saveLife(life, life.version, NOW)
    await starveToEnd(s, life)
    s.service.settleReconcile(life.id)
    const res = await s.app.request('/api/lives')
    const body = (await res.json()) as { history: { deathCause: string | null }[] }
    expect(body.history).toHaveLength(1)
    expect(body.history[0]?.deathCause).toBe('starve')
  })

  it('记忆提炼失败不阻塞、可重试恢复（沿用 v1.0 语义）', async () => {
    const s = setup()
    const { life } = s.service.createLife('nongjia_zi')
    life.food = 0
    s.repos.saveLife(life, life.version, NOW)
    await starveToEnd(s, life)

    s.mock.push({ type: 'raw', text: 'not-json' })
    const fail = await s.service.retryMemory(life.id)
    expect(fail.failed).toBe(1)
    expect(fail.meta.memories).toHaveLength(0)

    s.mock.push({ type: 'raw', text: JSON.stringify({ memories: ['破庙能挡风'] }) })
    const ok = await s.service.retryMemory(life.id)
    expect(ok.processed).toBe(1)
    expect(ok.meta.memories.map((m) => m.text)).toContain('破庙能挡风')
  })
})

describe('人物摘要存档', () => {
  it('收录叙事人物、恢复档案且不改变数值恩怨；重放不重复', async () => {
    const s = setup(() => 0.5)
    try {
      const { life } = s.service.createLife('nongjia_zi')
      const beforeNpcs = { ...life.npcs }
      s.mock.push({ type: 'raw', text: JSON.stringify({
        narrative: '你在码头结识阿舟，他喜爱听书，为漕帮运货。',
        characters: [
          { name: '阿舟', gender: '男', organization: '漕帮', hobby: '听书', summary: '在码头相识，为漕帮运货。', relation: '新识' },
          { name: '不存在的人', gender: '未详', organization: '', hobby: '', summary: '', relation: '' },
        ],
      }) })
      const result = await act(s, life.id, life.version, { kind: 'free', input: '在码头看看' }, 'people-1')
      expect(result.life.characterNotes?.['阿舟']?.hobby).toBe('听书')
      expect(result.life.characterNotes?.['不存在的人']).toBeUndefined()
      expect(result.life.npcs).toEqual(beforeNpcs)
      const restored = s.service.getLife(life.id)
      expect(restored.characterNotes).toEqual(result.life.characterNotes)
      const replay = await act(s, life.id, life.version, { kind: 'free', input: '在码头看看' }, 'people-1')
      expect(replay.life.characterNotes).toEqual(result.life.characterNotes)
      expect(replay.life.version).toBe(result.life.version)
      s.mock.push({ type: 'raw', text: JSON.stringify({ narrative: '阿舟又来与你打招呼。', characters: [{ name: '阿舟', gender: '未详', organization: '', hobby: '', summary: '再次在码头相逢。', relation: '' }] }) })
      const next = await act(s, life.id, restored.version, { kind: 'free', input: '与阿舟打招呼' })
      expect(next.life.characterNotes?.['阿舟']).toMatchObject({ gender: '男', hobby: '听书', summary: '再次在码头相逢。' })
    } finally { s.db.close() }
  })
})

describe('旧经历人物整理', () => {
  it('仅更新档案、请求幂等、不推进时间或改变数值', async () => {
    const s = setup(() => .5)
    try {
      const { life } = s.service.createLife('nongjia_zi')
      life.history.push({ seq: 1, day: 0, slot: 0, kind: 'action', label: '相识', text: '周劲与阿舟在威远镖局和你相识。', degraded: false })
      s.repos.saveLifeDataOnly(life, NOW)
      s.mock.push({ type: 'raw', text: JSON.stringify({ characters: [{ name: '周劲', gender: '未详', organization: '威远镖局', hobby: '', summary: '在镖局相识。', relation: '相识' }] }) })
      const result = await s.service.summarizeCharacters(life.id, 'extract-1', life.version)
      expect(result.life.characterNotes?.['周劲']?.organization).toBe('威远镖局')
      expect(result.life.day).toBe(life.day)
      expect(result.life.slot).toBe(life.slot)
      expect(result.life.attrs).toEqual(life.attrs)
      expect(result.life.history).toEqual(life.history)
      expect((await s.service.summarizeCharacters(life.id, 'extract-1', life.version)).life.version).toBe(result.life.version)
    } finally { s.db.close() }
  })
})

describe('刷新后恢复推荐与玩家选择', () => {
  it('原文、推荐随事务落盘；HTTP 恢复和重复请求保持一致', async () => {
    const s = setup(() => .5)
    try {
      const { life } = s.service.createLife('nongjia_zi')
      s.mock.push({ type: 'raw', text: JSON.stringify({ narrative: '你向路人询问去码头的路。', suggestedActions: ['到码头看看', '留在坊市'] }) })
      const input = '我向路人询问码头怎么走'
      const result = await act(s, life.id, life.version, { kind: 'free', input }, 'refresh-turn')
      expect(result.life.history.at(-1)?.playerInput).toBe(input)
      expect(result.life.suggestedActions).toEqual(result.suggestions)
      const oldSnapshot = s.service.getLife(life.id)
      delete oldSnapshot.suggestedActions
      s.repos.saveLifeDataOnly(oldSnapshot, NOW)
      const restored = await s.app.request('/api/lives/active')
      const body = await restored.json() as { life: LifeState }
      expect(body.life.history.at(-1)?.playerInput).toBe(input)
      expect(body.life.suggestedActions).toEqual(['到码头看看', '留在坊市'])
      const replay = await act(s, life.id, life.version, { kind: 'free', input }, 'refresh-turn')
      expect(replay.life.history).toEqual(body.life.history)
      const next = await act(s, life.id, result.life.version, { kind: 'action', actionId: 'lianwu' })
      expect(next.life.history.at(-1)?.playerInput).toBe('练武')
      expect(next.life.history.filter(h => h.playerInput === input)).toHaveLength(1)
    } finally { s.db.close() }
  })
})

describe('回合时间与事件阶段', () => {
  it('AI 收到夜到翌晨的实际时间区间，待抉择事件不会被其他行动拖到下一时辰', async () => {
    const s = setup(() => .5)
    try {
      const { life } = s.service.createLife('nongjia_zi')
      life.slot = 3
      s.repos.saveLifeDataOnly(life, NOW)
      let prompt = ''
      const generate = s.mock.generate.bind(s.mock)
      s.mock.generate = async (request, hooks) => {
        prompt = request.turns.map(t => t.content).join('\n')
        return generate(request, hooks)
      }
      const next = await act(s, life.id, life.version, { kind: 'action', actionId: 'zhusu' })
      expect(next.life.day).toBe(1)
      expect(next.life.slot).toBe(0)
      expect(prompt).toContain('行动开始：第一年 春月一日 · 夜')
      expect(prompt).toContain('反馈结束：第一年 春月二日 · 晨')
      expect(prompt).toContain('时辰：晨')
      const pending = s.service.getLife(life.id)
      pending.pendingEventId = 'e_baofei'
      s.repos.saveLifeDataOnly(pending, NOW)
      await expect(act(s, life.id, pending.version, { kind: 'free', input: '去练武' })).rejects.toMatchObject({ code: 'pending_event' })
      expect(s.service.getLife(life.id).slot).toBe(0)
      expect(s.service.getLife(life.id).pendingEventId).toBe('e_baofei')
      const resolved = await act(s, life.id, pending.version, { kind: 'event_choice', index: 2 })
      expect(resolved.life.pendingEventId).toBeNull()
      expect(prompt).toContain('反馈结束：第一年 春月二日 · 午')
    } finally { s.db.close() }
  })
})

describe('自由文本进入具体事件', () => {
  it('坊市闲逛实际前往坊市，事件只能来自该地点', async () => {
    const s = setup(() => 0)
    try {
      const { life } = s.service.createLife('nongjia_zi')
      const result = await act(s, life.id, life.version, { kind: 'action', actionId: 'fangshi' })
      expect(result.life.locationId).toBe('fangshi')
      expect(result.event?.id).toBe('e_baofei')
    } finally { s.db.close() }
  })
  it('自由叙述不被随机事件打断，移动后触发事件且刷新保持抉择', async () => {
    const s = setup(() => 0)
    try {
      const { life } = s.service.createLife('nongjia_zi')
      const result = await act(s, life.id, life.version, { kind: 'free', input: '在破庙附近打听消息' })
      expect(result.event).toBeNull()
      const moved = await act(s, life.id, result.life.version, { kind: 'travel', locationId: 'fangshi' })
      expect(moved.event).not.toBeNull()
      expect(moved.event?.choices.length).toBeGreaterThan(0)
      const restored = await s.app.request('/api/lives/active')
      expect((await restored.json() as { event: { id: string } }).event.id).toBe(moved.event?.id)
    } finally { s.db.close() }
  })
  it('文本移动更新地点；明确寻找事件遵守条件且不提前发放奖励', async () => {
    const s = setup(() => .5)
    try {
      const { life } = s.service.createLife('nongjia_zi')
      const moved = await act(s, life.id, life.version, { kind: 'free', input: '去坊市' })
      expect(moved.life.locationId).toBe('fangshi')
      // 移动途中遇到的事件先处理，之后再主动寻找指定机缘。
      const ready = s.service.getLife(life.id)
      ready.pendingEventId = null
      ready.eventCooldowns = {}
      s.repos.saveLifeDataOnly(ready, NOW)
      expect(s.service.opportunities(life.id).some(e => e.id === 'e_yaopu_banggong')).toBe(true)
      const entered = await act(s, life.id, ready.version, { kind: 'free', input: '回春堂帮工' })
      expect(entered.event?.id).toBe('e_yaopu_banggong')
      expect(entered.life.money).toBe(ready.money)
      expect(entered.life.food).toBe(ready.food)
      expect(entered.life.slot).toBe(ready.slot)
      const outcome = await act(s, life.id, entered.life.version, { kind: 'event_choice', index: 0 })
      expect(outcome.life.money).toBe(ready.money + 3)
      expect(outcome.life.food).toBeGreaterThan(ready.food)
      expect(s.service.opportunities(life.id).some(e => e.id === 'e_yaopu_banggong')).toBe(false)
    } finally { s.db.close() }
  })
  it('明确吃饭文字走规则结算，不能在错误地点强行进入特定事件', async () => {
    const s = setup(() => .5)
    try {
      const { life } = s.service.createLife('nongjia_zi')
      await expect(act(s, life.id, life.version, { kind: 'seek_event', eventId: 'e_yaopu_banggong' })).rejects.toMatchObject({ code: 'event_unavailable' })
      const eaten = await act(s, life.id, life.version, { kind: 'free', input: '我要吃饭' })
      expect(eaten.life.food).toBe(10)
      expect(eaten.life.money).toBe(life.money - 1)
      expect(eaten.life.slot).toBe(life.slot)
      expect(eaten.life.history.at(-1)?.playerInput).toBe('我要吃饭')
    } finally { s.db.close() }
  })
})
