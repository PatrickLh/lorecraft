/**
 * 三层成长（requirement §5）：手写事件/修炼行动由代码结算；
 * LLM 自由申报 ≤1 点/日，理由标签必须与属性类别匹配，违规整份拒绝。
 */
import {
  ATTR_MAX,
  LLM_GROW_AMOUNT_MAX,
  LLM_GROW_PER_DAY,
  NEIGONG_IMMUNE_LEVEL,
  TRAIN_GROW_PER_DAY_PER_ATTR,
} from './constants.js'
import type { GrowKey, GrowReasonTag, LifeState } from './types.js'
import { GROW_LABELS, TAG_ALLOWED_KEYS } from './types.js'
import { ageOf } from './calendar.js'
import { maxCategoryLevel } from './battle.js'
import type { MartialDef } from './types.js'

export interface GrowthDecl {
  key: GrowKey
  reasonTag: GrowReasonTag
  reason: string
}

/** LLM 成长申报校验（返回拒绝理由或 null） */
export function validateGrowthDecl(life: LifeState, growth: unknown): string | null {
  const g = growth as Partial<GrowthDecl>
  if (!g || typeof g.key !== 'string' || typeof g.reasonTag !== 'string') {
    return 'growth：缺少 key 或 reasonTag'
  }
  if (typeof g.reason !== 'string' || g.reason.trim().length === 0) {
    return 'growth：缺少理由'
  }
  if (g.key.length > LLM_GROW_AMOUNT_MAX.toString().length + 20) {
    return 'growth：key 非法'
  }
  const allowed = TAG_ALLOWED_KEYS[g.reasonTag as GrowReasonTag]
  if (!allowed) return `growth：未知理由标签 ${g.reasonTag}`
  if (!allowed.includes(g.key as GrowKey)) {
    const names = allowed.map((k) => GROW_LABELS[k]).join('/')
    return `growth：理由类别「${g.reasonTag}」只能用于 ${names}，不能用于「${GROW_LABELS[g.key as GrowKey] ?? g.key}」`
  }
  ensureGrowthToday(life)
  if (life.growthToday.llmUsed >= LLM_GROW_PER_DAY) {
    return 'growth：今日的成长际遇已用尽（每日至多 1 次）'
  }
  return null
}

export function ensureGrowthToday(life: LifeState): void {
  if (life.growthToday.day !== life.day) {
    life.growthToday = { day: life.day, llmUsed: 0, trained: {} }
  }
}

/** 应用成长（clamp 到属性上限）；isLlm 时计入每日限额，isTrain 时计入每属性日限 */
export function applyGrow(
  life: LifeState,
  key: GrowKey,
  amount: number,
  source: 'event' | 'train' | 'llm',
  martialDefs?: Map<string, MartialDef>
): boolean {
  const attrs: LifeState['attrs'] = { ...life.attrs }
  if (key === 'maxHp' || key === 'maxMp') {
    attrs[key] = Math.min(99, Math.max(1, attrs[key] + amount))
    if (key === 'maxHp') attrs.hp = Math.min(attrs.maxHp, attrs.hp + Math.max(0, amount))
    if (key === 'maxMp') attrs.mp = Math.min(attrs.maxMp, attrs.mp + Math.max(0, amount))
    life.attrs = attrs
    return true
  }
  // 衰老下限保护：不低于 1；上限 ATTR_MAX
  const cap = key === 'atk' && martialDefs ? effectiveAtkCap(life, martialDefs) : ATTR_MAX
  attrs[key] = Math.min(cap, Math.max(1, attrs[key] + amount))
  const changed = attrs[key] !== life.attrs[key]
  life.attrs = attrs
  if (source === 'llm') {
    ensureGrowthToday(life)
    life.growthToday.llmUsed += 1
  }
  return changed
}

/** 武力成长上限：内功大成可破常规极限 */
function effectiveAtkCap(life: LifeState, martialDefs: Map<string, MartialDef>): number {
  return maxCategoryLevel(life, martialDefs, 'neigong') >= NEIGONG_IMMUNE_LEVEL ? ATTR_MAX + 5 : ATTR_MAX
}

/** 修炼行动的成长掷点（每属性每日至多 TRAIN_GROW_PER_DAY_PER_ATTR 次） */
export function rollTrainGrowth(
  life: LifeState,
  key: GrowKey,
  chance: number,
  rng: () => number
): boolean {
  ensureGrowthToday(life)
  const used = life.growthToday.trained[key] ?? 0
  if (used >= TRAIN_GROW_PER_DAY_PER_ATTR) return false
  if (rng() >= chance) return false
  life.growthToday.trained[key] = used + 1
  return true
}

/** 衰老判定（换年时调用）：≥60 岁每 5 年武力/敏捷 -1，内功大成免疫 */
export function agingDecay(life: LifeState, martialDefs: Map<string, MartialDef>): string | null {
  const age = ageOf(life.day)
  if (age < 60) return null
  if ((age - 60) % 5 !== 0) return null
  if (maxCategoryLevel(life, martialDefs, 'neigong') >= NEIGONG_IMMUNE_LEVEL) return null
  const facts: string[] = []
  for (const key of ['atk', 'agi'] as const) {
    if (life.attrs[key] > 1) {
      life.attrs = { ...life.attrs, [key]: life.attrs[key] - 1 }
      facts.push(`年事渐高，${key === 'atk' ? '武力' : '敏捷'}不复当年（-1）`)
    }
  }
  return facts.join('；') || null
}

export const __growthLabels = { GROW_LABELS }
