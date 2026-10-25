import { describe, expect, it } from 'vitest'
import {
  battleTurn,
  createMetaState,
  type BattleState,
  type LifeState,
  type MartialDef,
} from '../src/index.js'
import {
  advanceTime,
  applyFixedAction,
  applyGrow,
  applyOutcome,
  checkAchievedEnding,
  createLife,
  markLifeEnd,
  settleLifeEnd,
  validateGrowthDecl,
} from '../src/index.js'
import { applyLifeMemories, reqDiscountForLives } from '../src/inheritance.js'
import { pickEvent, markEventSeen, choiceAvailable } from '../src/events.js'
import { ageOf, formatDate } from '../src/calendar.js'
import type { ActionDefView, EndingDef, EventDefView, OriginDefView, Rng } from '../src/index.js'

const NOW = '2026-01-01T00:00:00Z'
const genId = () => crypto.randomUUID()
const seqRng: Rng = (() => {
  let s = 42
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
})()

const origin: OriginDefView = {
  id: 'test_origin',
  name: '测试出身',
  desc: '',
  money: 50,
  food: 10,
  rep: 0,
  locationId: 'fangshi',
  destiny: null,
}

function makeLife(): LifeState {
  return createLife('life-1', origin, NOW)
}

const martialDefs: Map<string, MartialDef> = new Map(
  [
    { id: 'm1', name: '拳法一', category: 'fist', tier: 1, reqs: {}, mpCost: 2, powerMul: 1.0, desc: '' },
    { id: 'm2', name: '拳法二', category: 'fist', tier: 2, reqs: { atk: 8 }, mpCost: 3, powerMul: 1.3, desc: '' },
    { id: 'm3', name: '内功一', category: 'neigong', tier: 1, reqs: {}, mpCost: 0, powerMul: 0, desc: '' },
  ].map((m) => [m.id, m as MartialDef])
)

describe('日历（plan §2 时间粒度）', () => {
  it('时段→日→季→年→年龄', () => {
    const life = makeLife()
    expect(ageOf(life.day)).toBe(16)
    expect(formatDate(0, 0)).toContain('晨')
    // 360 天 → 17 岁
    expect(ageOf(360)).toBe(17)
    expect(ageOf(360 * 54)).toBe(70)
  })

  it('换年触发年岁增长事实', () => {
    const life = makeLife()
    const res = advanceTime(life, 4 * 360) // 一整年
    expect(life.day).toBe(360)
    expect(res.facts.some((f) => f.includes('17 岁'))).toBe(true)
  })
})

describe('温饱与断粮（plan §2）', () => {
  it('恢复温饱后分馍跨夜，不继承旧的连续断粮计数', () => {
    const life = makeLife()
    life.food = 3
    life.slot = 3
    life.starveDays = 2
    const result = applyOutcome(life, { label: '分他半个馍', outcome: { food: -2 } }, new Map(), () => 0)
    expect(result.life.food).toBe(0)
    expect(result.life.starveDays).toBe(1)
    expect(result.starved).toBe(false)
    expect(result.facts.some(f => f.includes('断粮第 1 天'))).toBe(true)
  })
  it('断粮扣血并累积天数，3 天饿死', () => {
    const life = makeLife()
    life.food = 0
    let died = false
    for (let i = 0; i < 4; i++) {
      const res = advanceTime(life, 4)
      if (res.diedOfStarve) died = true
    }
    expect(life.starveDays).toBeGreaterThanOrEqual(3)
    expect(died).toBe(true)
  })

  it('有粮不扣血', () => {
    const life = makeLife()
    life.food = 10
    const hpBefore = life.attrs.hp
    advanceTime(life, 8)
    expect(life.starveDays).toBe(0)
    expect(life.attrs.hp).toBe(hpBefore)
  })
})

