/** v2.0 核心状态类型（plan P0）：一世（Life）、战斗（Battle）、轮回元状态（Meta）。 */

// ---- 属性 ----

export interface Attrs {
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  atk: number // 武力
  def: number // 防御
  int: number // 智力
  agi: number // 敏捷
}

/** 可成长的属性键（LLM 小额成长 / 修炼 / 事件奖励的目标） */
export type GrowKey = 'atk' | 'def' | 'int' | 'agi' | 'maxHp' | 'maxMp'
export type AttrKey = 'atk' | 'def' | 'int' | 'agi'

export const GROW_LABELS: Record<GrowKey, string> = {
  atk: '武力',
  def: '防御',
  int: '智力',
  agi: '敏捷',
  maxHp: '生命上限',
  maxMp: '真气上限',
}

/** LLM 小额成长的理由标签（类别必须与行动匹配，plan §2） */
export type GrowReasonTag =
  | 'combat' // 战斗/比武 → 武力
  | 'training' // 练功/打熬 → 武力/防御
  | 'study' // 读书/解谜/论道 → 智力
  | 'agility' // 身法/逃亡/轻功 → 敏捷
  | 'breath' // 内功吐纳 → 真气上限
  | 'body' // 打熬筋骨/进补 → 生命上限

export const TAG_ALLOWED_KEYS: Record<GrowReasonTag, GrowKey[]> = {
  combat: ['atk'],
  training: ['atk', 'def'],
  study: ['int'],
  agility: ['agi'],
  breath: ['maxMp'],
  body: ['maxHp'],
}

// ---- 武学 ----

export type MartialCategory = 'fist' | 'sword' | 'qinggong' | 'neigong' | 'qimen'
export type MartialLevel = 0 | 1 | 2 // 入门/小成/大成

export interface MartialEntry {
  id: string
  level: MartialLevel
}

// ---- 战斗 ----

export type EnemyTendency = 'aggressive' | 'balanced' | 'defensive'

export interface EnemyInstance {
  defId: string
  name: string
  hp: number
  maxHp: number
  atk: number
  def: number
  agi: number
  tendency: EnemyTendency
  /** 战败是否致死（false = 重伤） */
  lethal: boolean
}

export type BattleCommand =
  | { kind: 'skill'; martialId: string }
  | { kind: 'attack' }
  | { kind: 'defend' }
  | { kind: 'flee' }

export interface RoundLog {
  turn: number
  /** 引擎结算事实（演绎的唯一依据，plan §6 风险控制） */
  facts: string[]
  playerHp: number
  enemyHp: number
}

export interface BattleState {
  enemy: EnemyInstance
  turn: number
  /** 首回合起手方 */
  playerFirst: boolean
  finished: boolean
  result: 'win' | 'lose' | 'fled' | null
  rounds: RoundLog[]
  /** 触发本战斗的事件上下文（胜/败追加 flag） */
  context?: { onWinFlags?: string[]; onLoseFlags?: string[] }
}

// ---- 一世 ----

export type LifePhase = 'alive' | 'ended'
export type EndType = 'death' | 'ending'
export type DeathCause = 'battle' | 'starve' | 'mischief' | string

export interface HistoryEntry {
  /** 玩家当时提交的原文或所选行动；旧存档可能缺失。 */
  playerInput?: string
  seq: number
  day: number
  slot: number
  kind: 'action' | 'event' | 'battle' | 'system'
  /** 玩家指令或事件名（prompt 历史用） */
  label: string
  /** 演绎文本或系统说明 */
  text: string
  degraded: boolean
}

/** 本世人物的阅读摘要；不参与数值、死亡或事件结算。 */
export interface CharacterNote {
  name: string
  gender: '男' | '女' | '未详'
  organization: string
  hobby: string
  summary: string
  relation: string
}

export interface LifeState {
  characterNotes?: Record<string, CharacterNote>
  suggestedActions?: string[]
  id: string
  version: number
  phase: LifePhase
  createdAt: string

  originId: string
  destinyId: string | null

  /** 绝对天数（开局为 0）；年龄/季节由日历推导 */
  day: number
  slot: number

  attrs: Attrs
  food: number
  money: number
  rep: number // -100 凶名 ~ +100 侠名
  /** 势力关系 -100..100 */
  factions: Record<string, number>
  /** NPC 关系 -100..100 */
  npcs: Record<string, number>
  /** 已拜入的门派（势力 id） */
  sectId: string | null

  locationId: string
  martials: MartialEntry[]
  flags: string[]
  /** 待玩家抉择的事件（choices 由事件定义给出） */
  pendingEventId: string | null
  /** 事件冷却：eventId → 最近触发日 */
  eventCooldowns: Record<string, number>

  /** 重伤：生命上限临时减半，痊愈解除 */
  injured: boolean
  /** 连续断粮天数 */
  starveDays: number

  pendingBattle: BattleState | null

  /** 当日成长记账（LLM 小额成长每日限 1 次、修炼每日每属性 1 次） */
  growthToday: { day: number; llmUsed: number; trained: Partial<Record<GrowKey, number>> }

