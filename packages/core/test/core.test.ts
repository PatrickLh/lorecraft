import { describe, expect, it } from 'vitest'
import {
  applyTurn,
  applyWorldFirstClear,
  createMetaState,
  createRunState,
  enterWorld,
  fallbackMerge,
  registerDeath,
  sanitizeMemories,
  unlockedWorldIds,
  validateDeclaration,
  WORLD_CLEAR_LIFESPAN_REWARD,
  type MetaState,
  type RunState,
  type TurnDeclaration,
  type WorldRulesView,
} from '../src/index.js'

const world: WorldRulesView = {
  id: 'w1',
  title: '测试世界',
  flagCatalog: [
    { id: 'f1', description: 'flag one' },
    { id: 'f2', description: 'flag two', requires: ['f1'] },
    { id: 'amb', description: 'ambiguous' },
    { id: 'win1', description: 'win part' },
  ],
  acts: [
    { id: 'a1', title: '一', milestoneFlags: ['f1'] },
    { id: 'a2', title: '二', milestoneFlags: ['f2'] },
  ],
  winFlags: ['win1'],
}

let idSeq = 0
const genId = () => `id-${++idSeq}`
const NOW = '2026-01-01T00:00:00Z'

function makeRun(cap = 60): RunState {
  return createRunState('run-1', cap, NOW)
}

function enter(run: RunState, w: WorldRulesView = world, unlocked = true): RunState {
  const res = enterWorld(run, w, { unlocked })
  if (!res.ok) throw new Error(`enter failed: ${res.error}`)
  return res.run
}

function decl(partial: Partial<TurnDeclaration>): TurnDeclaration {
  return { narrative: '叙事', ...partial }
}

describe('初始状态与重开（plan §2 重开属性）', () => {
  it('新局：属性各 10，寿命 = 继承上限', () => {
    const run = makeRun(65)
    expect(run.attrs).toEqual({ con: 10, mind: 10, agi: 10 })
    expect(run.lifespan).toBe(65)
    expect(run.capSnapshot).toBe(65)
    expect(run.phase).toBe('hub')
  })

  it('死亡后重开：属性恢复 10、物品为空、寿命 = 继承后的上限（不得为 0）', () => {
    const meta: MetaState = { ...createMetaState(NOW), lifespanCap: 70 }
    const run = createRunState('run-2', meta.lifespanCap, NOW)
    expect(run.attrs.con).toBe(10)
    expect(run.items).toEqual([])
    expect(run.statusTags).toEqual([])
    expect(run.lifespan).toBe(70)
  })
})

