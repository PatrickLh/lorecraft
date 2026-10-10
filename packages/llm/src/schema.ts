/** 运行时 schema（zod）——统一契约的唯一来源，provider 与校验共用（plan §3）。 */
import { z } from 'zod'
import {
  ITEM_DESC_MAX_CHARS,
  ITEM_NAME_MAX_CHARS,
  MEMORY_EXTRACT_MAX,
  MEMORY_TEXT_MAX_CHARS,
  NARRATIVE_MAX_CHARS,
  SUGGESTED_ACTIONS_MAX,
  SUGGESTION_MAX_CHARS,
} from '@lorecraft/core'

export const TURN_SCHEMA_NAME = 'turn_output'

export const TurnDeclarationSchema = z.object({
  narrative: z.string().min(1).max(NARRATIVE_MAX_CHARS),
  stateChanges: z
    .object({
      attributeDelta: z
        .object({
          con: z.number().int(),
          mind: z.number().int(),
          agi: z.number().int(),
        })
        .partial()
        .optional(),
      lifespanDelta: z.number().int().optional(),
      itemsGained: z
        .array(
          z.object({
            name: z.string().min(1).max(ITEM_NAME_MAX_CHARS),
            desc: z.string().max(ITEM_DESC_MAX_CHARS).optional(),
          })
        )
        .max(5)
        .optional(),
      itemsLostNames: z.array(z.string().min(1)).max(5).optional(),
      tagsGained: z.array(z.string().min(1).max(12)).max(5).optional(),
      tagsRemoved: z.array(z.string().min(1).max(12)).max(5).optional(),
    })
    .optional(),
  flagsAchieved: z.array(z.string().min(1)).max(5).optional(),
  suggestedActions: z
    .array(z.string().min(1).max(SUGGESTION_MAX_CHARS))
    .max(SUGGESTED_ACTIONS_MAX)
    .optional(),
})

export type TurnDeclarationParsed = z.output<typeof TurnDeclarationSchema>

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

/** JSON Schema（供 provider 的结构化输出/工具调用使用） */
export function turnJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(TurnDeclarationSchema, { io: 'input' }) as Record<string, unknown>
}
export function memoryJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(MemoryExtractionSchema, { io: 'input' }) as Record<string, unknown>
}
export function summaryJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(SummarySchema, { io: 'input' }) as Record<string, unknown>
}
