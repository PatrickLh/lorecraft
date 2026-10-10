/**
 * 三关校验（plan §2 flag 权威性 / requirement §9.2）。
 * 任一关失败 → 整份申报拒绝，不静默截取部分申报。
 * schema 关由 @lorecraft/llm 的 zod 完成，这里只做 range / whitelist / legality。
 */
import {
  ATTR_DELTA_PER_TURN_MAX,
  FLAG_ACHIEVE_PER_TURN_MAX,
  FLAG_ID_MAX_CHARS,
  ITEM_COUNT_MAX,
  ITEM_DESC_MAX_CHARS,
  ITEM_GAIN_PER_TURN_MAX,
  ITEM_LOSE_PER_TURN_MAX,
  ITEM_NAME_MAX_CHARS,
  LIFESPAN_EVENT_DELTA_PER_TURN_MAX,
  NARRATIVE_MAX_CHARS,
  SUGGESTED_ACTIONS_MAX,
  SUGGESTION_MAX_CHARS,
  TAG_COUNT_MAX,
  TAG_MAX_CHARS,
  TAG_MUTATE_PER_TURN_MAX,
} from './constants.js'
import type { RunState, TurnDeclaration, WorldRulesView, AttrKey } from './types.js'

export type ValidationGate = 'range' | 'whitelist' | 'legality'

export interface ValidationFailure {
  gate: ValidationGate
  reason: string
}

const ATTR_KEYS: AttrKey[] = ['con', 'mind', 'agi']

function fail(gate: ValidationGate, reason: string): ValidationFailure {
  return { gate, reason }
}

/** 按名称解析要删除的物品：仅在名称唯一时可解析（plan §2 物品身份） */
export function resolveLostItemIds(
  items: RunState['items'],
  names: string[]
): { ok: true; ids: string[] } | { ok: false; reason: string } {
  const ids: string[] = []
  for (const name of names) {
    const matches = items.filter((i) => i.name === name)
    if (matches.length === 0) return { ok: false, reason: `要失去的物品不存在：${name}` }
    if (matches.length > 1) return { ok: false, reason: `物品名称重名，拒绝歧义删除：${name}` }
    const m = matches[0]
    if (m) ids.push(m.id)
  }
  return { ok: true, ids }
}