describe('三层成长（requirement §5）', () => {
  it('LLM 申报：类别不匹配整份拒绝', () => {
    const life = makeLife()
    expect(validateGrowthDecl(life, { key: 'int', reasonTag: 'combat', reason: '胡说' })).toContain('不能用于')
    expect(validateGrowthDecl(life, { key: 'atk', reasonTag: 'combat', reason: '比武得胜' })).toBeNull()
  })

  it('LLM 申报：每日至多 1 次', () => {
    const life = makeLife()
    applyGrow(life, 'atk', 1, 'llm')
    expect(life.growthToday.llmUsed).toBe(1)
    expect(validateGrowthDecl(life, { key: 'atk', reasonTag: 'combat', reason: '再来' })).toContain('已用尽')
    // 次日重置
    advanceTime(life, 4)
    expect(validateGrowthDecl(life, { key: 'atk', reasonTag: 'combat', reason: '新的一天' })).toBeNull()
  })

  it('修炼行动：概率成长且每属性每日限 1', () => {
    const life = makeLife()
    const action: ActionDefView = { id: 'lianwu', label: '练武', slots: 1, growth: { key: 'atk', chance: 1 } }
    const res = applyFixedAction(life, action, martialDefs, () => 0.1) // 必中
    expect(res.life.attrs.atk).toBe(life.attrs.atk + 1)
    // 第二次同日不再涨
    const res2 = applyFixedAction(res.life, action, martialDefs, () => 0.1)
    expect(res2.life.attrs.atk).toBe(res.life.attrs.atk)
  })

  it('事件成长由代码直接结算', () => {
    const life = makeLife()
    const res = applyOutcome(
      life,
      { label: 'x', outcome: { attrs: { atk: 1, int: 1 } } },
      martialDefs,
      seqRng
    )
    expect(res.life.attrs.atk).toBe(6)
    expect(res.life.attrs.int).toBe(6)
  })
})

describe('战斗引擎（requirement §4）', () => {
  const enemyDef = {
    id: 'e1',
    defId: 'e1',
    name: '测试敌',
    hp: 30,
    maxHp: 30,
    atk: 6,
    def: 3,
    agi: 5,
    tendency: 'balanced' as const,
    lethal: false,
    loot: [5, 10] as [number, number],
  }

  it('真气不足拒绝出招且不消耗回合', () => {
    const life = makeLife()
    life.martials = [{ id: 'm1', level: 0 }]
    life.attrs.mp = 0
    const res = battleTurn(life, { enemy: { ...enemyDef, hp: enemyDef.hp, maxHp: 30 }, turn: 0, playerFirst: true, finished: false, result: null, rounds: [] }, { kind: 'skill', martialId: 'm1' }, martialDefs, seqRng)
    expect(res.invalid).toContain('真气不足')
    expect(res.battle.turn).toBe(0)
  })

  it('伤害公式：武力×倍率×等级系数−防御，下限 1', () => {
    const life = makeLife()
    life.attrs.atk = 10
    life.martials = [{ id: 'm1', level: 0 }]
    const battle: BattleState = { enemy: { ...enemyDef }, turn: 0, playerFirst: true, finished: false, result: null, rounds: [] }
    // 用确定 rng：命中且不暴击
    let calls = 0
    const rng: Rng = () => {
      calls += 1
      return 0.9
    }
    const res = battleTurn({ ...life }, { ...battle, enemy: { ...battle.enemy } }, { kind: 'skill', martialId: 'm1' }, martialDefs, rng)
    const fact = res.round.facts.find((f) => f.includes('伤害'))
    expect(fact).toBeTruthy()
    // atk 10 × 1.0 × 1.0 − def 3 = 7；敌方随后喘息 +2
    expect(res.battle.enemy.hp).toBe(30 - 7 + 2)
  })

  it('战败非 lethal → 重伤；战败 lethal → 死亡', () => {
    const life = makeLife()
    const strongEnemy = { ...enemyDef, hp: 999, maxHp: 999, atk: 30 }
    let battle: BattleState = { enemy: { ...strongEnemy }, turn: 0, playerFirst: true, finished: false, result: null, rounds: [] }
    let cur = life
    for (let i = 0; i < 50 && !battle.finished; i++) {
      const res = battleTurn(cur, battle, { kind: 'attack' }, martialDefs, seqRng)
      cur = res.life
      battle = res.battle
    }
    expect(battle.result).toBe('lose')
    expect(cur.attrs.hp).toBeGreaterThanOrEqual(0)
  })

  it('逃跑成功即脱身', () => {
    const life = makeLife()
    life.attrs.agi = 30 // 必定逃脱
    const battle: BattleState = { enemy: { ...enemyDef }, turn: 0, playerFirst: true, finished: false, result: null, rounds: [] }
    const res = battleTurn(life, { ...battle, enemy: { ...battle.enemy } }, { kind: 'flee' }, martialDefs, () => 0.01)
    expect(res.battle.result).toBe('fled')
  })
})

