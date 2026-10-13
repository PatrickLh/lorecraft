/** v2.0 世界内容类型（在 core 视图上补充内容字段）。 */
import type {
  ActionDefView,
  EnemyDef,
  EventCondView,
  EventDefView,
  MartialDef,
  OriginDefView,
} from '@lorecraft/core'

export interface LocationDef {
  id: string
  name: string
  desc: string
}

export interface FactionDef {
  id: string
  name: string
  desc: string
  /** 是否可拜入 */
  joinable: boolean
}

export interface NpcDef {
  id: string
  name: string
  faction: string | null
  role: string
  desc: string
  martialHint?: string
}

export interface ActionDef extends ActionDefView {
  desc: string
}

/** 武学（core.MartialDef + 档位中文名由常量提供） */
export type Martial = MartialDef

export interface Enemy extends EnemyDef {
  desc?: string
}

export interface OriginDef extends OriginDefView {
  /** 前世达成该 flag 才解锁 */
  unlockFlag?: string
}

export interface DestinyDef {
  id: string
  name: string
  desc: string
  /** 身世线主事件 id（按 flag 链逐环触发） */
  chainEvents: string[]
}

export type { EventCondView, EventDefView }
