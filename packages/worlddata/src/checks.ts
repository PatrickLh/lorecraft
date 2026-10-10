/**
 * 世界数据完整性检查（plan P1）：引用有效、前置无环、目标可达、解锁关系无错误。
 */
import type { WorldDef } from './types.js'

export function checkWorlds(worlds: WorldDef[]): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const allFlagIds = new Map<string, Set<string>>() // worldId -> flagIds

  for (const w of worlds) {
    if (ids.has(w.id)) errors.push(`世界 id 重复：${w.id}`)
    ids.add(w.id)
  }

  for (const w of worlds) {
    const flagIds = new Set<string>()
    for (const f of w.flagCatalog) {
      if (flagIds.has(f.id)) errors.push(`[${w.id}] flag id 重复：${f.id}`)
      flagIds.add(f.id)
      if (!f.description.trim()) errors.push(`[${w.id}] flag ${f.id} 缺少描述`)
    }
    allFlagIds.set(w.id, flagIds)

    for (const f of w.flagCatalog) {
      for (const req of f.requires ?? []) {
        if (!flagIds.has(req)) errors.push(`[${w.id}] flag ${f.id} 引用了不存在的前置：${req}`)
      }
    }

    // 前置无环（拓扑排序）
    const remaining = new Map<string, string[]>(
      w.flagCatalog.map((f) => [f.id, [...(f.requires ?? [])].filter((r) => flagIds.has(r))])
    )
    let progress = true
    while (remaining.size > 0 && progress) {
      progress = false
      for (const [id, reqs] of [...remaining.entries()]) {
        if (reqs.every((r) => !remaining.has(r))) {
          remaining.delete(id)
          progress = true
        }
      }
    }
    if (remaining.size > 0) {
      errors.push(`[${w.id}] flag 前置存在环：${[...remaining.keys()].join(', ')}`)
    }

    if (w.winFlags.length === 0) errors.push(`[${w.id}] winFlags 为空`)
    for (const wf of w.winFlags) {
      if (!flagIds.has(wf)) errors.push(`[${w.id}] winFlag 不在 flag 库中：${wf}`)
    }

    if (w.acts.length < 2) errors.push(`[${w.id}] 幕表至少需要 2 幕`)
    w.acts.forEach((act, i) => {
      if (act.milestoneFlags.length === 0) errors.push(`[${w.id}] 第 ${i + 1} 幕里程碑为空`)
      for (const mf of act.milestoneFlags) {
        if (!flagIds.has(mf)) errors.push(`[${w.id}] 第 ${i + 1} 幕里程碑不在 flag 库中：${mf}`)
      }
    })

    if (!w.intro.trim()) errors.push(`[${w.id}] intro 为空`)
    if (w.systemRules.length === 0) errors.push(`[${w.id}] systemRules 为空`)
    if (!(w.balanceHint > 0)) errors.push(`[${w.id}] balanceHint 非法`)
    if (w.entryActions.length < 2 || w.entryActions.length > 3) {
      errors.push(`[${w.id}] entryActions 需为 2~3 条`)
    }

    for (const u of w.unlocks) {
      if (!ids.has(u)) errors.push(`[${w.id}] unlocks 引用了不存在的世界：${u}`)
    }
  }

  // 解锁关系：恰好一个初始世界（无入边），且无环
  const inEdges = new Map<string, number>(worlds.map((w) => [w.id, 0]))
  for (const w of worlds) {
    for (const u of w.unlocks) {
      if (inEdges.has(u)) inEdges.set(u, (inEdges.get(u) ?? 0) + 1)
    }
  }
  const roots = worlds.filter((w) => (inEdges.get(w.id) ?? 0) === 0)
  if (roots.length !== 1) {
    errors.push(`初始世界（无入边）必须恰好 1 个，实际 ${roots.length} 个`)
  }
  // 解锁闭包无环：从根出发应能到达全部世界且不成环
  const visited = new Set<string>()
  const queue = roots.map((r) => r.id)
  while (queue.length > 0) {
    const cur = queue.pop()
    if (!cur || visited.has(cur)) continue
    visited.add(cur)
    const w = worlds.find((x) => x.id === cur)
    if (w) queue.push(...w.unlocks)
  }
  for (const w of worlds) {
    if (!visited.has(w.id)) errors.push(`[${w.id}] 从初始世界不可达（解锁关系成环或断链）`)
  }

  return errors
}