  history: HistoryEntry[]
  logSeq: number
  summary: string | null
  summarizedThroughSeq: number
  /** 记忆提炼已结算到的 seq（死亡/结局提炼用） */
  memorySettledThroughSeq: number

  endType: EndType | null
  deathCause: DeathCause | null
  endingId: string | null
  endedAtDay: number | null
  endNarrative: string | null
}

// ---- 轮回元状态 ----

export interface LifeSummary {
  index: number
  originId: string
  destinyId: string | null
  startAge: number
  endAge: number
  endType: EndType
  deathCause: DeathCause | null
  endingId: string | null
  martials: MartialEntry[]
  peak: { atk: number; def: number; int: number; agi: number }
  keyEvents: string[]
  endedAt: string
}

export interface MetaState {
  livesCount: number
  memories: MemoryRecord[]
  unlockedOrigins: string[]
  history: LifeSummary[]
}

export interface MemoryRecord {
  id: string
  text: string
  source: string
  createdAt: string
}

// ---- 世界数据视图（core 只依赖此子集，worlddata 提供完整定义） ----

export interface EnemyDef {
  id: string
  name: string
  hp: number
  atk: number
  def: number
  agi: number
  tendency: EnemyTendency
  lethal: boolean
  /** 胜利战利品（银两，范围两端） */
  loot?: [number, number]
  /** 该敌人归属的 NPC（胜/败影响恩怨） */
  npcId?: string
}

// ---- 行动/事件/出身 的引擎视图（worlddata 提供完整内容定义） ----

export interface ActionDefView {
  id: string
  label: string
  slots?: number
  moneyCost?: number
  foodGain?: number
  moneyGain?: [number, number]
  hpGain?: number
  mpGain?: number
  healInjury?: boolean
  restToMorning?: boolean
  growth?: { key: GrowKey; chance: number }
  martialLevelChance?: number
  eventChance?: number
  desc?: string
}

export interface OutcomeView {
  text?: string
  /** 属性成长/损失（正负皆可；正值为成长奖励） */
  attrs?: Partial<Record<GrowKey, number>>
  /** 当前生命增减（负值为受伤） */
  hp?: number
  /** 当前真气恢复 */
  mp?: number
  money?: number
  food?: number
  rep?: number
  factions?: Record<string, number>
  npcs?: Record<string, number>
  sectJoin?: string
  learn?: { id: string; level?: MartialLevel }
  injured?: boolean
  clearInjury?: boolean
  battle?: {
    enemy: string
    lethal?: boolean
    /** 战斗胜利/败北后追加的 flag（身世链推进用） */
    onWinFlags?: string[]
    onLoseFlags?: string[]
  }
  flags?: string[]
  endDay?: boolean
}

export interface EventChoiceView {
  label: string
  req?: {
    attrMin?: Partial<Record<AttrKey, number>>
    money?: number
    martial?: string
  }
  outcome?: OutcomeView
  randomOutcomes?: { weight: number; outcome: OutcomeView }[]
}

export interface EventCondView {
  slots?: number[] // 可发生的精确时辰：0晨/1午/2昏/3夜
  location?: string
  season?: number // 0 春 1 夏 2 秋 3 冬
  night?: boolean
  minRep?: number
  maxRep?: number
  minMoney?: number
  attrMin?: Partial<Record<AttrKey, number>>
  martialHas?: string
  faction?: { id: string; min?: number; max?: number }
  npc?: { id: string; min?: number; max?: number }
  sect?: 'yes' | 'no'
  flag?: string
  noFlag?: string
  destiny?: string
  chance?: number
}

export interface EventDefView {
  id: string
  title: string
  weight: number
  cond?: EventCondView
  text: string
  choices: EventChoiceView[]
}

export interface OriginDefView {
  id: string
  name: string
  desc: string
  /** 仅当继承层解锁后可选 */
  unlockOnly?: boolean
  attrDelta?: Partial<Attrs>
  money: number
  food: number
  rep: number
  locationId: string
  destiny: string | null
  factions?: Record<string, number>
  npcs?: Record<string, number>
  martials?: MartialEntry[]
}

export interface MartialDef {
  id: string
  name: string
  category: MartialCategory
  tier: 1 | 2 | 3 | 4
  /** 习得门槛（后续世 -UNLEARNED_REQ_DISCOUNT） */
  reqs: { atk?: number; int?: number; agi?: number; def?: number }
  /** 攻击类：真气消耗与伤害倍率 */
  mpCost: number
  powerMul: number
  effect?: 'break_def' | 'combo' | 'lifesteal' | 'counter'
  desc: string
}

export interface EndingDef {
  id: string
  name: string
  /** achieved = 静默判定；chosen = 条件满足后作为行动出现 */
  kind: 'achieved' | 'chosen'
  priority: number
  cond?: {
    atk?: number
    int?: number
    agi?: number
    rep?: number
    repMax?: number
    money?: number
    ageMin?: number
    faction?: { id: string; min?: number }
    martialTierMin?: number
    sect?: string
  }
  desc: string
}
