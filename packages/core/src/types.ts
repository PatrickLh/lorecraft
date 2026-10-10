/** 核心状态类型。运行时以这些类型为唯一权威契约（plan §3）。 */

export type RunPhase = 'hub' | 'in_world' | 'dead'
export type DeathCause = 'lifespan' | 'con' | 'mind'

export interface AttrBlock {
  con: number
  mind: number
  agi: number
}
export type AttrKey = keyof AttrBlock

export interface Item {
  id: string
  name: string
  desc: string
}

export interface MemoryRecord {
  id: string
  text: string
  /** 来源：世界 id 或 'death' */
  source: string
  createdAt: string
}

/** 一次世界访问（世界进入时初始化，跨局不继承，plan §2 flag 权威性） */
export interface WorldVisit {
  worldId: string
  actIndex: number
  flags: Record<string, boolean>
  turnsInWorld: number
  enteredAtTurn: number
  completed: boolean
}

/** LLM 单回合申报（schema 校验后的形状，见 @lorecraft/llm 的 zod schema） */
export interface DeclaredItem {
  name: string
  desc?: string
}

export interface TurnDeclaration {
  narrative: string
  stateChanges?: {
    attributeDelta?: Partial<AttrBlock>
    /** 事件增减，不含基础 -1 */
    lifespanDelta?: number
    itemsGained?: DeclaredItem[]
    /** 按名称删除；仅在名称唯一时可解析（plan §2 物品身份） */
    itemsLostNames?: string[]
    tagsGained?: string[]
    tagsRemoved?: string[]
  }
  flagsAchieved?: string[]
  suggestedActions?: string[]
}

/** 实际生效的变更（记录用） */
export interface AppliedChanges {
  lifespanEventDelta: number
  attrDelta: Partial<AttrBlock>
  itemsGained: Item[]
  itemsLostIds: string[]
  tagsGained: string[]
  tagsRemoved: string[]
  flagsAchieved: string[]
}

export interface TurnRecord {
  /** run 内 1-based */
  turn: number
  playerInput: string
  narrative: string
  degraded: boolean
  changes: AppliedChanges | null
  createdAt: string
}

export interface RunState {
  id: string
  /** 乐观并发版本号，每次事务提交 +1 */
  version: number
  phase: RunPhase
  createdAt: string
  /** 本局寿命上限快照（开局时的继承上限，本局不变，plan §2） */
  capSnapshot: number
  lifespan: number
  attrs: AttrBlock
  items: Item[]
  statusTags: string[]
  currentWorldId: string | null
  visit: WorldVisit | null
  /** run 内已消耗总回合数 */
  turn: number
  /** 本局已完成的世界（每世界每局最多一次） */
  worldCompletions: string[]
  /** 近期回合记录（供 prompt；全量在 turn_logs 表） */
  history: TurnRecord[]
  /** 滚动摘要 */
  summary: string | null
  summarizedThroughTurn: number
  /** 记忆提炼已结算到的回合（通关/死亡提炼用，避免重复提炼，plan §2） */
  memorySettledThroughTurn: number
  deathCause: DeathCause | null
  deathNarrative: string | null
}

/** 继承层（跨局持久，plan §2 / requirement §7.2） */
export interface MetaState {
  /** 下一局的寿命上限 */
  lifespanCap: number
  permanentClearedWorlds: string[]
  memories: MemoryRecord[]
  deathCount: number
  runsCount: number
}

// ---- 世界数据视图（core 只依赖此子集，worlddata 提供完整定义） ----

export interface FlagDecl {
  id: string
  description: string
  requires?: string[]
}

export interface ActView {
  id: string
  title: string
  milestoneFlags: string[]
}

export interface WorldRulesView {
  id: string
  title: string
  flagCatalog: FlagDecl[]
  acts: ActView[]
  winFlags: string[]
}

// ---- 回合结算结果 ----

export type TurnOutcome =
  | { kind: 'continue' }
  | { kind: 'world_completed'; worldId: string; lifespanReward: number }
  | { kind: 'dead'; cause: DeathCause }

export interface TurnResult {
  run: RunState
  record: TurnRecord
  outcome: TurnOutcome
  /** 本回合若推进了幕表，为新幕下标 */
  actAdvancedTo: number | null
}
