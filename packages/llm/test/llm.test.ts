import { describe, expect, it } from 'vitest'
import {
  createMetaState,
  createLife,
  DEGRADED_NARRATIVE,
  type LifeState,
  type OriginDefView,
} from '@lorecraft/core'
import { runActAttempt, runBattleAttempt, runEndingChapter } from '../src/executor.js'
import { extractMemories, mergeMemoriesLlm, summarizeHistory } from '../src/memory-run.js'
import { buildActPrompt, buildBattlePrompt, buildEndingPrompt } from '../src/prompts.js'
import { MockProvider } from '../src/mock.js'
import { NarrativeScanner } from '../src/stream-scan.js'

const NOW = '2026-01-01T00:00:00Z'
const origin: OriginDefView = {
  id: 'o', name: '测试出身', desc: '', money: 50, food: 10, rep: 0,
  locationId: 'fangshi', destiny: null,
}

function life(): LifeState {
  return createLife('l1', origin, NOW)
}
const meta = createMetaState(NOW)
meta.memories = [{ id: 'm1', text: '你前世死在赵横刀下', source: 'past_life', createdAt: NOW }]

const noValidate = () => null

describe('Prompt 构建（plan P3）', () => {
  it('行动演绎：标记、权威状态、继承记忆、玩家输入齐备', () => {
    const p = buildActPrompt({
      life: life(),
      meta,
      locationName: '坊市',
      playerInput: '去码头看看',
      allowGrowth: true,
    })
    expect(p.system).toContain('JSON Schema')
    const user = p.turns[0]?.content ?? ''
    expect(user).toContain('【输出类型：行动】')
    expect(user).toContain('【权威状态')
    expect(user).toContain('坊市')
    expect(user).toContain('【前世记忆')
    expect(user).toContain('你前世死在赵横刀下')
    expect(user).toContain('【玩家输入】去码头看看')
    expect(user).toContain('【允许成长申报】是')
  })

  it('事件演绎上下文：事件文本与结算事实', () => {
    const p = buildActPrompt({
      life: life(),
      meta,
      locationName: '坊市',
      event: { title: '恶霸收钱', text: '赵横拦路', choiceLabel: '交钱消灾', facts: ['银两 -5'] },
      playerInput: '恶霸收钱',
      allowGrowth: false,
    })
    const user = p.turns[0]?.content ?? ''
    expect(user).toContain('【事件】恶霸收钱')
    expect(user).toContain('【结算事实】')
    expect(user).toContain('【允许成长申报】否')
  })

  it('战斗演绎：敌方与结算事实标记（mock 依赖这些标记）', () => {
    const p = buildBattlePrompt({
      enemyName: '赵横',
      turn: 2,
      round: { facts: ['你使出「太祖长拳」'], playerHp: 24 },
      life: life(),
    })
    const user = p.turns[0]?.content ?? ''
    expect(user).toContain('【输出类型：战斗】')
    expect(user).toContain('【敌方】赵横')
    expect(user).toContain('【结算事实】')
  })

  it('结局章 prompt', () => {
    const l = life()
    l.endType = 'death'
    l.deathCause = 'battle'
    const p = buildEndingPrompt({ endingName: '横死刀兵', causeText: '战败身亡', life: l, meta })
    expect((p.turns[0]?.content ?? '').startsWith('【输出类型：结局】')).toBe(true)
  })
})

describe('NarrativeScanner', () => {
  it('跨分片与转义', () => {
    const out: string[] = []
    const s = new NarrativeScanner((t) => out.push(t))
    const full = JSON.stringify({ narrative: '刀光\n如雪，"铮"的一声。', extra: 1 })
    for (let i = 0; i < full.length; i += 3) s.feed(full.slice(i, i + 3))
    expect(out.join('')).toBe('刀光\n如雪，"铮"的一声。')
  })
})

