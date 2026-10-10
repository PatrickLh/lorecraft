/** 前端视图类型：状态类型直接复用 @lorecraft/core（共享契约），响应形状与 server 对齐。 */
import type { MetaState, RunState } from '@lorecraft/core'

export type { MetaState, RunState }

export interface MetaInfo {
  meta: MetaState
  unlockedWorldIds: string[]
  prototypeComplete: boolean
  activeRunId: string | null
  openMemoryTaskCount: number
}

export interface WorldCard {
  id: string
  title: string
  theme: string
  intro: string
  unlocked: boolean
  permanentlyCleared: boolean
  clearedThisRun: boolean | null
  entryActions: string[]
}

export interface WorldCompletedInfo {
  worldId: string
  title: string
  lifespanReward: number
  firstClearCapBonusGranted: boolean
}

export interface TurnResponse {
  run: RunState
  record: { turn: number; narrative: string; degraded: boolean }
  outcome:
    | { kind: 'continue' }
    | { kind: 'world_completed'; worldId: string; lifespanReward: number }
    | { kind: 'dead'; cause: 'lifespan' | 'con' | 'mind' }
  actAdvancedTo: number | null
  degraded: boolean
  degradedReason: string | null
  suggestedActions: string[]
  worldCompleted: WorldCompletedInfo | null
  prototypeComplete: boolean
  meta: MetaState
}

export type DeathCause = 'lifespan' | 'con' | 'mind'

export const DEATH_CAUSE_TEXT: Record<DeathCause, string> = {
  lifespan: '寿元耗尽',
  con: '伤重不治（体质归零）',
  mind: '神魂俱灭（心智归零）',
}

/** 回合提交的界面状态（plan P4：区分等待/暂存流/已提交/降级/连接中断） */
export type TurnUiState = 'idle' | 'waiting' | 'streaming' | 'degraded' | 'connection_lost'
