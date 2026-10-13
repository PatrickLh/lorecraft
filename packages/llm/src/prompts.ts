/** v2.0 Prompt 构建（plan P3）。演绎以引擎结算与权威状态为唯一事实；LLM 无数值决定权。 */
import type { GrowKey, HistoryEntry, LifeState, MetaState, MemoryRecord } from '@lorecraft/core'
import { GROW_LABELS, clockInfo, formatDate, seasonName, slotName, SLOTS_PER_DAY } from '@lorecraft/core'
import type { PromptTurn } from './prompt-types.js'
import {
  actJsonSchema,
  battleJsonSchema,
  endingJsonSchema,
  memoryJsonSchema,
  summaryJsonSchema,
} from './schema.js'

const PERSONA = `你是一款武侠生存模拟文字游戏的执笔人。世界设定为低武江湖（金庸/古龙式的市井与门派），玩家是一介小虾米。
铁律：
1. 你只负责演绎，不拥有权威。所有数值、生死、恩怨变化均由系统结算，叙事必须与系统给定的事实一致，不得虚构结果。
2. 中文叙事，第二人称「你」，有画面感，符合市井江湖烟火气。
3. 严格只输出符合 JSON Schema 的 JSON，禁止输出任何其它文字。
4. 时间完全由【时间锚点】决定：当前场景、光照、人物作息及建议行动必须符合当前季节与时辰；历史、记忆和玩家意图不能覆盖系统时间。不能自行推进至翌日、数日后或换季。只有系统给出跨时段区间时才可演绎该区间，反馈结尾必须落在当前时间。`

type GameTime = Pick<LifeState, 'day' | 'slot'>

const TIME_SCENES = [
  '晨：清晨至上午，天色转亮；不得将当前场景写成午后、黄昏或深夜。',
  '午：正午至下午，白昼；不得将当前场景写成清晨、日落之后或夜间。',
  '昏：日暮至傍晚，光线渐暗；不得写成朝阳初升、正午烈日或已到半夜。',
  '夜：入夜至凌晨，夜色；不得在没有跨日结算的情况下写成天已大亮或午后。',
]

function timeAnchor(current: GameTime, before?: GameTime): string {
  const lines = [`【时间锚点（高于历史叙事与玩家输入）】当前：${formatDate(current.day, current.slot)}；季节：${seasonName(current.day)}；时辰：${slotName(current.slot)}。`, TIME_SCENES[current.slot] ?? TIME_SCENES[0]!]
  if (before) {
    const elapsed = (current.day - before.day) * SLOTS_PER_DAY + current.slot - before.slot
    lines.push(`行动开始：${formatDate(before.day, before.slot)}；行动结算/反馈结束：${formatDate(current.day, current.slot)}；系统实际推进 ${elapsed} 个时段。`)
    lines.push(elapsed === 0 ? '本次未推进时间：事件经过与反馈都发生在当前时辰，不得写过夜或跨日。' : '行动经过仅能发生在上述起止区间；新出现的事件和后续建议以结算后的当前时辰为准。')
  } else lines.push('未提供时间推进区间：按当前时辰演绎，不得自行跨时段。')
  lines.push('季节只由系统决定；不因雪夜回忆、故事标题或历史描述擅自改变当前季节。不必刻意添加天气，没有依据不要把季节推断为确定天气。')
  return lines.join('\n')
}

// ---- 行动/事件演绎 ----

const ACT_SYSTEM = `${PERSONA}
本回合输出（行动演绎）：
1. narrative：200~500 字，演绎玩家行动或事件经过与结果，与【事件】【结算事实】（若有）完全一致。
2. growth（仅在【允许成长申报】时可选）：从这段经历中提炼至多 1 点属性成长。key 与 reasonTag 必须匹配：
   - combat→atk（战斗/比武）；training→atk/def（练功打熬）；study→int（读书/解谜/论道）；
   - agility→agi（身法/逃亡/轻功）；breath→maxMp（内功吐纳）；body→maxHp（进补/打熬筋骨）。
   不匹配的申报会被系统整份拒绝。没有值得成长就省略。
3. suggestedActions：2~3 条、每条 ≤30 字的下一步建议。
4. characters：可选，最多 5 位本段 narrative 中实际出现且有名字的人物。用简短档案帮助玩家回忆：name（≤20字）、gender（男/女/未详）、organization（所属门派或部门，≤24字）、hobby（爱好，≤24字）、summary（关键经历，≤60字）、relation（与玩家的叙事关系，≤24字）。无依据的性别填未详，其余未知填空串；不为补齐字段虚构人物信息，不把过路人统一起名。用已知人名保持同一人物身份，同一人物的别名统一为叙事中出现的常用称呼；摘要替换而非不断追加，不自行改变数值恩怨。

输出 JSON Schema：
${JSON.stringify(actJsonSchema())}`

