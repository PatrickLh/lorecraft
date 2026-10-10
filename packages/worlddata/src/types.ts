import type { ActView, FlagDecl, WorldRulesView } from '@lorecraft/core'

export interface NpcBrief {
  name: string
  role: string
  note: string
}

export interface ActDef extends ActView {
  /** 本幕叙事目标（给 LLM 的节奏指引） */
  goal: string
}

export interface WorldDef extends WorldRulesView {
  title: string
  theme: string
  /** 入场叙事（进入世界时直接展示，不为入场调用 LLM，plan §2） */
  intro: string
  /** 世界规则 / 常识（注入 LLM） */
  systemRules: string[]
  acts: ActDef[]
  /** 主目标：全部达成即通关 */
  winFlags: string[]
  /** 预期寿命消耗（平衡参考，非硬限制） */
  balanceHint: number
  npcs: NpcBrief[]
  /** 危险源（给 LLM 的编剧约束） */
  dangers: string[]
  /** 通关后解锁的世界 id */
  unlocks: string[]
  /** 初始建议行动（2-3 条，入场即展示） */
  entryActions: string[]
}

export type { FlagDecl }