export function validateDeclaration(
  run: RunState,
  world: WorldRulesView,
  decl: TurnDeclaration
): ValidationFailure | null {
  const visit = run.visit
  if (!visit) return fail('legality', '当前不在世界内')

  // ---- range ----
  if (decl.narrative.length === 0 || decl.narrative.length > NARRATIVE_MAX_CHARS) {
    return fail('range', `叙事长度必须在 1~${NARRATIVE_MAX_CHARS} 字之间`)
  }
  const actions = decl.suggestedActions ?? []
  if (actions.length > SUGGESTED_ACTIONS_MAX) {
    return fail('range', `建议行动最多 ${SUGGESTED_ACTIONS_MAX} 条`)
  }
  for (const a of actions) {
    if (!a.trim() || a.length > SUGGESTION_MAX_CHARS) {
      return fail('range', `建议行动需为 1~${SUGGESTION_MAX_CHARS} 字`)
    }
  }

  const sc = decl.stateChanges
  if (sc) {
    const ad = sc.attributeDelta
    if (ad) {
      for (const k of ATTR_KEYS) {
        const v = ad[k]
        if (v === undefined) continue
        if (!Number.isInteger(v)) return fail('range', `属性变动必须为整数：${k}=${v}`)
        if (Math.abs(v) > ATTR_DELTA_PER_TURN_MAX) {
          return fail('range', `属性 ${k} 单回合变动上限 ±${ATTR_DELTA_PER_TURN_MAX}，收到 ${v}`)
        }
      }
    }
    const ld = sc.lifespanDelta
    if (ld !== undefined) {
      if (!Number.isInteger(ld)) return fail('range', `寿命变动必须为整数：${ld}`)
      if (Math.abs(ld) > LIFESPAN_EVENT_DELTA_PER_TURN_MAX) {
        return fail('range', `寿命单回合事件增减上限 ±${LIFESPAN_EVENT_DELTA_PER_TURN_MAX}，收到 ${ld}`)
      }
    }
    const gained = sc.itemsGained ?? []
    if (gained.length > ITEM_GAIN_PER_TURN_MAX) return fail('range', `单回合获得物品最多 ${ITEM_GAIN_PER_TURN_MAX} 件`)
    for (const g of gained) {
      if (!g.name.trim() || g.name.length > ITEM_NAME_MAX_CHARS) {
        return fail('range', `物品名称需为 1~${ITEM_NAME_MAX_CHARS} 字`)
      }
      if (g.desc !== undefined && g.desc.length > ITEM_DESC_MAX_CHARS) {
        return fail('range', `物品描述最多 ${ITEM_DESC_MAX_CHARS} 字`)
      }
    }
    const lost = sc.itemsLostNames ?? []
    if (lost.length > ITEM_LOSE_PER_TURN_MAX) return fail('range', `单回合失去物品最多 ${ITEM_LOSE_PER_TURN_MAX} 件`)
    const tagsGained = sc.tagsGained ?? []
    const tagsRemoved = sc.tagsRemoved ?? []
    if (tagsGained.length > TAG_MUTATE_PER_TURN_MAX || tagsRemoved.length > TAG_MUTATE_PER_TURN_MAX) {
      return fail('range', `单回合标签增删最多 ${TAG_MUTATE_PER_TURN_MAX} 个`)
    }
    for (const t of [...tagsGained, ...tagsRemoved]) {
      if (!t.trim() || t.length > TAG_MAX_CHARS) return fail('range', `标签需为 1~${TAG_MAX_CHARS} 字`)
    }
  }

  const flags = decl.flagsAchieved ?? []
  if (flags.length > FLAG_ACHIEVE_PER_TURN_MAX) {
    return fail('range', `单回合达成 flag 最多 ${FLAG_ACHIEVE_PER_TURN_MAX} 个`)
  }
  for (const fid of flags) {
    if (!fid.trim() || fid.length > FLAG_ID_MAX_CHARS) return fail('range', `flag id 非法：${fid}`)
  }

  // ---- whitelist ----
  const catalog = new Map(world.flagCatalog.map((f) => [f.id, f]))
  for (const fid of flags) {
    if (!catalog.has(fid)) return fail('whitelist', `未知 flag（不在世界 flag 库中）：${fid}`)
  }

  // ---- legality ----
  for (const fid of flags) {
    const f = catalog.get(fid)
    if (!f) continue
    if (visit.flags[fid]) return fail('legality', `flag 已达成，只能从 false 变为 true：${fid}`)
    for (const req of f.requires ?? []) {
      if (!visit.flags[req]) return fail('legality', `flag ${fid} 的前置条件未达成：${req}`)
    }
  }
  if (sc) {
    const lost = sc.itemsLostNames ?? []
    const resolved = resolveLostItemIds(run.items, lost)
    if (!resolved.ok) return fail('legality', resolved.reason)
    if (run.items.length - lost.length + (sc.itemsGained ?? []).length > ITEM_COUNT_MAX) {
      return fail('legality', `物品栏上限 ${ITEM_COUNT_MAX} 件`)
    }
    const tagsGained = sc.tagsGained ?? []
    const tagsRemoved = sc.tagsRemoved ?? []
    for (const t of tagsRemoved) {
      if (!run.statusTags.includes(t)) return fail('legality', `要移除的标签不存在：${t}`)
    }
    const tagSet = new Set(run.statusTags.filter((t) => !tagsRemoved.includes(t)))
    for (const t of tagsGained) tagSet.add(t)
    if (tagSet.size > TAG_COUNT_MAX) return fail('legality', `标签上限 ${TAG_COUNT_MAX} 个`)
  }

  return null
}
