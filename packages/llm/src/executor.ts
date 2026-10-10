/**
 * 回合 LLM 执行器（plan P3）：
 * schema/范围/白名单/合法性校验失败及可恢复请求错误共用最多一次重试预算；
 * 超时或再失败即降级为环境回合。流式 narrative 增量实时回调（暂存语义由服务端/前端保证）。
 */
import { z } from 'zod'
import { validateDeclaration } from '@lorecraft/core'
import type { MetaState, RunState, TurnDeclaration } from '@lorecraft/core'
import type { WorldDef } from '@lorecraft/worlddata'
import type { LlmProvider, TokenUsage } from './provider.js'
import { ProviderError, emptyUsage } from './provider.js'
import { NarrativeScanner } from './stream-scan.js'
import { TURN_SCHEMA_NAME, TurnDeclarationSchema, turnJsonSchema } from './schema.js'
import { buildTurnPrompt } from './prompts.js'

export interface TurnAttemptArgs {
  provider: LlmProvider
  world: WorldDef
  run: RunState
  meta: MetaState
  playerInput: string
  timeoutMs: number
  /** 流式 narrative 增量回调（失败重试时会再次输出，前端以最终结果覆盖暂存叙事） */
  onNarrativeDelta?: (text: string) => void
}

export type TurnAttempt =
  | { kind: 'ok'; decl: TurnDeclaration; usage: TokenUsage; retried: boolean }
  | { kind: 'degraded'; reason: string; usage: TokenUsage; retried: boolean }

export async function runTurnAttempt(args: TurnAttemptArgs): Promise<TurnAttempt> {
  const prompt = buildTurnPrompt({
    world: args.world,
    run: args.run,
    meta: args.meta,
    playerInput: args.playerInput,
  })

  const usage = emptyUsage()
  let retried = false
  let lastReason = '未知原因'
  let lastRaw = ''

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) {
      retried = true
      prompt.turns.push(
        { role: 'assistant', content: lastRaw || '（无效输出）' },
        {
          role: 'user',
          content: `你的上一次输出未通过系统校验：${lastReason}。请严格按 JSON Schema 重新输出完整 JSON，只输出 JSON 本身。`,
        }
      )
    }
    try {
      // narrative 增量：由扫描器从原始流中提取，只透出可解析的叙事文本（plan §2 流式输出）
      const scanner = new NarrativeScanner((nt) => args.onNarrativeDelta?.(nt))
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), args.timeoutMs)
      let raw = ''
      try {
        const res = await args.provider.generate(
          {
            system: prompt.system,
            turns: prompt.turns,
            jsonSchema: turnJsonSchema(),
            toolName: TURN_SCHEMA_NAME,
            temperature: 0.8,
            maxTokens: 2000,
          },
          {
            onDelta: (t) => {
              raw += t
              scanner.feed(t)
            },
            signal: controller.signal,
          }
        )
        raw = res.text
        usage.promptTokens += res.usage.promptTokens
        usage.completionTokens += res.usage.completionTokens
        lastRaw = raw
      } finally {
        clearTimeout(timer)
      }

      const parsed = TurnDeclarationSchema.parse(JSON.parse(raw))
      const failure = validateDeclaration(args.run, args.world, parsed)
      if (failure) {
        lastReason = `${failure.gate}：${failure.reason}`
        continue
      }
      return { kind: 'ok', decl: parsed, usage, retried }
    } catch (e) {
      if (e instanceof SyntaxError || e instanceof z.ZodError) {
        lastReason = 'schema：输出不是符合契约的 JSON'
        continue
      }
      if (e instanceof ProviderError) {
        if (e.recoverable && attempt === 0) {
          lastReason = `${e.kind}：${e.message}`
          continue
        }
        return {
          kind: 'degraded',
          reason: `${e.kind}：${e.message}`,
          usage,
          retried,
        }
      }
      return { kind: 'degraded', reason: `unknown：${String(e)}`, usage, retried }
    }
  }
  return { kind: 'degraded', reason: lastReason, usage, retried }
}
