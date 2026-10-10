/**
 * 记忆纯函数部分（plan §2 记忆生命周期）：
 * 清洗（≤50 字、去空、去重）、超限时 LLM 合并失败的兜底（去重 + 淘汰最旧）。
 */
import { MEMORY_EXTRACT_MAX, MEMORY_MAX_TOTAL, MEMORY_TEXT_MAX_CHARS } from './constants.js'
import type { MemoryRecord } from './types.js'

export interface RawMemory {
  text: string
}

/** 清洗 LLM 提炼结果：截断超长、去空白、去重（保持顺序） */
export function sanitizeMemories(
  raw: RawMemory[],
  maxCount: number = MEMORY_EXTRACT_MAX,
  maxChars: number = MEMORY_TEXT_MAX_CHARS
): string[] {
  const out: string[] = []
  for (const r of raw) {
    const text = (r.text ?? '').trim().slice(0, maxChars)
    if (!text) continue
    if (out.includes(text)) continue
    out.push(text)
    if (out.length >= maxCount) break
  }
  return out
}

/**
 * 合并兜底：旧记忆在前、新记忆在后，去重后若超上限则保留最新的 maxTotal 条
 * （淘汰最旧）。
 */
export function fallbackMerge(
  existing: MemoryRecord[],
  incoming: string[],
  opts: { source: string; now: string; genId: () => string; maxTotal?: number }
): MemoryRecord[] {
  const maxTotal = opts.maxTotal ?? MEMORY_MAX_TOTAL
  const seen = new Set(existing.map((m) => m.text))
  const merged: MemoryRecord[] = [...existing]
  for (const text of incoming) {
    if (seen.has(text)) continue
    seen.add(text)
    merged.push({ id: opts.genId(), text, source: opts.source, createdAt: opts.now })
  }
  if (merged.length > maxTotal) {
    return merged.slice(merged.length - maxTotal)
  }
  return merged
}