describe('回合结算顺序（plan §2）', () => {
  it('基础寿命 -1：降级回合也扣，且无申报变更', () => {
    const run = enter(makeRun())
    const res = applyTurn(run, world, { decl: null, now: NOW, newItemId: genId })
    expect(res.run.lifespan).toBe(59)
    expect(res.record.degraded).toBe(true)
    expect(res.record.changes).toBeNull()
    expect(res.outcome.kind).toBe('continue')
  })

  it('申报应用：属性/物品/标签/flag，事件寿命可抵消基础消耗', () => {
    const run = enter(makeRun())
    const d = decl({
      stateChanges: {
        attributeDelta: { con: -2 },
        lifespanDelta: 1, // 事件 +1 抵消基础 -1
        itemsGained: [{ name: '手电筒', desc: '照亮黑暗' }],
        tagsGained: ['轻伤'],
      },
      flagsAchieved: ['f1'],
    })
    const res = applyTurn(run, world, { decl: d, now: NOW, newItemId: genId })
    expect(res.run.lifespan).toBe(60) // -1 +1
    expect(res.run.attrs.con).toBe(8)
    expect(res.run.items).toHaveLength(1)
    expect(res.run.statusTags).toEqual(['轻伤'])
    expect(res.run.visit?.flags['f1']).toBe(true)
    expect(res.record.changes?.flagsAchieved).toEqual(['f1'])
  })

  it('物品按名称唯一删除；重名删除在合法性关拒绝', () => {
    let run = enter(makeRun())
    run = applyTurn(run, world, {
      decl: decl({ stateChanges: { itemsGained: [{ name: '灵石' }] } }),
      now: NOW,
      newItemId: genId,
    }).run
    run = applyTurn(run, world, {
      decl: decl({ stateChanges: { itemsLostNames: ['灵石'] } }),
      now: NOW,
      newItemId: genId,
    }).run
    expect(run.items).toHaveLength(0)

    // 造出两件同名
    let dup = enter(makeRun())
    dup = applyTurn(dup, world, {
      decl: decl({ stateChanges: { itemsGained: [{ name: '灵石' }, { name: '灵石' }] } }),
      now: NOW,
      newItemId: genId,
    }).run
    const failure = validateDeclaration(dup, world, decl({ stateChanges: { itemsLostNames: ['灵石'] } }))
    expect(failure?.gate).toBe('legality')
  })

  it('数值截断：寿命不超过上限快照，属性不超过 20', () => {
    const run = enter(makeRun(60))
    const res = applyTurn(run, world, {
      decl: decl({ stateChanges: { lifespanDelta: 10, attributeDelta: { con: 3 } } }),
      now: NOW,
      newItemId: genId,
    })
    expect(res.run.lifespan).toBe(60)
    expect(res.run.attrs.con).toBe(13)
  })

  it('同回合事件可抵消基础消耗但不会净增寿命超过上限', () => {
    const run = enter(makeRun(60))
    const res = applyTurn(run, world, {
      decl: decl({ stateChanges: { lifespanDelta: 10 } }),
      now: NOW,
      newItemId: genId,
    })
    expect(res.run.lifespan).toBe(60) // 60 -1 +10 → clamp 60
  })
})

describe('三种死亡（验收矩阵）', () => {
  it('寿命归零 → 死于寿命', () => {
    const run = { ...enter(makeRun()), lifespan: 1 }
    const res = applyTurn(run, world, { decl: null, now: NOW, newItemId: genId })
    expect(res.outcome).toEqual({ kind: 'dead', cause: 'lifespan' })
    expect(res.run.phase).toBe('dead')
  })

  it('体质归零 → 死于体质；心智归零 → 死于心智', () => {
    const r1 = applyTurn(enter(makeRun()), world, {
      decl: decl({ stateChanges: { attributeDelta: { con: -3 } } }),
      now: NOW,
      newItemId: genId,
    })
    // 需要连续扣到 0：直接构造低体质局
    const low = enter({ ...makeRun(), attrs: { con: 2, mind: 10, agi: 10 } })
    const res1 = applyTurn(low, world, {
      decl: decl({ stateChanges: { attributeDelta: { con: -3 } } }),
      now: NOW,
      newItemId: genId,
    })
    expect(res1.outcome).toEqual({ kind: 'dead', cause: 'con' })
    void r1

    const lowMind = enter({ ...makeRun(), attrs: { con: 10, mind: 1, agi: 10 } })
    const res2 = applyTurn(lowMind, world, {
      decl: decl({ stateChanges: { attributeDelta: { mind: -3 } } }),
      now: NOW,
      newItemId: genId,
    })
    expect(res2.outcome).toEqual({ kind: 'dead', cause: 'mind' })
  })

  it('敏捷归零不死亡（验收矩阵：AGI 归零不死亡）', () => {
    const low = enter({ ...makeRun(), attrs: { con: 10, mind: 10, agi: 2 } })
    const res = applyTurn(low, world, {
      decl: decl({ stateChanges: { attributeDelta: { agi: -3 } } }),
      now: NOW,
      newItemId: genId,
    })
    expect(res.outcome.kind).toBe('continue')
    expect(res.run.phase).toBe('in_world')
    expect(res.run.attrs.agi).toBe(0)
  })

  it('死亡优先于通关：同回合死亡不发通关奖励', () => {
    const low = enter({ ...makeRun(), attrs: { con: 2, mind: 10, agi: 10 } })
    const res = applyTurn(low, world, {
      decl: decl({
        stateChanges: { attributeDelta: { con: -3 } },
        flagsAchieved: ['win1'],
      }),
      now: NOW,
      newItemId: genId,
    })
    expect(res.outcome).toEqual({ kind: 'dead', cause: 'con' })
    expect(res.run.lifespan).toBe(59) // 无 +15，仅基础 -1
    expect(res.run.worldCompletions).toEqual([])
    expect(res.run.phase).toBe('dead')
  })
})