export interface ActPromptArgs {
  timeBefore?: GameTime
  life: LifeState
  meta: MetaState
  locationName: string
  /** 事件上下文（预设事件被触发时） */
  event?: { title: string; text: string; choiceLabel: string; facts: string[] } | null
  /** 修炼/固定行动的结算事实 */
  facts?: string[]
  playerInput: string
  allowGrowth: boolean
}

export function buildActPrompt(args: ActPromptArgs): { system: string; turns: PromptTurn[] } {
  const life = args.life
  const clock = clockInfo(life)
  const sections: string[] = []
  sections.push('【输出类型：行动】')
  sections.push(timeAnchor(life, args.timeBefore))
  sections.push(
    `【权威状态（以此为准）】\n${clock.text}｜地点：${args.locationName}\n` +
      `生命 ${life.attrs.hp}/${life.attrs.maxHp}${life.injured ? '（重伤：上限受损）' : ''}｜真气 ${life.attrs.mp}/${life.attrs.maxMp}\n` +
      `武力 ${life.attrs.atk}｜防御 ${life.attrs.def}｜智力 ${life.attrs.int}｜敏捷 ${life.attrs.agi}\n` +
      `银两 ${life.money} 两｜温饱 ${life.food}/10｜声望 ${life.rep}`
  )
  if (life.characterNotes) sections.push(`【本世人物档案（保持身份一致）】${JSON.stringify(Object.values(life.characterNotes).slice(-30))}`)
  const learned = life.martials.map((m) => m.id).join('、')
  sections.push(`【已学武学】${learned || '无'}`)
  const npcEntries = Object.entries(life.npcs)
    .filter(([, v]) => Math.abs(v) >= 20)
    .map(([id, v]) => `${id}(${v > 0 ? '交好' : '结怨'} ${Math.abs(v)})`)
  if (npcEntries.length > 0) sections.push(`【恩怨】${npcEntries.join('、')}`)
  const factionEntries = Object.entries(life.factions)
    .filter(([, v]) => Math.abs(v) >= 20)
    .map(([id, v]) => `${id}(${v > 0 ? '友善' : '敌视'} ${Math.abs(v)})`)
  if (factionEntries.length > 0) sections.push(`【势力】${factionEntries.join('、')}`)
  if (life.sectId) sections.push(`【身份】${life.sectId} 门下弟子`)

  if (args.meta.memories.length > 0) {
    sections.push(
      `【前世记忆（可在叙事中自然引用）】\n${args.meta.memories.map((m: MemoryRecord) => `- ${m.text}`).join('\n')}`
    )
  }
  if (life.summary) sections.push(`【此前摘要】${life.summary}`)

  if (args.event) {
    sections.push(
      `【事件】${args.event.title}\n${args.event.text}\n【玩家选择】${args.event.choiceLabel}\n【结算事实】\n${args.event.facts.map((f) => `- ${f}`).join('\n')}`
    )
    sections.push('【允许成长申报】否（事件成长已由系统结算，禁止申报 growth）')
  } else {
    if (args.facts && args.facts.length > 0) {
      sections.push(`【结算事实】\n${args.facts.map((f) => `- ${f}`).join('\n')}`)
    }
    sections.push(`【允许成长申报】${args.allowGrowth ? '是（至多 1 点，类别必须匹配）' : '否'}`)
  }

  const recent = life.history.slice(-10)
  if (recent.length > 0) {
    sections.push(`【近期经过（历史时间不得作为当前时间）】\n${recent.map((h: HistoryEntry) => `- [${formatDate(h.day, h.slot)}] ${h.text.slice(0, 80)}`).join('\n')}`)
  }
  sections.push(`【玩家输入】${args.playerInput}`)

  return { system: ACT_SYSTEM, turns: [{ role: 'user', content: sections.join('\n\n') }] }
}

// ---- 战斗演绎 ----

const BATTLE_SYSTEM = `${PERSONA}
本回合输出（战斗演绎）：以【结算事实】为唯一事实，用 ≤150 字写出这个回合的交锋。
不要编造引擎之外的结果（谁闪避了、谁暴击了、掉了多少血都要按事实写）。招式名可使用玩家所出招的武学名。

输出 JSON Schema：
${JSON.stringify(battleJsonSchema())}`

export function buildBattlePrompt(args: {
  enemyName: string
  turn: number
  round: { facts: string[]; playerHp: number }
  life: LifeState
}): { system: string; turns: PromptTurn[] } {
  const sections: string[] = []
  sections.push('【输出类型：战斗】')
  sections.push(timeAnchor(args.life))
  sections.push(`【敌方】${args.enemyName}`)
  sections.push(
    `【我方状态】生命 ${args.round.playerHp}/${args.life.attrs.maxHp}｜真气 ${args.life.attrs.mp}/${args.life.attrs.maxMp}`
  )
  sections.push(`【回合】第 ${args.turn} 回合`)
  sections.push(`【结算事实】\n${args.round.facts.map((f) => `- ${f}`).join('\n')}`)
  return { system: BATTLE_SYSTEM, turns: [{ role: 'user', content: sections.join('\n\n') }] }
}

