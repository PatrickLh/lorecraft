/**
 * 世界数据完整性检查（plan P1）：引用有效、门槛可达、解锁关系无错、事件链无死链。
 * 模块加载时自动执行（index.ts），有错直接抛出。
 */
import type { EventDefView, OriginDefView } from '@lorecraft/core'
import type { DestinyDef, Enemy, LocationDef, NpcDef, FactionDef, Martial } from './types.js'

export interface WorldBundle {
  locations: LocationDef[]
  factions: FactionDef[]
  npcs: NpcDef[]
  actions: { id: string }[]
  martials: Martial[]
  enemies: Enemy[]
  origins: OriginDefView[]
  destinies: DestinyDef[]
  endings: { id: string }[]
  events: EventDefView[]
}

export function checkWorld(bundle: WorldBundle): string[] {
  const errors: string[] = []
  const ids = <T extends { id: string }>(list: T[]): Set<string> => new Set(list.map((x) => x.id))
  const locationIds = ids(bundle.locations)
  const factionIds = ids(bundle.factions)
  const npcIds = ids(bundle.npcs)
  const martialIds = ids(bundle.martials)
  const enemyIds = ids(bundle.enemies)
  const originIds = ids(bundle.origins)
  const destinyIds = ids(bundle.destinies)
  const endingIds = ids(bundle.endings)

  if (martialIds.size < 26) errors.push(`武学库应 ≥26 门，实际 ${martialIds.size}`)
  if (bundle.events.filter((e) => !e.cond?.destiny).length < 20) errors.push('沙箱事件首批应 ≥20 条')

  for (const o of bundle.origins) {
    if (!locationIds.has(o.locationId)) errors.push(`[${o.id}] 出身地点不存在：${o.locationId}`)
    if (o.destiny !== null && !destinyIds.has(o.destiny)) errors.push(`[${o.id}] 出身身世线不存在：${o.destiny}`)
    if (o.unlockOnly && !('unlockFlag' in o)) errors.push(`[${o.id}] 解锁出身缺少 unlockFlag`)
    for (const m of o.martials ?? []) {
      if (!martialIds.has(m.id)) errors.push(`[${o.id}] 出身初始武学不存在：${m.id}`)
    }
  }

  for (const e of bundle.events) {
    const c = e.cond
    if (c?.slots && (!c.slots.length || c.slots.some(slot => !Number.isInteger(slot) || slot < 0 || slot > 3))) errors.push(`${e.id} 的时辰条件无效`)
    if (c?.location !== undefined && !locationIds.has(c.location)) errors.push(`[${e.id}] 事件地点不存在：${c.location}`)
    if (c?.faction !== undefined && !factionIds.has(c.faction.id)) errors.push(`[${e.id}] 事件势力不存在：${c.faction.id}`)
    if (c?.npc !== undefined && !npcIds.has(c.npc.id)) errors.push(`[${e.id}] 事件 NPC 不存在：${c.npc.id}`)
    if (c?.martialHas !== undefined && !martialIds.has(c.martialHas)) errors.push(`[${e.id}] 事件前置武学不存在：${c.martialHas}`)
    if (c?.destiny !== undefined && !destinyIds.has(c.destiny)) errors.push(`[${e.id}] 事件身世线不存在：${c.destiny}`)
    if (e.choices.length < 2 || e.choices.length > 4) errors.push(`[${e.id}] 事件选项需 2~4 个，实际 ${e.choices.length}`)
    for (const choice of e.choices) {
      const outcomes = choice.outcome
        ? [choice.outcome]
        : (choice.randomOutcomes ?? []).map((ro) => ro.outcome)
      if (outcomes.length === 0) errors.push(`[${e.id}] 选项「${choice.label}」没有任何结果`)
      for (const o of outcomes) {
        if (o.battle && !enemyIds.has(o.battle.enemy)) errors.push(`[${e.id}] 战斗敌人不存在：${o.battle.enemy}`)
        if (o.learn && !martialIds.has(o.learn.id)) errors.push(`[${e.id}] 习得武学不存在：${o.learn.id}`)
        if (o.sectJoin && !factionIds.has(o.sectJoin)) errors.push(`[${e.id}] 拜入门派不存在：${o.sectJoin}`)
        for (const fid of Object.keys(o.factions ?? {})) {
          if (!factionIds.has(fid)) errors.push(`[${e.id}] 势力不存在：${fid}`)
        }
        for (const nid of Object.keys(o.npcs ?? {})) {
          if (!npcIds.has(nid)) errors.push(`[${e.id}] NPC 不存在：${nid}`)
        }
        for (const f of [...(o.flags ?? []), ...(o.battle?.onWinFlags ?? []), ...(o.battle?.onLoseFlags ?? [])]) {
          if (f.startsWith('d_')) {
            const dId = bundle.events.find((ev) => ev.id === e.id)?.cond?.destiny
            const dest = dId !== undefined ? bundle.destinies.find((d) => d.id === dId) : undefined
            const chainFlagOk =
              dest !== undefined &&
              dest.chainEvents.some((cev) => {
                const ce = bundle.events.find((x) => x.id === cev)
                return ce !== undefined && (ce.cond?.flag === f || ce.cond?.noFlag === f)
              })
            if (dest && !chainFlagOk) errors.push(`[${e.id}] 身世链 flag 无承接事件：${f}`)
          }
          if (f.startsWith('unlock_origin_')) {
            const origin = bundle.origins.find((x) => 'unlockFlag' in x && (x as { unlockFlag?: string }).unlockFlag === f)
            if (!origin) errors.push(`[${e.id}] unlock flag 无对应出身：${f}`)
          }
        }
      }
    }
  }

  return errors
}