describe('幕推进与通关（plan P1）', () => {
  it('里程碑达成推进幕表', () => {
    let run = enter(makeRun())
    expect(run.visit?.actIndex).toBe(0)
    run = applyTurn(run, world, { decl: decl({ flagsAchieved: ['f1'] }), now: NOW, newItemId: genId }).run
    expect(run.visit?.actIndex).toBe(1)
    run = applyTurn(run, world, { decl: decl({ flagsAchieved: ['f2'] }), now: NOW, newItemId: genId }).run
    // a2 是最后一幕，actIndex 保持 1
    expect(run.visit?.actIndex).toBe(1)
  })

  it('通关：+15 寿命（截断到上限）、回枢纽、记录本局完成、后续不可重复进入', () => {
    let run = enter(makeRun(60))
    const res = applyTurn(run, world, { decl: decl({ flagsAchieved: ['win1'] }), now: NOW, newItemId: genId })
    expect(res.outcome.kind).toBe('world_completed')
    if (res.outcome.kind !== 'world_completed') return
    expect(res.outcome.lifespanReward).toBe(WORLD_CLEAR_LIFESPAN_REWARD)
    expect(res.run.lifespan).toBe(60) // 60 - 1 + 15 = 74 → 截断到上限 60
    expect(res.run.phase).toBe('hub')
    expect(res.run.visit).toBeNull()
    expect(res.run.worldCompletions).toEqual(['w1'])

    const again = enterWorld(res.run, world, { unlocked: true })
    expect(again).toEqual({ ok: false, error: 'already_completed_this_run' })
  })

  it('进入世界的门禁：未解锁 / 不在枢纽', () => {
    expect(enterWorld(makeRun(), world, { unlocked: false })).toEqual({ ok: false, error: 'world_locked' })
    const inWorld = enter(makeRun())
    expect(enterWorld(inWorld, world, { unlocked: true })).toEqual({ ok: false, error: 'not_in_hub' })
  })
})

describe('三关校验（plan §2 flag 权威性 / requirement §9.2）', () => {
  it('range：属性越界、寿命越界、叙事超长、建议行动超额', () => {
    const run = enter(makeRun())
    expect(validateDeclaration(run, world, decl({ stateChanges: { attributeDelta: { con: 4 } } }))?.gate).toBe('range')
    expect(validateDeclaration(run, world, decl({ stateChanges: { lifespanDelta: -11 } }))?.gate).toBe('range')
    expect(validateDeclaration(run, world, decl({ narrative: 'x'.repeat(2001) }))?.gate).toBe('range')
    expect(
      validateDeclaration(run, world, decl({ suggestedActions: ['a', 'b', 'c', 'd'] }))?.gate
    ).toBe('range')
    expect(validateDeclaration(run, world, decl({ stateChanges: { attributeDelta: { con: 2.5 } } }))?.gate).toBe('range')
  })

  it('whitelist：未知 flag 拒绝', () => {
    const run = enter(makeRun())
    expect(validateDeclaration(run, world, decl({ flagsAchieved: ['nope'] }))?.gate).toBe('whitelist')
  })

  it('legality：已达成 flag、前置未满足、删除不存在标签', () => {
    let run = enter(makeRun())
    expect(validateDeclaration(run, world, decl({ flagsAchieved: ['f2'] }))?.gate).toBe('legality')
    run = applyTurn(run, world, { decl: decl({ flagsAchieved: ['f1'] }), now: NOW, newItemId: genId }).run
    expect(validateDeclaration(run, world, decl({ flagsAchieved: ['f1'] }))?.gate).toBe('legality')
    expect(validateDeclaration(run, world, decl({ flagsAchieved: ['f2'] }))).toBeNull()
    expect(validateDeclaration(run, world, decl({ stateChanges: { tagsRemoved: ['不存在'] } }))?.gate).toBe('legality')
  })
})

