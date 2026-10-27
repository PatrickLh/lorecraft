import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LifeState } from '@lorecraft/core'
import { CHAPTER_EVENTS, CHAPTER_LOCATIONS, CHAPTER_NPCS, LOCATIONS } from '@lorecraft/worlddata'
import { MockProvider } from '@lorecraft/llm'
import { GameService, type ActRequest } from '../src/game.js'
import { loadConfig } from '../src/config.js'
import { openDb } from '../src/db.js'
import { Repos } from '../src/repos.js'
import { createApp } from '../src/routes.js'

const resources: ReturnType<typeof openDb>[] = []
afterEach(() => { for (const db of resources.splice(0)) db.close() })
function setup(story = true, origin = 'shanghang_xuetu') {
  const db = openDb(':memory:'); resources.push(db)
  const repos = new Repos(db)
  const mock = new MockProvider()
  const service = new GameService({ db, repos, config: loadConfig({}), provider: mock, rng: () => .5 })
  const { life } = service.createLife(origin, story)
  let current = life
  const act = async (command: ActRequest, id = crypto.randomUUID()) => {
    const result = await service.submitAct(current.id, id, current.version, command)
    current = result.life
    return result
  }
  return { service, repos, mock, life, act, current: () => current, app: createApp(service) }
}
const pick = (eventId: string, choiceId: string): ActRequest => ({ kind: 'story_choice', eventId, choiceId })
const travel = (locationId: string): ActRequest => ({ kind: 'story_travel', locationId })
const work: ActRequest = { kind: 'story_routine', activity: 'work' }

