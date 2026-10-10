/** Prompt 构建（plan P3）。prompt 注入世界规则、当前幕、可达 flag、权威状态、继承记忆、摘要与近期历史。 */
import type { MetaState, RunState } from '@lorecraft/core'
import {
  MEMORY_TEXT_MAX_CHARS,
  RECENT_HISTORY_WINDOW,
} from '@lorecraft/core'
import type { WorldDef } from '@lorecraft/worlddata'
import type { GenerateRequest } from './provider.js'
import { summaryJsonSchema, turnJsonSchema } from './schema.js'

export type PromptTurn = GenerateRequest['turns'][number]

const TURN_SYSTEM = `你是一款无限流文字冒险游戏的 GM（游戏主持人）。你负责演绎世界、驱动剧情，但你不拥有权威——所有状态变更必须通过结构化申报，由系统校验后生效。

铁律：
1. 只申报「本回合发生的变化」，没有变化的字段一律省略。
2. 每回合的基础寿命消耗（-1）由系统结算，你禁止申报；lifespanDelta 仅用于剧情事件带来的额外增减（如服下丹药 +5、身受重伤 -3），范围 ±10。
3. 你无权判定玩家死亡。属性单回合变动上限 ±3；死亡只由系统在数值归零时判定。危险以叙事铺垫并配合受限的伤害申报表达。
4. flagsAchieved 只能从「可直接申报的 flag」列表中按 id 选取。不在列表中的 flag（含前置未满足者）一律不得申报。
5. narrative 是给玩家看的中文叙事：第二人称「你」，200~500 字，有画面感与张力，结尾自然收束、等待玩家下一步。
6. suggestedActions：2~3 条建议行动，每条不超过 30 字，供玩家点选。
7. 严格只输出一个符合 JSON Schema 的 JSON 对象，禁止输出任何其它文字、解释或代码块标记。

输出 JSON Schema：
${JSON.stringify(turnJsonSchema())}`

export interface TurnPromptInput {
  world: WorldDef
  run: RunState
  meta: MetaState
  playerInput: string
}

