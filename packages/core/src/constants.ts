/**
 * v2.0 全部数值与限额集中在此（requirement §3~§9 / plan §2）。
 * 调平衡只改这里。
 */

// ---- 时间（plan §2 时间粒度） ----
export const SLOTS_PER_DAY = 4
export const SLOT_NAMES = ['晨', '午', '昏', '夜'] as const
export const DAYS_PER_SEASON = 90
export const SEASONS_PER_YEAR = 4
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR // 360
export const START_AGE = 16
export const SEASON_NAMES = ['春', '夏', '秋', '冬'] as const

// ---- 六维基准（出身在此基础上增减） ----
export const BASE_ATTRS = { hp: 30, maxHp: 30, mp: 10, maxMp: 10, atk: 5, def: 3, int: 5, agi: 5 } as const
export const ATTR_MIN = 1
export const ATTR_MAX = 30 // 低武世界人力顶峰（绝学+奇遇可达）

// ---- 温饱（plan §2） ----
export const FOOD_MAX = 10
export const FOOD_TICK_SLOTS = 2 // 每 2 时段 -1
export const STARVE_HP_LOSS_PER_DAY = 2
export const STARVE_DEATH_DAYS = 3

// ---- 衰老与善终 ----
export const OLD_AGE = 60
export const DECAY_STEP_YEARS = 5 // 每 5 年武力/敏捷 -1
export const GOOD_DEATH_AGE = 70 // 寿终正寝
export const NEIGONG_IMMUNE_LEVEL = 2 // 内功大成免疫衰老

// ---- 战斗（requirement §3 公式草案） ----
export const MIN_DMG = 1
export const CRIT_MULT = 1.5
export const CRIT_RATE_BASE = 0.05
export const CRIT_RATE_PER_AGI = 0.02
export const CRIT_RATE_MAX = 0.25
export const DODGE_PER_AGI_DIFF = 0.03
export const DODGE_MAX = 0.3
export const DODGE_MIN = 0.05
export const DEFEND_DMG_MULT = 0.5 // 防御时受伤减半
export const DEFEND_MP_BONUS = 2
export const MP_REGEN_BASE = 1
export const FLEE_BASE = 0.5
export const FLEE_PER_AGI = 0.03
export const FLEE_MIN = 0.2
export const FLEE_MAX = 0.9
export const INJURY_HP_MULT = 0.5 // 重伤：生命上限临时减半
export const QINGGONG_DODGE_PER_LEVEL = 0.03
export const QINGGONG_FLEE_PER_LEVEL = 0.05

// ---- 武学 ----
export const MARTIAL_LEVEL_NAMES = ['入门', '小成', '大成'] as const
export const MARTIAL_LEVEL_COEFF = [1.0, 1.3, 1.6] as const
export const TIER_NAMES = ['三流', '二流', '一流', '绝学'] as const
export const NEIGONG_MP_PER_LEVEL = 5 // 内功每等级真气上限加成
export const UNLEARNED_REQ_DISCOUNT = 1 // 后续世未领悟武学的属性门槛减免

// ---- 三层成长 ----
export const LLM_GROW_AMOUNT_MAX = 1
export const LLM_GROW_PER_DAY = 1
export const TRAIN_GROW_PER_DAY_PER_ATTR = 1 // 修炼每日每属性至多 +1

// ---- 事件 ----
export const EVENT_COOLDOWN_DAYS = 30
export const EVENTS_PER_ACTION = 1

// ---- 记忆（沿用 v1.0 模式） ----
export const MEMORY_MAX_TOTAL = 20
export const MEMORY_EXTRACT_MAX = 5
export const MEMORY_TEXT_MAX_CHARS = 50

// ---- 上下文 ----
export const SUMMARY_EVERY_ACTIONS = 10
export const RECENT_HISTORY_WINDOW = 10
export const HISTORY_KEEP_MAX = 60

// ---- 长度限额 ----
export const INPUT_MAX_CHARS = 500
export const NARRATIVE_MAX_CHARS = 2000
export const BATTLE_NARRATIVE_MAX_CHARS = 600
export const ENDING_CHAPTER_MAX_CHARS = 3000
export const SUGGESTED_ACTIONS_MAX = 3
export const SUGGESTION_MAX_CHARS = 30
export const ITEM_NAME_MAX_CHARS = 20

// ---- 历史 ----
export const LIFE_SUMMARY_KEY_EVENTS_MAX = 8

/** 降级回合的确定性环境叙事 */
export const DEGRADED_NARRATIVE =
  '天色恍惚了一瞬，四周的一切仿佛隔着一层薄雾。你定了定神，时辰却已悄悄溜走。（时空扰动，本段行动无果）'
export const DEGRADED_BATTLE_NARRATIVE = '招来影往，一瞬间刀光剑影，你看不太真切。（战斗仍在继续）'
