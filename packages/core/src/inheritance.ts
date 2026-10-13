/**
 * 轮回结算（requirement §9）：死亡或结局后，履历入库、出身解锁。
 * 记忆提炼由服务层调 LLM 后经 applyLifeMemories 注入；武学在 LifeState 间直接拷贝。
 */
import { UNLEARNED_REQ_DISCOUNT } from './constants.js'
import type { LifeState, LifeSummary, MetaState, MemoryRecord } from './types.js'
import { buildLifeSummary } from './life.js'

export function createMetaState(_now: string): MetaState {
  return {
    livesCount: 0,
    memories: [],
    unlockedOrigins: [],
    history: [],
  }
}

/** 一世终结：履历入谱、计数；newUnlockedOrigins 由服务层依据本世 flags/身份决定 */
export function settleLifeEnd(
  meta: MetaState,
  life: LifeState,
  now: string,
  newUnlockedOrigins: string[] = []
): MetaState {
  const index = meta.history.length + 1
  const summary: LifeSummary = buildLifeSummary(life, index, now)
  return {
    ...meta,
    livesCount: meta.livesCount + 1,
    history: [...meta.history, summary],
    unlockedOrigins: [...new Set([...meta.unlockedOrigins, ...newUnlockedOrigins])],
  }
}

/** 记忆提炼结果并入继承层（去重、超限淘汰最旧） */
export function applyLifeMemories(
  meta: MetaState,
  incoming: string[],
  opts: { now: string; genId: () => string; maxTotal: number }
): MetaState {
  const seen = new Set(meta.memories.map((m: MemoryRecord) => m.text))
  const merged: MemoryRecord[] = [...meta.memories]
  for (const text of incoming) {
    if (seen.has(text)) continue
    seen.add(text)
    merged.push({ id: opts.genId(), text, source: 'past_life', createdAt: opts.now })
  }
  return {
    ...meta,
    memories: merged.length > opts.maxTotal ? merged.slice(merged.length - opts.maxTotal) : merged,
  }
}

/** 后续世的武学习得门槛减免（requirement §9） */
export function reqDiscountForLives(livesCount: number): number {
  return livesCount > 0 ? UNLEARNED_REQ_DISCOUNT : 0
}
