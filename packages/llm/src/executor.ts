/**
 * v2.0 LLM 执行器（plan P3）：行动演绎（含小额成长校验）、战斗演绎、结局章。
 * 重试预算沿用 v1.0：schema/校验失败及可恢复错误共用 1 次；超时直接降级。
 */
import { z } from 'zod'
import type { CharacterNote, LifeState, MetaState } from '@lorecraft/core'
import type { LlmProvider, TokenUsage } from './provider.js'
import { ProviderError, emptyUsage } from './provider.js'
import { NarrativeScanner } from './stream-scan.js'
import {
  ACT_SCHEMA_NAME,
  CharacterExtractionSchema,
  ActOutputSchema,
  BATTLE_SCHEMA_NAME,
  BattleOutputSchema,
  ENDING_SCHEMA_NAME,
  EndingChapterSchema,
  actJsonSchema,
  battleJsonSchema,
  endingJsonSchema,
} from './schema.js'
import { buildActPrompt, buildBattlePrompt, buildEndingPrompt } from './prompts.js'

export interface AttemptResult<T> {
  kind: 'ok'
  value: T
  usage: TokenUsage
  retried: boolean
}

export interface DegradedResult {
  kind: 'degraded'
  reason: string
  usage: TokenUsage
  retried: boolean
}

