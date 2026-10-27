import type { MartialDef } from '@lorecraft/core'
import type { Enemy, OriginDef } from './types.js'
import type { WorldBundle } from './checks.js'
import { ACTIONS, FACTIONS, LOCATIONS, NPCS } from './content/world.js'
import { MARTIALS } from './content/martial.js'
import { ENEMIES } from './content/enemies.js'
import { ORIGINS, DESTINIES } from './content/origins.js'
import { ENDINGS } from './content/endings.js'
import { EVENTS } from './content/events.js'
import { checkWorld } from './checks.js'

export type {
  LocationDef,
  FactionDef,
  NpcDef,
  ActionDef,
  Martial,
  Enemy,
  OriginDef,
  DestinyDef,
} from './types.js'
export { checkWorld } from './checks.js'
export type { WorldBundle } from './checks.js'

export { LOCATIONS, FACTIONS, NPCS, ACTIONS } from './content/world.js'
export { MARTIALS } from './content/martial.js'
export { ENEMIES } from './content/enemies.js'
export { ORIGINS, DESTINIES } from './content/origins.js'
export { ENDINGS, DEATH_ENDINGS } from './content/endings.js'
export { EVENTS } from './content/events.js'
export * from './content/chapter.js'

export const MARTIAL_DEFS: Map<string, MartialDef> = new Map(MARTIALS.map((m) => [m.id, m]))
export const ENEMY_DEFS: Map<string, Enemy> = new Map(ENEMIES.map((e) => [e.id, e]))

export function getMartial(id: string): MartialDef | undefined {
  return MARTIAL_DEFS.get(id)
}
export function getEnemy(id: string): Enemy | undefined {
  return ENEMY_DEFS.get(id)
}
export function getLocation(id: string): (typeof LOCATIONS)[number] | undefined {
  return LOCATIONS.find((l) => l.id === id)
}
export function getOrigin(id: string): OriginDef | undefined {
  return ORIGINS.find((o) => o.id === id)
}
export function getEnding(id: string): (typeof ENDINGS)[number] | undefined {
  return ENDINGS.find((e) => e.id === id)
}

const BUNDLE: WorldBundle = {
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
}

const errors = checkWorld(BUNDLE)
if (errors.length > 0) {
  throw new Error('世界数据完整性检查失败：\n' + errors.map((e) => `- ${e}`).join('\n'))
}
