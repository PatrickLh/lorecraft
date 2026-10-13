/** v2.0 前端类型：状态复用 @lorecraft/core，响应形状与 server 对齐。 */
import type { BattleState, LifeState, MetaState } from '@lorecraft/core'

export type { LifeState, MetaState, BattleState }

export interface MetaInfo {
  meta: MetaState
  activeLifeId: string | null
  openMemoryTaskCount: number
}

export interface CatalogEntry {
  id: string
  name: string
}

export interface OriginCard {
  id: string
  name: string
  desc: string
  available: boolean
  unlockOnly: boolean
}

export interface MartialCard {
  id: string
  name: string
  category: string
  tier: number
  mpCost: number
  desc: string
}

export interface WorldCatalog {
  locations: (CatalogEntry & { desc: string })[]
  factions: (CatalogEntry & { desc: string; joinable: boolean })[]
  npcs: { id: string; name: string; faction: string | null; role: string; desc: string }[]
  actions: { id: string; label: string; desc: string }[]
  martials: MartialCard[]
  origins: OriginCard[]
}

export interface EndInfo {
  endType: 'death' | 'ending'
  deathCause: string | null
  endingId: string | null
  endingName: string
  chapterTitle: string
  chapter: string
}

export interface EventPresentation {
  id: string
  title: string
  text: string
  choices: { index: number; label: string }[]
}

export interface EndingOption {
  id: string
  name: string
  desc: string
}

export interface ActResponse {
  life: LifeState
  narrative: string
  degraded: boolean
  degradedReason: string | null
  suggestions: string[]
  event: EventPresentation | null
  battleStarted: { enemyName: string; lethal: boolean } | null
  ended: boolean
  endInfo: EndInfo | null
  availableEndings: EndingOption[]
  meta: MetaState
}

export interface BattleResponse {
  life: LifeState
  battle: BattleState
  narrative: string
  degraded: boolean
  degradedReason: string | null
  ended: boolean
  endInfo: EndInfo | null
  availableEndings: EndingOption[]
  meta: MetaState
}

export interface LifeSummaryView {
  index: number
  originId: string
  destinyId: string | null
  endAge: number
  endType: 'death' | 'ending'
  deathCause: string | null
  endingId: string | null
  martials: { id: string; level: 0 | 1 | 2 }[]
  peak: { atk: number; def: number; int: number; agi: number }
  keyEvents: string[]
}

export type TurnUiState = 'idle' | 'waiting' | 'streaming' | 'degraded' | 'connection_lost'

export const END_CAUSE_TEXT: Record<string, string> = {
  battle: '横死刀兵',
  starve: '饿殍雪夜',
  mischief: '死于非命',
}
