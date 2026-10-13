/** v2.0 运行时 schema（zod）——四类输出契约：行动演绎 / 战斗演绎 / 结局章 / 记忆提炼。 */
import { z } from 'zod'
import {
  BATTLE_NARRATIVE_MAX_CHARS,
  ENDING_CHAPTER_MAX_CHARS,
  ITEM_NAME_MAX_CHARS,
  LLM_GROW_AMOUNT_MAX,
  MEMORY_EXTRACT_MAX,
  MEMORY_TEXT_MAX_CHARS,
  NARRATIVE_MAX_CHARS,
  SUGGESTED_ACTIONS_MAX,
  SUGGESTION_MAX_CHARS,
} from '@lorecraft/core'

export const CharacterNoteSchema = z.object({
  name: z.string().trim().min(1).max(20),
  gender: z.enum(['男', '女', '未详']),
  organization: z.string().max(24),
  hobby: z.string().max(24),
  summary: z.string().max(60),
  relation: z.string().max(24),
})

export const CharacterExtractionSchema = z.object({ characters: z.array(CharacterNoteSchema).max(20) })

export const ACT_SCHEMA_NAME = 'act_output'

/** 行动/事件演绎：叙事 + 可选的小额成长申报（≤1 点，须带理由标签） */
export const ActOutputSchema = z.object({
  narrative: z.string().min(1).max(NARRATIVE_MAX_CHARS),
  characters: z.array(CharacterNoteSchema).max(5).optional(),
  growth: z
    .object({
      key: z.enum(['atk', 'def', 'int', 'agi', 'maxHp', 'maxMp']),
      reasonTag: z.enum(['combat', 'training', 'study', 'agility', 'breath', 'body']),
      reason: z.string().min(1).max(40),
    })
    .optional(),
  suggestedActions: z
    .array(z.string().min(1).max(SUGGESTION_MAX_CHARS))
    .max(SUGGESTED_ACTIONS_MAX)
    .optional(),
})

export const BATTLE_SCHEMA_NAME = 'battle_output'

/** 战斗演绎：只有叙事，无数值权（引擎结算记录是唯一事实） */
export const BattleOutputSchema = z.object({
  narrative: z.string().min(1).max(BATTLE_NARRATIVE_MAX_CHARS),
})

export const ENDING_SCHEMA_NAME = 'ending_chapter'

export const EndingChapterSchema = z.object({
  title: z.string().min(1).max(20),
  narrative: z.string().min(1).max(ENDING_CHAPTER_MAX_CHARS),
})

export const MEMORY_SCHEMA_NAME = 'memory_extraction'

export const MemoryExtractionSchema = z.object({
  memories: z
    .array(z.string().min(1).max(MEMORY_TEXT_MAX_CHARS))
    .max(MEMORY_EXTRACT_MAX),
})

export const SUMMARY_SCHEMA_NAME = 'run_summary'

export const SummarySchema = z.object({
  summary: z.string().min(1).max(600),
})

/** 物品申报（事件结局不产物品；自由行动允许命名小型收获） */
export const ItemGainSchema = z.object({
  name: z.string().min(1).max(ITEM_NAME_MAX_CHARS),
})

export type ActOutput = z.output<typeof ActOutputSchema>
export type BattleOutput = z.output<typeof BattleOutputSchema>
export type EndingChapter = z.output<typeof EndingChapterSchema>

export function actJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ActOutputSchema, { io: 'input' }) as Record<string, unknown>
}
export function battleJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(BattleOutputSchema, { io: 'input' }) as Record<string, unknown>
}
export function endingJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(EndingChapterSchema, { io: 'input' }) as Record<string, unknown>
}
export function memoryJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(MemoryExtractionSchema, { io: 'input' }) as Record<string, unknown>
}
export function summaryJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(SummarySchema, { io: 'input' }) as Record<string, unknown>
}

export const GROW_KEYS = ['atk', 'def', 'int', 'agi', 'maxHp', 'maxMp'] as const
export const GROW_AMOUNT_MAX = LLM_GROW_AMOUNT_MAX
