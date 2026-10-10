/**
 * 继承层规则（plan §2 首次解锁与重复奖励 / 寿命上限）。
 * - 上限 +5 仅在「该世界首次永久通关」时发放，下一局生效。
 * - 解锁推导：无入边的世界为初始世界；某世界解锁 ⟺ 其所有前置世界已永久通关。
 */
import { INITIAL_LIFESPAN_CAP } from './constants.js'
import type { MetaState } from './types.js'

export function createMetaState(now: string): MetaState {
  return {
    lifespanCap: INITIAL_LIFESPAN_CAP,
    permanentClearedWorlds: [],
    memories: [],
    deathCount: 0,
    runsCount: 0,
  }
}

/** 世界首次永久通关：上限 +5（下一局生效），返回是否为本局实际发放 */
export function applyWorldFirstClear(
  meta: MetaState,
  worldId: string,
  bonus: number = 5
): { meta: MetaState; granted: boolean } {
  if (meta.permanentClearedWorlds.includes(worldId)) {
    return { meta, granted: false }
  }
  return {
    meta: {
      ...meta,
      lifespanCap: meta.lifespanCap + bonus,
      permanentClearedWorlds: [...meta.permanentClearedWorlds, worldId],
    },
    granted: true,
  }
}

export function registerRunStart(meta: MetaState): MetaState {
  return { ...meta, runsCount: meta.runsCount + 1 }
}

export function registerDeath(meta: MetaState): MetaState {
  return { ...meta, deathCount: meta.deathCount + 1 }
}

export interface WorldGraphNode {
  id: string
  unlocks: string[]
}

/**
 * 解锁集合 = 初始世界（无入边）∪ 「全部前置世界均已永久通关」的世界。
 * 注意是直接前置判定，不传递：通 A 只解锁 A 的直接后继，而非整个链。
 */
export function unlockedWorldIds(meta: MetaState, worlds: WorldGraphNode[]): Set<string> {
  const sourcesOf = new Map<string, string[]>()
  for (const w of worlds) {
    for (const u of w.unlocks) {
      const list = sourcesOf.get(u) ?? []
      list.push(w.id)
      sourcesOf.set(u, list)
    }
  }
  const unlocked = new Set<string>()
  for (const w of worlds) {
    const sources = sourcesOf.get(w.id) ?? []
    if (sources.length === 0 || sources.every((s) => meta.permanentClearedWorlds.includes(s))) {
      unlocked.add(w.id)
    }
  }
  return unlocked
}

export function isPrototypeComplete(meta: MetaState, totalWorlds: number): boolean {
  return meta.permanentClearedWorlds.length >= totalWorlds
}
