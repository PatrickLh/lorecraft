/**
 * 全部数值与限额集中在此（requirement §4.2 / plan §2）。
 * 调平衡只改这里。
 */

// ---- 寿命 ----
export const INITIAL_LIFESPAN_CAP = 60
export const FIRST_CLEAR_CAP_BONUS = 5
export const WORLD_CLEAR_LIFESPAN_REWARD = 15
export const TURN_BASE_LIFESPAN_COST = 1
/** LLM 单回合可申报的寿命事件增减上限（不含基础 -1） */
export const LIFESPAN_EVENT_DELTA_PER_TURN_MAX = 10

// ---- 属性 ----
export const ATTR_INITIAL = 10
export const ATTR_MAX = 20
export const ATTR_MIN = 0
export const ATTR_DELTA_PER_TURN_MAX = 3

// ---- 记忆 ----
export const MEMORY_MAX_TOTAL = 20
export const MEMORY_EXTRACT_MAX = 5
export const MEMORY_TEXT_MAX_CHARS = 50

// ---- 上下文 ----
/** 每 N 回合尝试一次滚动摘要 */
export const SUMMARY_EVERY_TURNS = 10
/** prompt 中保留的最近完整回合数 */
export const RECENT_HISTORY_WINDOW = 10
/** RunState.history 内存上限（超出仅影响 prompt 源，turn_logs 表保留全量） */
export const HISTORY_KEEP_MAX = 60

// ---- 长度与数量限额（集中配置，plan §2 物品身份/限制条目） ----
export const INPUT_MAX_CHARS = 500
export const NARRATIVE_MAX_CHARS = 2000
export const SUGGESTED_ACTIONS_MAX = 3
export const SUGGESTION_MAX_CHARS = 30
export const ITEM_NAME_MAX_CHARS = 20
export const ITEM_DESC_MAX_CHARS = 100
export const ITEM_COUNT_MAX = 20
export const ITEM_GAIN_PER_TURN_MAX = 5
export const ITEM_LOSE_PER_TURN_MAX = 5
export const TAG_MAX_CHARS = 12
export const TAG_COUNT_MAX = 10
export const TAG_MUTATE_PER_TURN_MAX = 5
export const FLAG_ACHIEVE_PER_TURN_MAX = 5
export const FLAG_ID_MAX_CHARS = 40

// ---- 降级回合的确定性环境叙事（plan §2 异常回合） ----
export const DEGRADED_NARRATIVE =
  '四周的景物忽然变得模糊而沉默，仿佛隔着一层毛玻璃。你的意识短暂地飘远了一瞬——再回神时，一切如旧，只有时间悄悄流走了一段。（时空扰动，本回合无事发生）'
