import type { WorldDef } from './types.js'
import { bianlidian } from './worlds/bianlidian.js'
import { qingyunmen } from './worlds/qingyunmen.js'
import { fengxue } from './worlds/fengxue.js'
import { checkWorlds } from './checks.js'

export type { WorldDef, ActDef, NpcBrief, FlagDecl } from './types.js'
export { checkWorlds } from './checks.js'

/** 首发世界库（requirement §6.3）。依次解锁：便利店 → 青云门 → 风雪山庄。 */
export const WORLDS: WorldDef[] = [bianlidian, qingyunmen, fengxue]

export function getWorld(id: string): WorldDef | undefined {
  return WORLDS.find((w) => w.id === id)
}

if (checkWorlds(WORLDS).length > 0) {
  throw new Error(
    '世界数据完整性检查失败：\n' + checkWorlds(WORLDS).map((e) => `- ${e}`).join('\n')
  )
}