async function attempt<T>(
  provider: LlmProvider,
  args: {
    system: string
    turns: { role: 'user' | 'assistant'; content: string }[]
    jsonSchema: unknown
    toolName: string
    timeoutMs: number
    maxTokens: number
    validate: (value: unknown) => string | null
    onNarrativeDelta?: (text: string) => void
  }
): Promise<AttemptResult<T> | DegradedResult> {
  const usage = emptyUsage()
  let retried = false
  let lastReason = '未知原因'
  let lastRaw = ''

  for (let attemptNo = 0; attemptNo < 2; attemptNo++) {
    const turns = [...args.turns]
    if (attemptNo === 1) {
      retried = true
      turns.push(
        { role: 'assistant', content: lastRaw || '（无效输出）' },
        {
          role: 'user',
          content: `你的上一次输出未通过系统校验：${lastReason}。请严格按 JSON Schema 重新输出完整 JSON，只输出 JSON 本身。`,
        }
      )
    }
    try {
      const scanner = args.onNarrativeDelta
        ? new NarrativeScanner((nt) => args.onNarrativeDelta?.(nt))
        : null
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), args.timeoutMs)
      let raw = ''
      try {
        const res = await provider.generate(
          {
            system: args.system,
            turns,
            jsonSchema: args.jsonSchema,
            toolName: args.toolName,
            temperature: 0.8,
            maxTokens: args.maxTokens,
          },
          {
            onDelta: (t) => {
              raw += t
              scanner?.feed(t)
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

      const value = JSON.parse(raw)
      const failure = args.validate(value)
      if (failure) {
        lastReason = failure
        continue
      }
      return { kind: 'ok', value: value as T, usage, retried }
    } catch (e) {
      if (e instanceof SyntaxError || e instanceof z.ZodError) {
        lastReason = 'schema：输出不是符合契约的 JSON'
        continue
      }
      if (e instanceof ProviderError) {
        if (e.recoverable && attemptNo === 0) {
          lastReason = `${e.kind}：${e.message}`
          continue
        }
        return { kind: 'degraded', reason: `${e.kind}：${e.message}`, usage, retried }
      }
      return { kind: 'degraded', reason: `unknown：${String(e)}`, usage, retried }
    }
  }
  return { kind: 'degraded', reason: lastReason, usage, retried }
}

// ---- 行动演绎 ----

export interface ActAttemptArgs {
  pendingEvent?: { title: string; text: string } | null
  timeBefore?: Pick<LifeState, 'day' | 'slot'>
  provider: LlmProvider
  life: LifeState
  meta: MetaState
  locationName: string
  event?: { title: string; text: string; choiceLabel: string; facts: string[] } | null
  facts?: string[]
  playerInput: string
  allowGrowth: boolean
  /** 成长申报校验（core.growth 提供，返回拒绝理由或 null） */
  validateGrowth: (life: LifeState, growth: unknown) => string | null
  timeoutMs: number
  onNarrativeDelta?: (text: string) => void
}

export interface ActValue {
  characters?: CharacterNote[]
  narrative: string
  growth?: { key: string; reasonTag: string; reason: string }
  suggestedActions?: string[]
}

export type ActAttempt = AttemptResult<ActValue> | DegradedResult

export async function runActAttempt(args: ActAttemptArgs): Promise<ActAttempt> {
  const prompt = buildActPrompt({
    life: args.life,
    timeBefore: args.timeBefore,
    pendingEvent: args.pendingEvent,
    meta: args.meta,
    locationName: args.locationName,
    event: args.event,
    facts: args.facts,
    playerInput: args.playerInput,
    allowGrowth: args.allowGrowth,
  })
  return attempt<ActValue>(args.provider, {
    system: prompt.system,
    turns: prompt.turns,
    jsonSchema: actJsonSchema(),
    toolName: ACT_SCHEMA_NAME,
    timeoutMs: args.timeoutMs,
    maxTokens: 2000,
    validate: (value) => {
      const parsed = ActOutputSchema.safeParse(value)
      if (!parsed.success) return 'schema：字段不符合契约'
      const v = parsed.data
      if (v.growth && !args.allowGrowth) return 'growth：本回合不允许成长申报'
      if (v.growth) {
        return args.validateGrowth(args.life, v.growth)
      }
      return null
    },
    onNarrativeDelta: args.onNarrativeDelta,
  })
}

// ---- 战斗演绎 ----

export interface BattleAttemptArgs {
  provider: LlmProvider
  enemyName: string
  turn: number
  round: { facts: string[]; playerHp: number }
  life: LifeState
  timeoutMs: number
  onNarrativeDelta?: (text: string) => void
}

export type BattleAttempt = AttemptResult<{ narrative: string }> | DegradedResult

export async function runBattleAttempt(args: BattleAttemptArgs): Promise<BattleAttempt> {
  const prompt = buildBattlePrompt({
    enemyName: args.enemyName,
    turn: args.turn,
    round: { facts: args.round.facts, playerHp: args.round.playerHp },
    life: args.life,
  })
  return attempt<{ narrative: string }>(args.provider, {
    system: prompt.system,
    turns: prompt.turns,
    jsonSchema: battleJsonSchema(),
    toolName: BATTLE_SCHEMA_NAME,
    timeoutMs: args.timeoutMs,
    maxTokens: 800,
    validate: (value) => {
      const parsed = BattleOutputSchema.safeParse(value)
      return parsed.success ? null : 'schema：字段不符合契约'
    },
    onNarrativeDelta: args.onNarrativeDelta,
  })
}

// ---- 结局章 ----

export interface EndingAttemptArgs {
  provider: LlmProvider
  endingName: string
  causeText: string
  life: LifeState
  meta: MetaState
  timeoutMs: number
}

export type EndingAttempt = AttemptResult<{ title: string; narrative: string }> | DegradedResult

export async function runEndingChapter(args: EndingAttemptArgs): Promise<EndingAttempt> {
  const prompt = buildEndingPrompt({
    endingName: args.endingName,
    causeText: args.causeText,
    life: args.life,
    meta: args.meta,
  })
  return attempt<{ title: string; narrative: string }>(args.provider, {
    system: prompt.system,
    turns: prompt.turns,
    jsonSchema: endingJsonSchema(),
    toolName: ENDING_SCHEMA_NAME,
    timeoutMs: args.timeoutMs,
    maxTokens: 2500,
    validate: (value) => {
      const parsed = EndingChapterSchema.safeParse(value)
      return parsed.success ? null : 'schema：字段不符合契约'
    },
  })
}

/** 为旧存档或漏记人物整理已有经历，不产生行动或数值申报。 */
export async function runCharacterExtraction(provider: LlmProvider, life: LifeState, timeoutMs: number) {
  const source = [life.summary ?? '', ...life.history.map(h => h.text)].join('\n').slice(-12000)
  return attempt<{ characters: CharacterNote[] }>(provider, {
    system: '你是武侠游戏的人物档案整理员，只根据给定经历提炼有明确名字的人物。禁止猜测性别、所属或爱好：性别未知填未详，其余未知填空字符串。关系是与玩家的简短叙事关系，不代表数值变化。summary 每人最多60字，概括关键身份与经历；最多20人。只输出符合schema的JSON。\n输出JSON Schema：' + JSON.stringify(z.toJSONSchema(CharacterExtractionSchema, { io: 'input' })),
    turns: [{ role: 'user', content: `【输出类型：人物档案】\n【已有档案】${JSON.stringify(life.characterNotes ?? {})}\n【经历】${source}` }],
    jsonSchema: z.toJSONSchema(CharacterExtractionSchema, { io: 'input' }),
    toolName: 'character_extraction', timeoutMs, maxTokens: 3500,
    validate: value => CharacterExtractionSchema.safeParse(value).success ? null : '人物档案格式不符合契约',
  })
}
