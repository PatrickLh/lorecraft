/**
 * 事件引擎（requirement §8）：条件抽取 + 冷却 + 权重随机。
 * 事件定义由 worlddata 注入，引擎只依赖 core 的视图类型。
 */
import { EVENT_COOLDOWN_DAYS } from './constants.js'
import { seasonIndex } from './calendar.js'
import type { Rng } from './battle.js'
import type { EventCondView, EventDefView, LifeState } from './types.js'

function attrMinMet(life: LifeState, cond: EventCondView): boolean {
  if (!cond.attrMin) return true
  for (const [k, v] of Object.entries(cond.attrMin)) {
    const need = v ?? 0
    if (life.attrs[k as 'atk' | 'def' | 'int' | 'agi'] < need) return false
  }
  return true
}

export function eventCondMet(life: LifeState, cond: EventCondView | undefined): boolean {
  if (!cond) return true
  if (cond.slots && !cond.slots.includes(life.slot)) return false
  if (cond.location !== undefined && life.locationId !== cond.location) return false
  if (cond.season !== undefined && seasonIndex(life.day) !== cond.season) return false
  if (cond.night !== undefined) {
    const isNight = life.slot >= 2 // 昏/夜
    if (isNight !== cond.night) return false
  }
  if (cond.minRep !== undefined && life.rep < cond.minRep) return false
  if (cond.maxRep !== undefined && life.rep > cond.maxRep) return false
  if (cond.minMoney !== undefined && life.money < cond.minMoney) return false
  if (!attrMinMet(life, cond)) return false
  if (cond.martialHas !== undefined && !life.martials.some((m) => m.id === cond.martialHas)) return false
  if (cond.faction) {
    const v = life.factions[cond.faction.id] ?? 0
    if (cond.faction.min !== undefined && v < cond.faction.min) return false
    if (cond.faction.max !== undefined && v > cond.faction.max) return false
  }
  if (cond.npc) {
    const v = life.npcs[cond.npc.id] ?? 0
    if (cond.npc.min !== undefined && v < cond.npc.min) return false
    if (cond.npc.max !== undefined && v > cond.npc.max) return false
  }
  if (cond.sect === 'yes' && !life.sectId) return false
  if (cond.sect === 'no' && life.sectId) return false
  if (cond.flag !== undefined && !life.flags.includes(cond.flag)) return false
  if (cond.noFlag !== undefined && life.flags.includes(cond.noFlag)) return false
  if (cond.destiny !== undefined && life.destinyId !== cond.destiny) return false
  return true
}

/** 按条件+权重抽取至多 1 个事件（冷却内的事件排除；chance 概率另掷） */
export function pickEvent(
  life: LifeState,
  events: EventDefView[],
  rng: Rng
): EventDefView | null {
  const candidates: { ev: EventDefView; weight: number }[] = []
  for (const ev of events) {
    const lastSeen = life.eventCooldowns[ev.id]
    if (lastSeen !== undefined && life.day - lastSeen < EVENT_COOLDOWN_DAYS) continue
    if (!eventCondMet(life, ev.cond)) continue
    if (ev.cond?.chance !== undefined && rng() >= ev.cond.chance) continue
    candidates.push({ ev, weight: ev.weight })
  }
  const total = candidates.reduce((s, c) => s + c.weight, 0)
  if (total <= 0) return null
  let roll = rng() * total
  for (const c of candidates) {
    roll -= c.weight
    if (roll <= 0) return c.ev
  }
  const last = candidates[candidates.length - 1]
  return last?.ev ?? null
}

/** 记录事件触发（冷却起点） */
export function markEventSeen(life: LifeState, eventId: string): void {
  life.eventCooldowns = { ...life.eventCooldowns, [eventId]: life.day }
}

/** 事件选项的可用性（req 不满足的选项不出现） */
export function choiceAvailable(
  life: LifeState,
  choice: { req?: { attrMin?: Record<string, number>; money?: number; martial?: string } }
): boolean {
  const req = choice.req
  if (!req) return true
  if (req.money !== undefined && life.money < req.money) return false
  if (req.martial !== undefined && !life.martials.some((m) => m.id === req.martial)) return false
  if (req.attrMin) {
    for (const [k, v] of Object.entries(req.attrMin)) {
      if (life.attrs[k as 'atk' | 'def' | 'int' | 'agi'] < (v ?? 0)) return false
    }
  }
  return true
}
