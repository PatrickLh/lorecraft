import { applyOutcome, advanceTime, choiceAvailable, formatDate, markLifeEnd, rememberCharacters, type ChapterEvent, type ChapterChoice, type LifeState, type Rng, type StoryView } from '@lorecraft/core'
import { CHAPTER_EVENTS, CHAPTER_LOCATIONS, CHAPTER_NPCS, CHAPTER_PREMISE, CHAPTER_TITLE, FACTIONS, MARTIAL_DEFS } from '@lorecraft/worlddata'
import { HttpError } from './errors.js'

const tick = (life: LifeState) => life.day * 4 + life.slot
const has = (life: LifeState, flag: string) => life.flags.includes(flag)
function addFlags(life: LifeState, flags: string[]) { life.flags = [...new Set([...life.flags, ...flags])] }
export function beginChapter(life: LifeState): string {
  if (life.story) throw new HttpError(409, 'chapter_started', '本章已经开始，不会重置剧情或期限')
  life.story = { id: 'xuandeng', startTick: tick(life), decisions: {}, news: [], interactions: {}, ending: null, lastScene: CHAPTER_PREMISE }
  life.dailyPlan = null
  return `${CHAPTER_TITLE}\n\n${CHAPTER_PREMISE}\n\n故事从你随身携带的旧物开始。那道被磨淡的云雷纹，曾经出现在一份无人愿意提起的案卷里。`
}
export function updateChapterWorld(life: LifeState): string[] {
  if (!life.story) return []
  const facts: string[] = []
  const elapsed = tick(life) - life.story.startTick
  for (const event of CHAPTER_EVENTS) {
    if (!event.expire || event.deadline === undefined || elapsed < event.deadline || has(life, event.excludes[0]!)) continue
    // 世界事件按日程发生；玩家未接受甚至未看过邀请，也不会冻结世界。
    addFlags(life, event.expire.flags)
    life.story.decisions[event.id] = 'expired'
    life.story.news.push({ id: event.id, text: event.expire.text, tick: life.story.startTick + event.deadline })
    if (event.expire.ending) life.story.ending = event.expire.ending
    facts.push(`【江湖消息】${event.expire.text}`)
  }
  return facts
}
function eventReason(life: LifeState, event: ChapterEvent): string {
  if (!life.story) return '进入章节后可参与'
  if (event.requires.some(f => !has(life, f))) return '先完成当前调查目标，或留意世界事件带来的新线索'
  if (event.excludes.some(f => has(life, f))) return '此事已有决定'
  const elapsed = tick(life) - life.story.startTick
  if (event.after !== undefined && elapsed < event.after) return `开放时间尚未到：${formatTick(life.story.startTick + event.after)}`
  if (event.deadline !== undefined && elapsed >= event.deadline) return '事件已经结束，可查看江湖消息'
  if (event.locationId && life.locationId !== event.locationId) return `前往${CHAPTER_LOCATIONS.find(l => l.id === event.locationId)?.name ?? event.locationId}`
  return ''
}
function formatTick(value: number) { return formatDate(Math.floor(value / 4), value % 4) }
function choiceReason(life: LifeState, choice: ChapterChoice): string {
  const reasons: string[] = []
  if (choice.req?.money !== undefined && life.money < choice.req.money) reasons.push(`需银两 ${choice.req.money}`)
  for (const [key, need] of Object.entries(choice.req?.attrMin ?? {})) if (life.attrs[key as keyof typeof life.attrs] < (need ?? 0)) reasons.push(`需${({ atk: '武力', int: '智力', def: '防御', agi: '敏捷' } as Record<string, string>)[key] ?? key} ${need}`)
  if (choice.requires?.some(f => !has(life, f))) reasons.push(choice.requires.includes('s_bailu_letter') ? '需完成回春堂送药，取得白露引荐' : '尚缺所需证据：原账与签押副卷')
  if (choice.npcMin && (life.npcs[choice.npcMin.id] ?? 0) < choice.npcMin.value) reasons.push(`需人物信任 ${choice.npcMin.value}`)
  if (!choiceAvailable(life, choice) && !reasons.length) reasons.push('尚未满足条件')
  return reasons.join('；')
}
export function chapterEffects(choice: ChapterChoice): string {
  const o = choice.outcome
  return [o.money ? `银两 ${o.money > 0 ? '+' : ''}${o.money}` : '', o.food ? `温饱 ${o.food > 0 ? '+' : ''}${o.food}` : '', o.rep ? `声望 ${o.rep > 0 ? '+' : ''}${o.rep}` : '', ...Object.entries(o.attrs ?? {}).map(([k, v]) => `${({ atk: '武力', def: '防御', int: '智力' } as Record<string, string>)[k] ?? k} +${v}`), ...Object.entries(o.npcs ?? {}).map(([id, delta]) => `${CHAPTER_NPCS.find(n => n.id === id)?.name ?? id}信任 ${delta >= 0 ? '+' : ''}${delta}`), o.learn ? '习得入门武学' : '', '耗一时辰'].filter(Boolean).join(' · ')
}
function npcPresent(life: LifeState, id: string) { return !(id === 'wen_jiu' && (has(life, 's_boat_gone') || has(life, 's_witness_saved'))) && !(id === 'zhou_jin' && has(life, 's_ledger_burned')) }
export function chapterView(input: LifeState): StoryView {
  const life = structuredClone(input)
  updateChapterWorld(life)
  const events = CHAPTER_EVENTS.map(event => {
    const reason = eventReason(life, event)
    const decision = life.story?.decisions[event.id]
    const done = event.excludes.some(f => has(life, f))
    const status = decision === 'expired' ? 'expired' as const : done ? 'done' as const : !reason ? 'ready' as const : reason.startsWith('前往') ? 'travel' as const : 'locked' as const
    const chosen = event.choices.find(c => c.id === decision)
    return { id: event.id, title: event.title, kind: event.kind, locationId: event.locationId, summary: event.summary, status, reason: status === 'expired' ? '此事已经结束，后果见江湖消息' : status === 'done' && chosen ? `已选择：${chosen.label}` : reason, deadline: life.story && event.deadline !== undefined ? formatTick(life.story.startTick + event.deadline) : null, text: status === 'ready' ? event.text : '', choices: status === 'ready' ? event.choices.map(choice => ({ id: choice.id, label: choice.label, enabled: !choiceReason(life, choice), reason: choiceReason(life, choice), effects: chapterEffects(choice) })) : [] }
  })
  const available = events.find(e => e.kind === 'main' && (e.status === 'ready' || e.status === 'travel'))
  const stage = life.story?.ending ? '本章已完成，可继续生活、探索人物支线' : has(life, 's_refused') && !has(life, 's_trail') ? '未接下旧案调查；三日后的镖局消息会带来其他入口' : available?.title ?? events.find(e => e.kind === 'main' && e.status === 'locked')?.title ?? '留意江湖消息'
  const scene = events.find(e => e.status === 'ready' && e.kind === 'main')
  const evidence = ([['s_seal_witness', '周劲的交接拓印'], ['s_witness_saved', '温九的签押证词'], ['s_evidence', '玄灯庄原账'], ['s_record_proof', '临安签押副卷'], ['s_bailu_letter', '白露的引荐信']] as const).filter(([flag]) => has(life, flag)).map(([, label]) => String(label))
  if (has(life, 's_house') && !has(life, 's_evidence')) evidence.push('残页上的名字（不等同完整原件）')
  if (has(life, 's_record') && !has(life, 's_record_proof') && !has(life, 's_record_sealed')) evidence.push('林知远的口述（不等同签押副本）')
  return { active: !!life.story, title: CHAPTER_TITLE, premise: CHAPTER_PREMISE, ending: life.story?.ending ?? null, stage, evidence, locations: CHAPTER_LOCATIONS, npcs: CHAPTER_NPCS.map(n => ({ ...n, relation: life.npcs[n.id] ?? 0, met: has(life, `met_${n.id}`), present: npcPresent(life, n.id) })), events, news: life.story?.news ?? [], scene: scene ? { title: scene.title, text: scene.text } : null }
}
function meet(life: LifeState, ids: string[]) {
  for (const id of ids) {
    const n = CHAPTER_NPCS.find(n => n.id === id)
    if (!n) continue
    addFlags(life, [`met_${id}`])
    rememberCharacters(life, [{ name: n.name, gender: n.gender, organization: FACTIONS.find(f => f.id === n.faction)?.name ?? n.role, hobby: n.likes.join('、'), summary: n.background.slice(0, 60), relation: n.role }], n.name)
  }
}
function finishTime(life: LifeState, slots: number): string[] {
  const result = advanceTime(life, slots)
  if (result.diedOfStarve) markLifeEnd(life, 'death', { deathCause: 'starve' })
  else if (result.goodDeath) markLifeEnd(life, 'ending', { endingId: 'shan_zhong' })
  return result.facts
}
export function chapterChoice(life: LifeState, eventId: string, choiceId: string, rng: Rng) {
  if (!life.story) throw new HttpError(409, 'no_chapter', '请先进入章节')
  const worldBefore = updateChapterWorld(life)
  const event = CHAPTER_EVENTS.find(e => e.id === eventId)
  if (!event) throw new HttpError(404, 'story_event_missing', '事件不存在')
  const unavailable = eventReason(life, event)
  if (unavailable) throw new HttpError(409, 'story_unavailable', unavailable)
  const choice = event.choices.find(c => c.id === choiceId)
  if (!choice) throw new HttpError(400, 'bad_choice', '选项不存在')
  const reason = choiceReason(life, choice)
  if (reason) throw new HttpError(400, 'choice_unavailable', reason)
  meet(life, event.npcIds)
  const result = applyOutcome(life, choice, MARTIAL_DEFS, rng)
  const next = result.life
  next.story!.decisions[eventId] = choiceId
  if (choice.ending) next.story!.ending = choice.ending
  if (result.starved) markLifeEnd(next, 'death', { deathCause: 'starve' })
  else if (result.died) markLifeEnd(next, 'death', { deathCause: 'mischief' })
  const facts = [...worldBefore, ...result.facts, ...updateChapterWorld(next)].map(text => CHAPTER_NPCS.reduce((value, n) => value.replaceAll(n.id, n.name), text).replaceAll('对你的观感', '信任'))
  const outcomeText = choice.outcome.text ?? ''
  const narrative = [event.text, outcomeText, facts.filter(f => f !== outcomeText).join('；')].filter(Boolean).join('\n\n')
  next.story!.lastScene = narrative
  return { life: next, narrative, facts, label: event.title, playerInput: choice.label }
}
export function chapterTravel(life: LifeState, id: string) {
  if (!life.story) throw new HttpError(409, 'no_chapter', '请先进入章节')
  const dest = CHAPTER_LOCATIONS.find(l => l.id === id)
  if (!dest) throw new HttpError(404, 'location_not_found', '地图中没有这个地点')
  if (life.locationId === id) throw new HttpError(400, 'already_here', '你已在此处')
  const from = CHAPTER_LOCATIONS.find(l => l.id === life.locationId)
  const slots = from && from.city !== dest.city ? 2 : 1
  life.locationId = dest.id
  const facts = [...finishTime(life, slots), ...updateChapterWorld(life)]
  const narrative = [`你来到${dest.name}。${dest.desc}`, `路途消耗${slots}个时辰。`, ...facts].join('\n\n')
  life.story.lastScene = narrative
  return { life, narrative, facts, label: `前往${dest.name}`, playerInput: `前往${dest.name}` }
}
export function chapterTalk(life: LifeState, id: string, topic: 'past' | 'rumor' | 'interest') {
  if (!life.story) throw new HttpError(409, 'no_chapter', '请先进入章节')
  const npc = CHAPTER_NPCS.find(n => n.id === id)
  if (!npc || npc.locationId !== life.locationId || !npcPresent(life, id)) throw new HttpError(409, 'npc_absent', '此人当前不在这里，请查看人物所在地点')
  if (!['past', 'rumor', 'interest'].includes(topic)) throw new HttpError(400, 'bad_topic', '话题不存在')
  meet(life, [id])
  const text = topic === 'past' ? npc.background : topic === 'interest' ? `“我看重${npc.likes.join('，也看重')}。${npc.boundary}”` : `${npc.name}说起自己的牵挂：“${npc.goal}”\n${life.story.news.at(-1)?.text ?? '关于玄灯旧案，消息需要与实物核对。先看你的当前调查目标，不必等随机机缘。'}`
  const key = id
  let trust = ''
  if (topic === 'interest' && life.story.interactions[key] !== life.day + 1) {
    life.story.interactions[key] = life.day + 1
    life.npcs[id] = Math.min(100, (life.npcs[id] ?? 0) + 1)
    trust = '认真倾听，信任 +1（同人每日一次）'
  }
  const facts = [trust, ...finishTime(life, 1), ...updateChapterWorld(life)].filter(Boolean)
  const narrative = [`你与${npc.name}交谈。${text}`, ...facts].join('\n\n')
  life.story.lastScene = narrative
  return { life, narrative, facts, label: `与${npc.name}交谈`, playerInput: ({ past: '询问来历', rumor: '打听近况', interest: '聊聊看重的事' })[topic] }
}