describe('行动演绎执行器（plan P3 重试/降级）', () => {
  it('mock 默认输出可解析', async () => {
    const mock = new MockProvider()
    const res = await runActAttempt({
      provider: mock, life: life(), meta, locationName: '坊市',
      playerInput: '看看四周', allowGrowth: true,
      validateGrowth: noValidate, timeoutMs: 1000,
    })
    expect(res.kind).toBe('ok')
  })

  it('流式增量：只透出 narrative 文本，不含 JSON 结构', async () => {
    const mock = new MockProvider()
    const deltas: string[] = []
    await runActAttempt({
      provider: mock, life: life(), meta, locationName: '坊市',
      playerInput: '走', allowGrowth: false,
      validateGrowth: noValidate, timeoutMs: 1000,
      onNarrativeDelta: (t) => deltas.push(t),
    })
    const joined = deltas.join('')
    expect(joined).toContain('（mock 演绎）')
    expect(joined).not.toContain('"narrative"')
  })

  it('成长申报被拒 → 重试一次 → 降级', async () => {
    const mock = new MockProvider()
    const res = await runActAttempt({
      provider: mock, life: life(), meta, locationName: '坊市',
      playerInput: '/bad-grow', allowGrowth: true,
      validateGrowth: (l, g) => {
        const gg = g as { key: string; reasonTag: string }
        return gg.key === 'int' && gg.reasonTag === 'combat' ? 'growth：类别不匹配' : null
      },
      timeoutMs: 1000,
    })
    expect(res.kind).toBe('degraded')
    if (res.kind === 'degraded') {
      expect(res.retried).toBe(true)
      expect(res.reason).toContain('growth')
    }
  })

  it('合法 /grow 成功且带 growth 字段', async () => {
    const mock = new MockProvider()
    const res = await runActAttempt({
      provider: mock, life: life(), meta, locationName: '坊市',
      playerInput: '/grow atk 练了一趟拳', allowGrowth: true,
      validateGrowth: noValidate, timeoutMs: 1000,
    })
    expect(res.kind).toBe('ok')
    if (res.kind === 'ok') expect(res.value.growth?.key).toBe('atk')
  })

  it('超时不重试立即降级', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'error', kind: 'timeout', message: '超时' })
    const res = await runActAttempt({
      provider: mock, life: life(), meta, locationName: '坊市',
      playerInput: '走', allowGrowth: false,
      validateGrowth: noValidate, timeoutMs: 1000,
    })
    expect(res.kind).toBe('degraded')
    if (res.kind === 'degraded') expect(res.retried).toBe(false)
  })

  it('坏 JSON 重试后成功（retried=true）', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'raw', text: '{"narrative": "截断' })
    mock.push({ type: 'raw', text: JSON.stringify({ narrative: '四周如常。' }) })
    const res = await runActAttempt({
      provider: mock, life: life(), meta, locationName: '坊市',
      playerInput: '/bad-json 再_bad-json', allowGrowth: false,
      validateGrowth: noValidate, timeoutMs: 1000,
    })
    expect(res.kind).toBe('ok')
    if (res.kind === 'ok') expect(res.retried).toBe(true)
  })
})

describe('战斗/结局演绎执行器', () => {
  it('战斗演绎：mock 模板按敌方标记生成', async () => {
    const mock = new MockProvider()
    const res = await runBattleAttempt({
      provider: mock, enemyName: '赵横', turn: 1,
      round: { facts: ['你普攻造成 2 点伤害'], playerHp: 28 },
      life: life(), timeoutMs: 1000,
    })
    expect(res.kind).toBe('ok')
    if (res.kind === 'ok') expect(res.value.narrative).toContain('赵横')
  })

  it('战斗演绎失败 → 降级（服务层用模板战斗日志）', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'raw', text: 'nope' })
    mock.push({ type: 'raw', text: 'still nope' })
    const res = await runBattleAttempt({
      provider: mock, enemyName: '赵横', turn: 1,
      round: { facts: ['事实'], playerHp: 28 },
      life: life(), timeoutMs: 1000,
    })
    expect(res.kind).toBe('degraded')
  })

  it('结局章：成功与失败', async () => {
    const mock = new MockProvider()
    const l = life()
    l.endType = 'death'
    l.deathCause = 'starve'
    const ok = await runEndingChapter({
      provider: mock, endingName: '饿殍雪夜', causeText: '断粮身亡', life: l, meta, timeoutMs: 1000,
    })
    expect(ok.kind).toBe('ok')
    if (ok.kind === 'ok') expect(ok.value.title.length).toBeGreaterThan(0)

    const bad = new MockProvider()
    bad.push({ type: 'raw', text: 'x' })
    bad.push({ type: 'raw', text: 'y' })
    const fail = await runEndingChapter({
      provider: bad, endingName: '饿殍雪夜', causeText: '断粮身亡', life: l, meta, timeoutMs: 1000,
    })
    expect(fail.kind).toBe('degraded')
  })
})

describe('记忆/摘要辅助调用', () => {
  it('提炼清洗（去重、≤5 条）', async () => {
    const mock = new MockProvider()
    mock.push({
      type: 'raw',
      text: JSON.stringify({ memories: ['赵横欺软怕硬', '赵横欺软怕硬', '破庙能挡风'] }),
    })
    const res = await extractMemories(mock, { sourceTitle: '前世', sourceText: '一生', timeoutMs: 1000 })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toEqual(['赵横欺软怕硬', '破庙能挡风'])
  })

  it('提炼失败 → ok:false', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'raw', text: 'bad' })
    const res = await extractMemories(mock, { sourceTitle: 'x', sourceText: 'y', timeoutMs: 1000 })
    expect(res.ok).toBe(false)
  })

  it('超限合并：空结果视为失败（走 fallback）', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'raw', text: '{"memories": []}' })
    const res = await mergeMemoriesLlm(mock, { memories: ['a', 'b'], maxTotal: 2, timeoutMs: 1000 })
    expect(res.ok).toBe(false)
  })

  it('滚动摘要：成功与失败', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'raw', text: JSON.stringify({ summary: '少年在钱塘城落脚习武。' }) })
    const ok = await summarizeHistory(mock, {
      existingSummary: null,
      entries: [{ label: '练武', text: '练了一趟拳' }],
      timeoutMs: 1000,
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value).toContain('钱塘')

    const bad = new MockProvider()
    bad.push({ type: 'raw', text: 'oops' })
    const fail = await summarizeHistory(bad, {
      existingSummary: null,
      entries: [{ label: '练武', text: 'x' }],
      timeoutMs: 1000,
    })
    expect(fail.ok).toBe(false)
  })
})