describe('事件引擎（requirement §8）', () => {
  const events: EventDefView[] = [
    { id: 'a', title: 'A', weight: 1, cond: { location: 'fangshi' }, text: '', choices: [{ label: 'x', outcome: {} }] },
    { id: 'b', title: 'B', weight: 5, cond: { location: 'yamen' }, text: '', choices: [{ label: 'x', outcome: {} }] },
    { id: 'c', title: 'C', weight: 1, cond: { flag: 'special' }, text: '', choices: [{ label: 'x', outcome: {} }] },
  ]

  it('条件过滤与冷却', () => {
    const life = makeLife()
    expect(pickEvent(life, events, seqRng)?.id).toBe('a')
    markEventSeen(life, 'a')
    // a 冷却中，且地点不符 → 无事件
    expect(pickEvent(life, events, seqRng)).toBeNull()
    life.flags.push('special')
    expect(pickEvent(life, events, seqRng)?.id).toBe('c')
  })

  it('冷却 30 天后可再触发', () => {
    const life = makeLife()
    markEventSeen(life, 'a')
    advanceTime(life, 4 * 31)
    expect(pickEvent(life, events, seqRng)?.id).toBe('a')
  })

  it('选项 req 不满足时不可选', () => {
    const life = makeLife()
    life.money = 3
    expect(choiceAvailable(life, { req: { money: 10 } })).toBe(false)
    expect(choiceAvailable(life, { req: { attrMin: { atk: 99 } } })).toBe(false)
    expect(choiceAvailable(life, {})).toBe(true)
  })
})

describe('结局系统（requirement §8）', () => {
  const endings: EndingDef[] = [
    { id: 'low', name: '低优先', kind: 'achieved', priority: 10, cond: { rep: 10 }, desc: '' },
    { id: 'high', name: '高优先', kind: 'achieved', priority: 90, cond: { rep: 10 }, desc: '' },
    { id: 'chosen', name: '选择型', kind: 'chosen', priority: 50, cond: { money: 100 }, desc: '' },
  ]

  it('同时命中取 priority 高者', () => {
    const life = makeLife()
    life.rep = 20
    expect(checkAchievedEnding(life, endings, martialDefs)?.id).toBe('high')
  })

  it('条件不满足不触发；选择型不参与静默判定', () => {
    const life = makeLife()
    life.rep = 0
    expect(checkAchievedEnding(life, endings, martialDefs)).toBeNull()
    life.money = 200
    expect(checkAchievedEnding(life, endings, martialDefs)).toBeNull()
  })
})

describe('轮回继承（requirement §9）', () => {
  it('履历入库、出身解锁、记忆合并', () => {
    const meta = createMetaState(NOW)
    const life = makeLife()
    life.martials = [{ id: 'm1', level: 1 }]
    markLifeEnd(life, 'death', { deathCause: 'battle' })
    const meta2 = settleLifeEnd(meta, life, NOW, ['origin_x'])
    expect(meta2.livesCount).toBe(1)
    expect(meta2.history[0]?.martials).toEqual([{ id: 'm1', level: 1 }])
    expect(meta2.unlockedOrigins).toEqual(['origin_x'])

    const meta3 = applyLifeMemories(meta2, ['仇人赵横的刀法有旧伤'], { now: NOW, genId, maxTotal: 20 })
    expect(meta3.memories.map((m) => m.text)).toContain('仇人赵横的刀法有旧伤')
  })

  it('后续世武学门槛减免', () => {
    expect(reqDiscountForLives(0)).toBe(0)
    expect(reqDiscountForLives(1)).toBe(1)
  })
})

it('精确夜间事件仅夜时辰可选，不能在黄昏提前触发', () => {
  const l = makeLife()
  const event: EventDefView = { id: 'night-only', title: '夜半', text: '夜色', weight: 1, cond: { slots: [3] }, choices: [] }
  l.slot = 2
  expect(pickEvent(l, [event], () => .5)).toBeNull()
  l.slot = 3
  expect(pickEvent(l, [event], () => .5)?.id).toBe('night-only')
})

it('住店从任意时辰歇到翌晨，而非固定跳过整日', () => {
  for (const slot of [0, 1, 2, 3]) {
    const l = makeLife(); l.slot = slot
    const result = applyFixedAction(l, { id: 'zhusu', label: '住店', slots: 4, restToMorning: true }, new Map(), () => .5)
    expect(result.life.day).toBe(l.day + 1)
    expect(result.life.slot).toBe(0)
    expect(result.facts).toContain(`歇宿至翌日清晨（消耗 ${4 - slot} 个时段）`)
  }
})