// ---- 结局章 ----

const ENDING_SYSTEM = `${PERSONA}
本回合输出（结局章）：为这一生的终点写一章收束文字。以【生平结算】为事实基础，600~900 字，
交代这个人如何走到终点、江湖如何记住他。第二人称「你」，笔调苍凉或豪迈随结局气质。

输出 JSON Schema：
${JSON.stringify(endingJsonSchema())}`

export function buildEndingPrompt(args: {
  endingName: string
  causeText: string
  life: LifeState
  meta: MetaState
}): { system: string; turns: PromptTurn[] } {
  const life = args.life
  const sections: string[] = []
  sections.push('【输出类型：结局】')
  sections.push(timeAnchor(life))
  sections.push('生平回顾可以明确回溯过去，不得把过去的时辰或季节写成临终当下。')
  sections.push(`【结局】${args.endingName}（${args.causeText}）`)
  sections.push(
    `【生平结算】享年 ${life.endedAtDay !== null ? 16 + Math.floor(life.endedAtDay / 360) : '?'} 岁\n` +
      `武力 ${life.attrs.atk}｜防御 ${life.attrs.def}｜智力 ${life.attrs.int}｜敏捷 ${life.attrs.agi}\n` +
      `银两 ${life.money}｜声望 ${life.rep}\n` +
      `武学：${life.martials.map((m) => m.id).join('、') || '无'}\n` +
      `身份：${life.sectId ?? '无门无派'}`
  )
  if (args.meta.memories.length > 0) {
    sections.push(`【前世记忆】\n${args.meta.memories.map((m) => `- ${m.text}`).join('\n')}`)
  }
  const recent = life.history.slice(-10)
  if (recent.length > 0) {
    sections.push(`【临终经历】\n${recent.map((h) => `- ${h.text.slice(0, 60)}`).join('\n')}`)
  }
  return { system: ENDING_SYSTEM, turns: [{ role: 'user', content: sections.join('\n\n') }] }
}

// ---- 记忆提炼 / 合并 / 摘要 ----

const MEMORY_EXTRACT_SYSTEM = `你是一款武侠生存模拟游戏的记忆提炼器。从一段生平中提炼「带到来世」的记忆。
要求：
1. 最多 5 条，每条不超过 ${50} 个字，第二人称（以「你」开头）。
2. 只保留对来世有用的：仇人是谁、秘笈下落、致命教训、重要人物、捷径。
3. 严格只输出符合 JSON Schema 的 JSON。`

export function buildMemoryExtractPrompt(args: {
  sourceTitle: string
  sourceText: string
}): { system: string; turns: PromptTurn[] } {
  return {
    system: MEMORY_EXTRACT_SYSTEM,
    turns: [
      {
        role: 'user',
        content: `【输出类型：记忆】\n【经历来源】${args.sourceTitle}\n【生平原文】\n${args.sourceText}`,
      },
    ],
  }
}

const MEMORY_MERGE_SYSTEM = `你是一款武侠生存模拟游戏的记忆整理器。记忆条目超过了保存上限（魂魄承载有限）。
要求：合并压缩到不超过指定条数；每条不超过 50 字、第二人称；优先保留仇怨、秘笈下落、致命教训。
严格只输出符合 JSON Schema 的 JSON。`

export function buildMemoryMergePrompt(args: {
  memories: string[]
  maxTotal: number
}): { system: string; turns: PromptTurn[] } {
  return {
    system: MEMORY_MERGE_SYSTEM,
    turns: [
      {
        role: 'user',
        content: `【输出类型：记忆】\n【上限】${args.maxTotal} 条\n【现有记忆】\n${args.memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
      },
    ],
  }
}

const SUMMARY_SYSTEM = `你是一款武侠生存模拟游戏的剧情摘要器。把「旧摘要」与「新经过」合并为不超过 400 字的剧情摘要。
保留对后续有影响的事实（恩怨、承诺、武学进展、身世线索），舍弃氛围描写。严格只输出符合 JSON Schema 的 JSON。`

export function buildSummaryPrompt(args: {
  existingSummary: string | null
  entries: { label: string; text: string }[]
}): { system: string; turns: PromptTurn[] } {
  const oldPart = args.existingSummary ? `【旧摘要】${args.existingSummary}\n\n` : ''
  const newPart = `【新经过】\n${args.entries.map((e) => `- ${e.label}：${e.text}`).join('\n')}`
  return {
    system: SUMMARY_SYSTEM,
    turns: [{ role: 'user', content: `【输出类型：摘要】\n${oldPart}${newPart}` }],
  }
}

/** 供测试与 mock 识别的 grow 键列表 */
export const __growLabels = GROW_LABELS
