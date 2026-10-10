/**
 * 纯状态转换（plan §3 / P1）。
 * 回合结算顺序（plan §2）：校验后的申报应用 + 基础寿命 -1 → 截断 → 判死 →
 * 幕推进与通关判定 → 发放奖励。死亡优先于通关。
 * 这里不做校验（校验在 validation.ts，schema 在 llm 包）——decl 视为已通过校验，
 * 或为 null（降级回合：仅扣基础寿命，无申报变更，仍执行死亡判定）。
 */
import {
  ATTR_INITIAL,
  ATTR_MAX,
  ATTR_MIN,
  DEGRADED_NARRATIVE,
  HISTORY_KEEP_MAX,
  TURN_BASE_LIFESPAN_COST,
  WORLD_CLEAR_LIFESPAN_REWARD,
} from './constants.js'
import { resolveLostItemIds } from './validation.js'
import type {
  AppliedChanges,
  AttrKey,
  RunPhase,
  RunState,
  TurnDeclaration,
  TurnOutcome,
  TurnRecord,
  TurnResult,
  WorldRulesView,
  WorldVisit,
} from './types.js'

const ATTR_KEYS: AttrKey[] = ['con', 'mind', 'agi']

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function createRunState(id: string, cap: number, now: string): RunState {
  return {
    id,
    version: 1,
    phase: 'hub',
    createdAt: now,
    capSnapshot: cap,
    lifespan: cap,
    attrs: { con: ATTR_INITIAL, mind: ATTR_INITIAL, agi: ATTR_INITIAL },
    items: [],
    statusTags: [],
    currentWorldId: null,
    visit: null,
    turn: 0,
    worldCompletions: [],
    history: [],
    summary: null,
    summarizedThroughTurn: 0,
    memorySettledThroughTurn: 0,
    deathCause: null,
    deathNarrative: null,
  }
}

export type EnterWorldError = 'not_in_hub' | 'world_locked' | 'already_completed_this_run'

export function enterWorld(
  run: RunState,
  world: WorldRulesView,
  opts: { unlocked: boolean }
): { ok: true; run: RunState } | { ok: false; error: EnterWorldError } {
  if (run.phase !== 'hub') return { ok: false, error: 'not_in_hub' }
  if (run.worldCompletions.includes(world.id)) return { ok: false, error: 'already_completed_this_run' }
  if (!opts.unlocked) return { ok: false, error: 'world_locked' }

  const flags: Record<string, boolean> = {}
  for (const f of world.flagCatalog) flags[f.id] = false
  const visit: WorldVisit = {
    worldId: world.id,
    actIndex: 0,
    flags,
    turnsInWorld: 0,
    enteredAtTurn: run.turn,
    completed: false,
  }
  return {
    ok: true,
    run: { ...run, phase: 'in_world', currentWorldId: world.id, visit },
  }
}

function actMilestonesMet(visit: WorldVisit, world: WorldRulesView, actIndex: number): boolean {
  const act = world.acts[actIndex]
  if (!act) return false
  return act.milestoneFlags.every((f) => visit.flags[f])
}

export function winFlagsMet(visit: WorldVisit, world: WorldRulesView): boolean {
  return world.winFlags.every((f) => visit.flags[f])
}

export interface ApplyTurnOptions {
  /** 申报（已过三关校验）；null = 降级回合 */
  decl: TurnDeclaration | null
  /** 本回合玩家输入（记录用） */
  playerInput?: string
  now: string
  /** 物品 id 生成器（由调用方注入，保证纯函数可测） */
  newItemId: () => string
}