describe('降级文案常量', () => {
  it('确定性环境叙事存在', () => {
    expect(DEGRADED_NARRATIVE.length).toBeGreaterThan(0)
  })
})

describe('人物摘要协议', () => {
  it('拒绝超长摘要并按既有重试预算恢复', async () => {
    const provider = new MockProvider()
    provider.push({ type: 'raw', text: JSON.stringify({ narrative: '你遇见阿舟。', characters: [{ name: '阿舟', gender: '男', organization: '漕帮', hobby: '', summary: '长'.repeat(61), relation: '' }] }) })
    provider.push({ type: 'raw', text: JSON.stringify({ narrative: '你遇见阿舟。', characters: [{ name: '阿舟', gender: '未详', organization: '', hobby: '', summary: '码头相识。', relation: '相识' }] }) })
    const result = await runActAttempt({ provider, life: life(), meta, locationName: '码头', playerInput: '走走', allowGrowth: false, validateGrowth: noValidate, timeoutMs: 1000 })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.retried).toBe(true)
      expect(result.value.characters?.[0]?.summary).toBe('码头相识。')
    }
  })
})

it('旧人物整理在系统提示中提供完整 schema，兼容 JSON-only provider', async () => {
  const { runCharacterExtraction } = await import('../src/executor.js')
  const { CharacterExtractionSchema } = await import('../src/schema.js')
  const provider = new MockProvider()
  const original = provider.generate.bind(provider)
  let captured = ''
  provider.generate = async (request, hooks) => {
    captured = request.system
    return original(request, hooks)
  }
  const result = await runCharacterExtraction(provider, life(), 1000)
  expect(captured).toContain('"required"')
  expect(captured).toContain('"characters"')
  expect(captured).toContain('"gender"')
  expect(result.kind).toBe('ok')
  expect(CharacterExtractionSchema.safeParse({ characters: [] }).success).toBe(true)
})

describe('叙事时间锚点', () => {
  it('午时反馈明确区分行动前后及历史夜晚', () => {
    const l = life()
    l.day = 1; l.slot = 1
    l.history.push({ seq: 1, day: 0, slot: 3, kind: 'action', label: '歇息', text: '深夜你在月下歇息。', degraded: false })
    const p = buildActPrompt({ life: l, meta, locationName: '坊市', playerInput: '走走', allowGrowth: false, timeBefore: { day: 1, slot: 0 } })
    const user = p.turns[0]!.content
    expect(user).toContain('时辰：午')
    expect(user).toContain('行动开始：第一年 春月二日 · 晨')
    expect(user).toContain('反馈结束：第一年 春月二日 · 午')
    expect(user).toContain('系统实际推进 1 个时段')
    expect(user).toContain('[第一年 春月一日 · 夜]')
    expect(p.system).toContain('不能自行推进至翌日')
  })
  it('无时间消耗的事件不允许过夜', () => {
    const l = life(); l.slot = 3
    const p = buildActPrompt({ life: l, meta, locationName: '坊市', playerInput: '用饭', allowGrowth: false, timeBefore: { day: 0, slot: 3 } })
    expect(p.turns[0]!.content).toContain('本次未推进时间')
    expect(p.turns[0]!.content).toContain('时辰：夜')
  })
  it('跨日、换季按引擎时间，战斗与结局也接收锚点', () => {
    const l = life(); l.day = 90; l.slot = 0
    const p = buildActPrompt({ life: l, meta, locationName: '坊市', playerInput: '住店', allowGrowth: false, timeBefore: { day: 89, slot: 3 } })
    expect(p.turns[0]!.content).toContain('季节：夏')
    expect(p.turns[0]!.content).toContain('系统实际推进 1 个时段')
    expect(buildBattlePrompt({ life: l, enemyName: '赵横', turn: 1, round: { facts: [], playerHp: 30 } }).turns[0]!.content).toContain('时辰：晨')
    expect(buildEndingPrompt({ life: l, meta, endingName: '终章', causeText: '' }).turns[0]!.content).toContain('季节：夏')
  })
})
