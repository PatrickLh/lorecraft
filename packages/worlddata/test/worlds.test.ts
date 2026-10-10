import { describe, expect, it } from 'vitest'
import { checkWorlds, getWorld, WORLDS } from '../src/index.js'

describe('世界数据完整性（plan P1）', () => {
  it('三个世界全部通过完整性检查', () => {
    expect(checkWorlds(WORLDS)).toEqual([])
  })

  it('恰好一个初始世界，链式解锁：便利店 → 青云门 → 风雪山庄', () => {
    const ids = WORLDS.map((w) => w.id)
    expect(ids).toEqual(['bianlidian', 'qingyunmen', 'fengxue'])
    expect(getWorld('bianlidian')?.unlocks).toEqual(['qingyunmen'])
    expect(getWorld('qingyunmen')?.unlocks).toEqual(['fengxue'])
  })

  it('每个世界都存在一条可达通关路径（前置闭包覆盖全部 winFlags）', () => {
    for (const w of WORLDS) {
      const reached = new Set<string>()
      let progress = true
      while (progress) {
        progress = false
        for (const f of w.flagCatalog) {
          if (reached.has(f.id)) continue
          if ((f.requires ?? []).every((r) => reached.has(r))) {
            reached.add(f.id)
            progress = true
          }
        }
      }
      for (const wf of w.winFlags) {
        expect(reached.has(wf)).toBe(true)
      }
    }
  })

  it('每个世界有 3 幕、2~3 条入场建议行动、balanceHint 为正', () => {
    for (const w of WORLDS) {
      expect(w.acts).toHaveLength(3)
      expect(w.entryActions.length).toBeGreaterThanOrEqual(2)
      expect(w.entryActions.length).toBeLessThanOrEqual(3)
      expect(w.balanceHint).toBeGreaterThan(0)
    }
  })
})
