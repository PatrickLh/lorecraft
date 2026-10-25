import { advanceTime, applyFixedAction, type DailyChoice, type LifeState, type Rng } from '@lorecraft/core'
import { MARTIAL_DEFS } from '@lorecraft/worlddata'

export const DAILY_RULES = {
  work: '银两 +3，温饱 +3', meal: '银两 −1，温饱 +4',
  train: '有机会武力 +1（每日成长上限照常）', rest: '气血 +3，真气 +2', investigate: '观察线索，无物资收益',
}

export function settleDailyChoice(life: LifeState, choice: DailyChoice, rng: Rng) {
  if (choice.activity === 'investigate') {
    const next = structuredClone(life)
    const tick = advanceTime(next, 1)
    return { life: next, facts: tick.facts, diedOfStarve: tick.diedOfStarve, goodDeath: tick.goodDeath, invalid: undefined }
  }
  const rules = {
    work: { moneyGain: [3, 3] as [number, number], foodGain: 3 },
    meal: { moneyCost: 1, foodGain: 4 },
    train: { growth: { key: 'atk' as const, chance: .3 } },
    rest: { hpGain: 3, mpGain: 2 },
  }
  return applyFixedAction(life, { id: `daily_${choice.activity}`, label: choice.label, desc: '', slots: 1, ...rules[choice.activity] }, MARTIAL_DEFS, rng)
}