describe('固定章节内容与引用', () => {
  it('两城六处城外、二十人，地图、关系和事件引用完整', () => {
    expect(new Set(CHAPTER_LOCATIONS.map(l => l.city)).size).toBe(2)
    expect(CHAPTER_LOCATIONS.filter(l => l.kind === '城外')).toHaveLength(6)
    expect(CHAPTER_NPCS).toHaveLength(20)
    expect(new Set(CHAPTER_NPCS.map(n => n.id)).size).toBe(20)
    for (const loc of CHAPTER_LOCATIONS) expect(LOCATIONS.some(l => l.id === loc.id)).toBe(true)
    for (const npc of CHAPTER_NPCS) {
      expect(CHAPTER_LOCATIONS.some(l => l.id === npc.locationId)).toBe(true)
      expect(npc.background.length).toBeGreaterThan(10)
      expect(npc.goal).toBeTruthy(); expect(npc.likes.length).toBeGreaterThan(0)
      for (const tie of npc.ties) expect(CHAPTER_NPCS.some(n => n.id === tie.id)).toBe(true)
    }
    for (const event of CHAPTER_EVENTS) {
      expect(event.choices.length).toBeGreaterThan(0)
      for (const id of event.npcIds) expect(CHAPTER_NPCS.some(n => n.id === id)).toBe(true)
      for (const c of event.choices) if ((c.outcome.money ?? 0) < 0) expect(c.req?.money).toBeGreaterThanOrEqual(-c.outcome.money!)
    }
  })
})
describe('身世章节权威推进', () => {
  it('旧存档主动进入保留数值、时间、旧经历；重复进入不能重置期限', async () => {
    const s = setup(false)
    const before = structuredClone(s.life)
    await s.act({ kind: 'story_begin' })
    expect(s.current().attrs).toEqual(before.attrs)
    expect(s.current().money).toBe(before.money)
    expect(s.current().day).toBe(before.day)
    expect(s.current().slot).toBe(before.slot)
    expect(s.current().story?.startTick).toBe(0)
    await expect(s.act({ kind: 'story_begin' })).rejects.toMatchObject({ code: 'chapter_started' })
  })
  it('HTTP 新开一世默认启用章节；目标查询不推进时间、不泄露结局选项', async () => {
    const db = openDb(':memory:'); resources.push(db)
    const service = new GameService({ db, repos: new Repos(db), config: loadConfig({}), provider: new MockProvider() })
    const app = createApp(service)
    const response = await app.request('/api/lives', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ originId: 'nongjia_zi' }) })
    const { life } = await response.json() as { life: LifeState }
    expect(life.story?.id).toBe('xuandeng')
    const before = service.getLife(life.id)
    const view = service.getStory(life.id)
    expect(view.events.find(e => e.id === 's_meeting')?.choices).toEqual([])
    expect(service.getLife(life.id)).toEqual(before)
  })
  it('可完整取得物证并公开洗冤；主流程不请求模型、不自动结束一世', async () => {
    const s = setup()
    const spy = vi.spyOn(s.mock, 'generate')
    await s.act(pick('s_letter', 'trace'))
    await s.act(travel('biaoju'))
    await s.act(pick('s_escort', 'help'))
    await s.act(travel('ferry'))
    await s.act(pick('s_ferry', 'protect'))
    await s.act(work)
    await s.act(travel('old_estate'))
    while (s.current().day * 4 + s.current().slot < 8) await s.act(work)
    await s.act(pick('s_ruins', 'careful'))
    await s.act(travel('linan'))
    await s.act(pick('s_archive', 'pay'))
    await s.act(travel('shrine'))
    while (s.current().day * 4 + s.current().slot < 16) await s.act(work)
    const result = await s.act(pick('s_meeting', 'clear'))
    expect(result.life.story?.ending).toBe('灯照归名')
    expect(result.life.flags).toContain('s_evidence')
    expect(result.life.phase).toBe('alive')
    expect(spy).not.toHaveBeenCalled()
    const restored = await (await s.app.request('/api/lives/active')).json() as { life: LifeState }
    expect(restored.life.story).toEqual(result.life.story)
  })
  it('拒绝调查不会冻结世界，逾期后出现传闻与替代入口，最终有缺席结果', async () => {
    const s = setup()
    await s.act(pick('s_letter', 'decline'))
    while (s.current().day * 4 + s.current().slot < 12) await s.act(work)
    expect(s.current().flags).toContain('s_ledger_burned')
    expect(s.service.getStory(s.life.id).events.find(e => e.id === 's_ferry')?.status).toBe('travel')
    while (s.current().day * 4 + s.current().slot < 52) await s.act(work)
    expect(s.current().story?.ending).toBe('未赴的灯约')
    expect(s.current().story?.news).toHaveLength(4)
    const ids = s.current().story!.news.map(n => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('未到地点、时间、能力或证据不符不能强行参与', async () => {
    const s = setup(true, 'nongjia_zi')
    await expect(s.act(pick('s_meeting', 'clear'))).rejects.toMatchObject({ code: 'story_unavailable' })
    await s.act(pick('s_letter', 'trace'))
    await expect(s.act(pick('s_escort', 'help'))).rejects.toMatchObject({ code: 'story_unavailable' })
    await s.act(travel('biaoju'))
    await expect(s.act(pick('s_escort', 'press'))).rejects.toMatchObject({ code: 'choice_unavailable' })
    const life = s.current()
    life.locationId = 'shrine'; life.flags.push('s_record'); life.day = 4; life.slot = 0
    s.repos.saveLifeDataOnly(life, '2026-10-25T00:00:00Z')
    await expect(s.act(pick('s_meeting', 'clear'))).rejects.toMatchObject({ code: 'choice_unavailable' })
  })
  it('人物支线的奖励、引荐和重复请求都受代码约束', async () => {
    const s = setup()
    await s.act(travel('yelin'))
    await s.act(pick('sq_herb', 'sort'))
    await s.act(travel('fangshi'))
    const before = structuredClone(s.current())
    const id = crypto.randomUUID()
    const result = await s.act(pick('sq_bailu', 'deliver'), id)
    const replay = await s.service.submitAct(before.id, id, before.version, pick('sq_bailu', 'deliver'))
    expect(replay.life).toEqual(result.life)
    expect(result.life.money).toBe(before.money + 4)
    expect(result.life.flags).toContain('s_bailu_letter')
    await expect(s.act(pick('sq_bailu', 'deliver'))).rejects.toMatchObject({ code: 'story_unavailable' })
  })
  it('人物只能当面交谈，同人同日好感不可重复刷取，人物会按剧情离开', async () => {
    const s = setup()
    await expect(s.act({ kind: 'story_talk', npcId: 'wen_jiu', topic: 'past' })).rejects.toMatchObject({ code: 'npc_absent' })
    await s.act({ kind: 'story_talk', npcId: 'bai_lu', topic: 'interest' })
    const relation = s.current().npcs.bai_lu
    await s.act({ kind: 'story_talk', npcId: 'bai_lu', topic: 'interest' })
    expect(s.current().npcs.bai_lu).toBe(relation)
    expect(s.current().characterNotes?.['白露']).toBeTruthy()
    await s.act(pick('s_letter', 'trace'))
    await s.act(travel('biaoju')); await s.act(pick('s_escort', 'help'))
    await s.act(travel('ferry')); await s.act(pick('s_ferry', 'protect'))
    expect(s.service.getStory(s.life.id).npcs.find(n => n.id === 'wen_jiu')?.present).toBe(false)
  })
  it('跨城消耗两时辰，同城一时辰；只查看地图不影响时间', async () => {
    const s = setup()
    await s.act(travel('biaoju'))
    expect(s.current().slot).toBe(1)
    s.service.getStory(s.life.id)
    await s.act(travel('linan'))
    expect(s.current().slot).toBe(3)
  })
  it.each([['witness', '未尽的案卷'], ['private', '收灯入怀'], ['leave', '独行知归']])('证据不足也可选择不同结果：%s', async (choice, ending) => {
    const s = setup()
    const life = s.current()
    life.flags.push('s_record')
    life.day = 4; life.slot = 0; life.locationId = 'shrine'
    s.repos.saveLifeDataOnly(life, '2026-10-25T00:00:00Z')
    const result = await s.act(pick('s_meeting', choice))
    expect(result.life.story?.ending).toBe(ending)
    expect(result.life.phase).toBe('alive')
  })
  it('可选演绎调用模型一次，但不改变时间、证据、关系或数值', async () => {
    const s = setup()
    const before = structuredClone(s.current())
    const spy = vi.spyOn(s.mock, 'generate')
    const result = await s.act({ kind: 'story_detail' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.life.day).toBe(before.day); expect(result.life.slot).toBe(before.slot)
    expect(result.life.attrs).toEqual(before.attrs)
    expect(result.life.flags).toEqual(before.flags)
    expect(result.life.npcs).toEqual(before.npcs)
    expect(result.life.story?.decisions).toEqual(before.story?.decisions)
  })
  it('细读失败保留原文，不把提示词当剧情，也不阻塞章节', async () => {
    const s = setup()
    const before = structuredClone(s.current())
    s.mock.push({ type: 'raw', text: 'bad' }); s.mock.push({ type: 'raw', text: 'bad' })
    const result = await s.act({ kind: 'story_detail' })
    expect(result.degraded).toBe(true)
    expect(result.narrative).toBe(before.story?.lastScene)
    expect(result.life.slot).toBe(before.slot)
    await s.act(pick('s_letter', 'trace'))
    expect(s.current().flags).toContain('s_awake')
  })
})