export function applyTurn(
  run: RunState,
  world: WorldRulesView,
  opts: ApplyTurnOptions
): TurnResult {
  if (run.phase !== 'in_world' || !run.visit) {
    throw new Error('apply_turn_not_in_world')
  }
  const visit = run.visit
  const decl = opts.decl
  const nextVisit: WorldVisit = { ...visit, flags: { ...visit.flags } }
  let lifespan = run.lifespan - TURN_BASE_LIFESPAN_COST
  const attrs = { ...run.attrs }
  const items = [...run.items]
  const tags = [...run.statusTags]

  const changes: AppliedChanges = {
    lifespanEventDelta: 0,
    attrDelta: {},
    itemsGained: [],
    itemsLostIds: [],
    tagsGained: [],
    tagsRemoved: [],
    flagsAchieved: [],
  }

  if (decl) {
    const sc = decl.stateChanges
    if (sc) {
      // 事件寿命
      const ld = sc.lifespanDelta ?? 0
      lifespan += ld
      changes.lifespanEventDelta = ld
      // 属性
      if (sc.attributeDelta) {
        for (const k of ATTR_KEYS) {
          const v = sc.attributeDelta[k]
          if (v === undefined || v === 0) continue
          attrs[k] = attrs[k] + v
          changes.attrDelta[k] = v
        }
      }
      // 物品：按名称唯一解析（已过校验，此处重复解析保证一致）
      const lost = sc.itemsLostNames ?? []
      if (lost.length > 0) {
        const resolved = resolveLostItemIds(items, lost)
        if (resolved.ok) {
          const idSet = new Set(resolved.ids)
          changes.itemsLostIds = resolved.ids
          for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i]
            if (it && idSet.has(it.id)) items.splice(i, 1)
          }
        }
      }
      for (const g of sc.itemsGained ?? []) {
        items.push({ id: opts.newItemId(), name: g.name, desc: g.desc ?? '' })
        changes.itemsGained.push({ id: '', name: g.name, desc: g.desc ?? '' })
      }
      // 标签
      for (const t of sc.tagsRemoved ?? []) {
        const idx = tags.indexOf(t)
        if (idx >= 0) {
          tags.splice(idx, 1)
          changes.tagsRemoved.push(t)
        }
      }
      for (const t of sc.tagsGained ?? []) {
        if (!tags.includes(t)) {
          tags.push(t)
          changes.tagsGained.push(t)
        }
      }
    }
    // flag：只从 false 变为 true（已过校验）
    for (const fid of decl.flagsAchieved ?? []) {
      if (nextVisit.flags[fid] === false) {
        nextVisit.flags[fid] = true
        changes.flagsAchieved.push(fid)
      }
    }
  }

  // ---- 截断 ----
  lifespan = clamp(lifespan, 0, run.capSnapshot)
  for (const k of ATTR_KEYS) attrs[k] = clamp(attrs[k], ATTR_MIN, ATTR_MAX)

  // ---- 判死（死亡优先于通关） ----
  run.turn += 1
  nextVisit.turnsInWorld += 1

  let deathCause: RunState['deathCause'] = null
  if (lifespan === 0) deathCause = 'lifespan'
  else if (attrs.con === 0) deathCause = 'con'
  else if (attrs.mind === 0) deathCause = 'mind'

  const record: TurnRecord = {
    turn: run.turn,
    playerInput: opts.playerInput ?? '',
    narrative: decl ? decl.narrative : DEGRADED_NARRATIVE,
    degraded: decl === null,
    changes: decl ? changes : null,
    createdAt: opts.now,
  }

  let outcome: TurnOutcome = { kind: 'continue' }
  let actAdvancedTo: number | null = null
  let phase: RunPhase = 'in_world'
  let deathNarrative: string | null = null

  if (deathCause) {
    phase = 'dead'
    outcome = { kind: 'dead', cause: deathCause }
    // 死亡回合的叙事：保留 LLM 叙事（降级回合用确定性环境叙事）
    deathNarrative = decl ? decl.narrative : DEGRADED_NARRATIVE
    nextVisit.completed = false
  } else {
    // ---- 幕推进 ----
    while (
      nextVisit.actIndex < world.acts.length - 1 &&
      actMilestonesMet(nextVisit, world, nextVisit.actIndex)
    ) {
      nextVisit.actIndex += 1
      actAdvancedTo = nextVisit.actIndex
    }
    // ---- 通关判定 ----
    if (winFlagsMet(nextVisit, world)) {
      nextVisit.completed = true
      const rewarded = clamp(
        lifespan + WORLD_CLEAR_LIFESPAN_REWARD,
        0,
        run.capSnapshot
      )
      outcome = {
        kind: 'world_completed',
        worldId: world.id,
        lifespanReward: WORLD_CLEAR_LIFESPAN_REWARD,
      }
      lifespan = rewarded
      phase = 'hub'
    }
  }

  const nextRun: RunState = {
    ...run,
    phase,
    lifespan,
    attrs,
    items,
    statusTags: tags,
    visit: phase === 'hub' ? null : nextVisit,
    currentWorldId: phase === 'hub' ? null : nextVisit.worldId,
    worldCompletions:
      outcome.kind === 'world_completed'
        ? [...run.worldCompletions, world.id]
        : run.worldCompletions,
    history: [...run.history, record].slice(-HISTORY_KEEP_MAX),
    deathCause: deathCause ?? run.deathCause,
    deathNarrative: deathNarrative ?? run.deathNarrative,
  }

  return { run: nextRun, record, outcome, actAdvancedTo }
}
