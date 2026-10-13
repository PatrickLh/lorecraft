/**
 * 辅助 LLM 调用（plan P3）：记忆提炼、超限合并、滚动摘要。
 * 单次尝试、不重试；失败由调用方兜底（记忆失败不阻塞轮回结算，摘要失败保留旧摘要）。
 */
import { z } from 'zod'
import type { LlmProvider, TokenUsage } from './provider.js'
import { ProviderError, emptyUsage } from './provider.js'
import {
  MEMORY_SCHEMA_NAME,
  MemoryExtractionSchema,
  SUMMARY_SCHEMA_NAME,
  SummarySchema,
  memoryJsonSchema,
  summaryJsonSchema,
} from './schema.js'
import {
  buildMemoryExtractPrompt,
  buildMemoryMergePrompt,
  buildSummaryPrompt,
} from './prompts.js'
import { sanitizeMemories } from '@lorecraft/core'

export type AuxResult<T> =
  | { ok: true; value: T; usage: TokenUsage }
  | { ok: false; error: string; usage: TokenUsage }

async function callStructured<T>(
  provider: LlmProvider,
  args: {
    system: string
    turns: { role: 'user' | 'assistant'; content: string }[]
    jsonSchema: unknown
    toolName: string
    timeoutMs: number
  },
  parse: (raw: string) => T
): Promise<AuxResult<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), args.timeoutMs)
  try {
    const res = await provider.generate(
      {
        system: args.system,
        turns: args.turns,
        jsonSchema: args.jsonSchema,
        toolName: args.toolName,
        temperature: 0.3,
        maxTokens: 1500,
      },
      { signal: controller.signal }
    )
    return { ok: true, value: parse(res.text), usage: res.usage }
  } catch (e) {
    const msg =
      e instanceof ProviderError
        ? `${e.kind}：${e.message}`
        : e instanceof SyntaxError || e instanceof z.ZodError
          ? 'schema：输出不符合契约'
          : String(e)
    return { ok: false, error: msg, usage: emptyUsage() }
  } finally {
    clearTimeout(timer)
  }
}

/** 记忆提炼：来源文本 → ≤5 条清洗后的记忆文本 */
export async function extractMemories(
  provider: LlmProvider,
  args: { sourceTitle: string; sourceText: string; timeoutMs: number }
): Promise<AuxResult<string[]>> {
  const prompt = buildMemoryExtractPrompt({
    sourceTitle: args.sourceTitle,
    sourceText: args.sourceText,
  })
  return callStructured(
    provider,
    {
      system: prompt.system,
      turns: prompt.turns,
      jsonSchema: memoryJsonSchema(),
      toolName: MEMORY_SCHEMA_NAME,
      timeoutMs: args.timeoutMs,
    },
    (raw) => {
      const parsed = MemoryExtractionSchema.parse(JSON.parse(raw))
      return sanitizeMemories(parsed.memories.map((text) => ({ text })))
    }
  )
}

/** 超限合并：LLM 压缩到上限内；失败由调用方走 core.fallbackMerge */
export async function mergeMemoriesLlm(
  provider: LlmProvider,
  args: { memories: string[]; maxTotal: number; timeoutMs: number }
): Promise<AuxResult<string[]>> {
  const prompt = buildMemoryMergePrompt({ memories: args.memories, maxTotal: args.maxTotal })
  return callStructured(
    provider,
    {
      system: prompt.system,
      turns: prompt.turns,
      jsonSchema: memoryJsonSchema(),
      toolName: MEMORY_SCHEMA_NAME,
      timeoutMs: args.timeoutMs,
    },
    (raw) => {
      const parsed = MemoryExtractionSchema.parse(JSON.parse(raw))
      const list = sanitizeMemories(
        parsed.memories.map((text) => ({ text })),
        args.maxTotal
      )
      if (list.length === 0) throw new SyntaxError('合并结果为空')
      return list
    }
  )
}

/** 滚动摘要：旧摘要 + 新条目 → 新摘要 */
export async function summarizeHistory(
  provider: LlmProvider,
  args: {
    existingSummary: string | null
    entries: { label: string; text: string }[]
    timeoutMs: number
  }
): Promise<AuxResult<string>> {
  const prompt = buildSummaryPrompt(args)
  return callStructured(
    provider,
    {
      system: prompt.system,
      turns: prompt.turns,
      jsonSchema: summaryJsonSchema(),
      toolName: SUMMARY_SCHEMA_NAME,
      timeoutMs: args.timeoutMs,
    },
    (raw) => {
      const parsed = SummarySchema.parse(JSON.parse(raw))
      return parsed.summary.trim().slice(0, 600)
    }
  )
}