describe('继承层（验收矩阵：寿命上限继承）', () => {
  it('首次永久通关 +5，重复通关不再加（65 → 65 → 70）', () => {
    let meta = createMetaState(NOW)
    expect(meta.lifespanCap).toBe(60)
    const first = applyWorldFirstClear(meta, 'w1')
    expect(first.granted).toBe(true)
    meta = first.meta
    expect(meta.lifespanCap).toBe(65)
    const second = applyWorldFirstClear(meta, 'w1')
    expect(second.granted).toBe(false)
    expect(second.meta.lifespanCap).toBe(65)
    const third = applyWorldFirstClear(meta, 'w2')
    expect(third.meta.lifespanCap).toBe(70)
  })

  it('解锁推导：初始世界可见，通关后解锁后继', () => {
    const worlds = [
      { id: 'w1', unlocks: ['w2'] },
      { id: 'w2', unlocks: ['w3'] },
      { id: 'w3', unlocks: [] },
    ]
    let meta = createMetaState(NOW)
    expect(unlockedWorldIds(meta, worlds)).toEqual(new Set(['w1']))
    meta = { ...meta, permanentClearedWorlds: ['w1'] }
    expect(unlockedWorldIds(meta, worlds)).toEqual(new Set(['w1', 'w2']))
    meta = { ...meta, permanentClearedWorlds: ['w1', 'w2'] }
    expect(unlockedWorldIds(meta, worlds)).toEqual(new Set(['w1', 'w2', 'w3']))
  })

  it('死亡计数', () => {
    const meta = registerDeath(createMetaState(NOW))
    expect(meta.deathCount).toBe(1)
  })
})

describe('记忆纯函数（plan §2 记忆生命周期）', () => {
  it('sanitize：截断 50 字、去空、去重、最多 5 条', () => {
    const out = sanitizeMemories([
      { text: '  ' },
      { text: 'a'.repeat(80) },
      { text: '第一条' },
      { text: '第一条' },
      { text: '二' },
      { text: '三' },
      { text: '四' },
      { text: '五' },
      { text: '六' },
    ])
    expect(out).toHaveLength(5)
    expect(out[0]).toBe('a'.repeat(50))
    expect(out).toContain('第一条')
  })

  it('fallbackMerge：去重 + 超限淘汰最旧', () => {
    const existing: ReturnType<typeof createMetaState>['memories'] = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      text: `旧${i}`,
      source: 'w',
      createdAt: NOW,
    }))
    const merged = fallbackMerge(existing, ['新1', '旧0', '新2'], {
      source: 'w',
      now: NOW,
      genId,
    })
    expect(merged).toHaveLength(20)
    // 合并后共 22 条，超出上限 → 淘汰最旧的「旧0」「旧1」
    expect(merged.some((m) => m.text === '旧0')).toBe(false)
    expect(merged.some((m) => m.text === '旧1')).toBe(false)
    expect(merged.some((m) => m.text === '旧2')).toBe(true)
    expect(merged.some((m) => m.text === '新1')).toBe(true)
    expect(merged.some((m) => m.text === '新2')).toBe(true)
    // 未超限时重复条目不重复添加
    const small = fallbackMerge(
      [{ id: 'a', text: '只有一条', source: 'w', createdAt: NOW }],
      ['只有一条', '新增'],
      { source: 'w', now: NOW, genId }
    )
    expect(small).toHaveLength(2)
  })
})