export function buildTurnPrompt(input: TurnPromptInput): { system: string; turns: PromptTurn[] } {
  const { world, run, meta, playerInput } = input
  const visit = run.visit
  if (!visit) throw new Error('build_turn_prompt_not_in_world')

  const actIndex = Math.min(visit.actIndex, world.acts.length - 1)
  const act = world.acts[actIndex]

  const achieved = world.flagCatalog.filter((f) => visit.flags[f.id])
  const reachable = world.flagCatalog.filter((f) => {
    if (visit.flags[f.id]) return false
    return (f.requires ?? []).every((r) => visit.flags[r])
  })
  const winFlags = world.flagCatalog.filter((f) => world.winFlags.includes(f.id))

  const sections: string[] = []
  sections.push(`【世界】《${world.title}》（${world.theme}）`)
  sections.push(`【背景】${world.intro}`)
  sections.push(
    `【世界规则】\n${world.systemRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
  )
  sections.push(
    `【当前幕】第 ${actIndex + 1}/${world.acts.length} 幕 · ${act?.title ?? ''}\n【本幕目标】${act?.goal ?? ''}`
  )
  if (world.dangers.length > 0) {
    sections.push(`【危险源（供铺垫，不可直接判死）】\n${world.dangers.map((d) => `- ${d}`).join('\n')}`)
  }
  if (achieved.length > 0) {
    sections.push(`【已达成 flag】\n${achieved.map((f) => `- ${f.id}: ${f.description}`).join('\n')}`)
  }
  if (reachable.length > 0) {
    sections.push(
      `【可直接申报的 flag】\n${reachable.map((f) => `- ${f.id}: ${f.description}`).join('\n')}`
    )
  } else {
    sections.push('【可直接申报的 flag】（无）')
  }
  sections.push(
    `【通关所需 flag（本局主目标）】\n${winFlags.map((f) => `- ${f.id}: ${f.description}`).join('\n')}`
  )

  const npcLines = world.npcs
    .map((n) => `- ${n.name}（${n.role}）：${n.note}`)
    .join('\n')
  sections.push(`【在场人物】\n${npcLines}`)

  const items = run.items.map((i) => `${i.name}（${i.desc}）`).join('、')
  sections.push(
    `【权威状态（以此为准，叙事不得与它冲突）】\n` +
      `寿命 ${run.lifespan}/${run.capSnapshot}｜体质 ${run.attrs.con}｜心智 ${run.attrs.mind}｜敏捷 ${run.attrs.agi}\n` +
      `物品：${items || '无'}\n状态标记：${run.statusTags.join('、') || '无'}`
  )

  if (meta.memories.length > 0) {
    sections.push(
      `【继承记忆（角色前世经历，可在叙事中自然引用）】\n${meta.memories
        .map((m) => `- ${m.text}`)
        .join('\n')}`
    )
  }
  if (run.summary) {
    sections.push(`【此前摘要】${run.summary}`)
  }
  const recent = run.history.slice(-RECENT_HISTORY_WINDOW)
  if (recent.length > 0) {
    sections.push(
      `【近期经过】\n${recent
        .map((r) => `第${r.turn}回合｜玩家：「${r.playerInput}」｜${r.narrative.slice(0, 120)}${r.narrative.length > 120 ? '…' : ''}`)
        .join('\n')}`
    )
  }
  sections.push(`【玩家输入】${playerInput}`)

  return { system: TURN_SYSTEM, turns: [{ role: 'user', content: sections.join('\n\n') }] }
}

// ---- 记忆提炼 ----

const MEMORY_EXTRACT_SYSTEM = `你是一款无限流文字冒险游戏的记忆提炼器。从一段角色经历中提炼「带走的记忆」。
要求：
1. 最多 ${5} 条，每条不超过 ${MEMORY_TEXT_MAX_CHARS} 个字。
2. 第二人称（以「你」开头），像角色亲历后的领悟。
3. 只保留对后续冒险有用的信息：世界规则、致命危险、关键人物、路线捷径、血的教训。
4. 严格只输出符合 JSON Schema 的 JSON。`

export function buildMemoryExtractPrompt(args: {
  sourceTitle: string
  sourceText: string
}): { system: string; turns: PromptTurn[] } {
  return {
    system: MEMORY_EXTRACT_SYSTEM,
    turns: [
      {
        role: 'user',
        content: `【经历来源】${args.sourceTitle}\n【经历原文】\n${args.sourceText}`,
      },
    ],
  }
}

const MEMORY_MERGE_SYSTEM = `你是一款无限流文字冒险游戏的记忆整理器。角色的记忆条目超过了保存上限。
要求：
1. 把全部记忆合并压缩为不超过指定条数的记忆列表。
2. 每条不超过 ${MEMORY_TEXT_MAX_CHARS} 个字，第二人称。
3. 优先保留：致命危险的教训、仍然有效的世界规则、重要人物与承诺。合并重复与过时信息。
4. 严格只输出符合 JSON Schema 的 JSON。`

export function buildMemoryMergePrompt(args: {
  memories: string[]
  maxTotal: number
}): { system: string; turns: PromptTurn[] } {
  return {
    system: MEMORY_MERGE_SYSTEM,
    turns: [
      {
        role: 'user',
        content: `【上限】${args.maxTotal} 条\n【现有记忆】\n${args.memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
      },
    ],
  }
}

// ---- 滚动摘要 ----

const SUMMARY_SYSTEM = `你是一款无限流文字冒险游戏的剧情摘要器。把「旧摘要」与「新经过」合并为一段不超过 400 字的剧情摘要。
要求：保留对后续剧情有影响的事实（状态变化、flag 进展、人物关系、承诺与伏笔），舍弃氛围描写。严格只输出符合 JSON Schema 的 JSON。`

export function buildSummaryPrompt(args: {
  existingSummary: string | null
  turns: { turn: number; playerInput: string; narrative: string }[]
}): { system: string; turns: PromptTurn[] } {
  const oldPart = args.existingSummary ? `【旧摘要】${args.existingSummary}\n\n` : ''
  const newPart = `【新经过】\n${args.turns
    .map((t) => `第${t.turn}回合｜玩家：「${t.playerInput}」｜${t.narrative}`)
    .join('\n')}`
  return {
    system: SUMMARY_SYSTEM,
    turns: [{ role: 'user', content: oldPart + newPart }],
  }
}

// 供测试确认摘要 schema 被引用
export const __schemas = { summaryJsonSchema }
