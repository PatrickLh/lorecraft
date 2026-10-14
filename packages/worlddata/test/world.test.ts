import { describe, expect, it } from 'vitest'
import {
  battleTurn,
  type BattleCommand,
  type BattleState,
  type EnemyDef,
  type LifeState,
  type Rng,
} from '@lorecraft/core'
import { createLife, eventCondMet } from '@lorecraft/core'
import {
  checkWorld,
  ENEMIES,
  EVENTS,
  MARTIALS,
  ORIGINS,
  LOCATIONS,
  FACTIONS,
  NPCS,
  ACTIONS,
  DESTINIES,
  ENDINGS,
} from '../src/index.js'
import { MARTIAL_DEFS } from '../src/index.js'

const NOW = '2026-01-01T00:00:00Z'

describe('世界数据完整性（plan P1）', () => {
  it('身世中的野林和柳府事件不会在未到达的地点触发', () => {
    const life = createLife('location-check', ORIGINS[0]!, NOW)
    for (const [id, location, destiny, flag] of [
      ['dest_jiachuan_2', 'yelin', 'jiachuan_miji', 'd_jiachuan_1'],
      ['dest_jiachuan_3', 'yelin', 'jiachuan_miji', 'd_jiachuan_2'],
      ['dest_miemen_2', 'yelin', 'miemen_chichou', 'd_miemen_1'],
      ['dest_miemen_3', 'yelin', 'miemen_chichou', 'd_miemen_2'],
      ['dest_shenshi_2', 'fangshi', 'shenshi_zhimi', 'd_shenshi_1'],
      ['dest_shenshi_3', 'fangshi', 'shenshi_zhimi', 'd_shenshi_2'],
    ]) {
      life.destinyId = destiny!
      life.flags = [flag!]
      life.locationId = 'matou'
      const event = EVENTS.find(e => e.id === id)!
      expect(eventCondMet(life, event.cond)).toBe(false)
      life.locationId = location!
      expect(eventCondMet(life, event.cond)).toBe(true)
    }
  })
  it('checks 全过', () => {
    expect(
      checkWorld({
        locations: LOCATIONS,
        factions: FACTIONS,
        npcs: NPCS,
        actions: ACTIONS,
        martials: MARTIALS,
        enemies: ENEMIES,
        origins: ORIGINS,
        destinies: DESTINIES,
        endings: ENDINGS,
        events: EVENTS,
      })
    ).toEqual([])
  })

  it('数量达标：26 武学 / 20+ 沙箱事件 / 9 身世链事件', () => {
    expect(MARTIALS).toHaveLength(26)
    expect(EVENTS.filter((e) => !e.cond?.destiny).length).toBeGreaterThanOrEqual(20)
    expect(EVENTS.filter((e) => e.cond?.destiny).length).toBe(9)
  })

  it('武学档位分布：三流10/二流8/一流6/绝学2', () => {
    const byTier = (t: number) => MARTIALS.filter((m) => m.tier === t).length
    expect(byTier(1)).toBe(10)
    expect(byTier(2)).toBe(8)
    expect(byTier(3)).toBe(6)
    expect(byTier(4)).toBe(2)
  })
})

describe('战斗分布模拟器（plan P1：≥100 场，无首回合秒杀，平均回合数合理）', () => {
  const stagedRng = (seed: number): Rng => {
    let s = seed
    return () => {
      s = (s * 16807 + 11) % 2147483647
      return s / 2147483647
    }
  }

  interface Profile { name: string; atk: number; def: number; agi: number; hp: number }
  const profiles: Profile[] = [
    { name: '初期小虾米', atk: 6, def: 3, agi: 5, hp: 30 },
    { name: '中期武者', atk: 12, def: 8, agi: 10, hp: 45 },
    { name: '后期好手', atk: 20, def: 12, agi: 16, hp: 60 },
  ]

  function simBattle(p: Profile, enemy: EnemyDef, seed: number): { rounds: number; result: string; playerDied: boolean } {
    const life: LifeState = createLife('sim', {
      id: 'sim', name: 'sim', desc: '', money: 0, food: 10, rep: 0, locationId: 'fangshi', destiny: null,
    }, NOW)
    life.attrs.atk = p.atk
    life.attrs.def = p.def
    life.attrs.agi = p.agi
    life.attrs.maxHp = p.hp
    life.attrs.hp = p.hp
    life.martials = [{ id: 'taizu_quan', level: 0 }]
    let battle: BattleState = {
      enemy: { ...enemy, defId: enemy.id, hp: enemy.hp, maxHp: enemy.hp },
      turn: 0,
      playerFirst: life.attrs.agi >= enemy.agi,
      finished: false,
      result: null,
      rounds: [],
    }
    const rng = stagedRng(seed)
    let guard = 0
    while (!battle.finished && guard < 200) {
      guard++
      // 简单策略：有真气就出基础拳（招式成本恒定），其余普攻
      const cmd: BattleCommand = life.attrs.mp >= 2 ? { kind: 'skill', martialId: 'taizu_quan' } : { kind: 'attack' }
      const res = battleTurn(life, battle, cmd, MARTIAL_DEFS, rng)
      Object.assign(life, { attrs: res.life.attrs })
      battle = res.battle
    }
    return {
      rounds: battle.turn,
      result: battle.result ?? 'unknown',
      playerDied: battle.result === 'lose',
    }
  }

  it('3 个成长阶段 × 8 种敌人 × 5 种子 = 120 场；初期不首回合死、平均回合 2~12', () => {
    const allRounds: number[] = []
    let firstRoundPlayerDeaths = 0
    for (const p of profiles) {
      for (const enemy of ENEMIES) {
        for (let seed = 1; seed <= 5; seed++) {
          const r = simBattle(p, enemy, seed)
          allRounds.push(r.rounds)
          if (p.name === '初期小虾米' && r.rounds <= 1 && r.playerDied) firstRoundPlayerDeaths++
          expect(r.rounds).toBeLessThan(200)
          expect(['win', 'lose', 'fled']).toContain(r.result)
        }
      }
    }
    expect(allRounds.length).toBeGreaterThanOrEqual(100)
    const avg = allRounds.reduce((s, n) => s + n, 0) / allRounds.length
    expect(avg).toBeGreaterThan(2)
    expect(avg).toBeLessThan(12)
    expect(firstRoundPlayerDeaths).toBe(0)
  })
})
