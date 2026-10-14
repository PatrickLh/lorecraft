import { eventCondMet, EVENT_COOLDOWN_DAYS, type LifeState } from '@lorecraft/core'
import { ACTIONS, EVENTS, LOCATIONS } from '@lorecraft/worlddata'

export function availableEvents(life: LifeState) {
  if (life.phase !== 'alive' || life.pendingEventId || life.pendingBattle) return []
  return EVENTS.filter(event => eventCondMet(life, event.cond) && (life.eventCooldowns[event.id] === undefined || life.day - life.eventCooldowns[event.id]! >= EVENT_COOLDOWN_DAYS))
}

/** 只识别明确指令；长篇自由叙述仍交给叙事，不按零散关键词强制改写行为。 */
export function resolveExplorationInput(input: string): { kind: 'action'; actionId: string } | { kind: 'travel'; locationId: string } | { kind: 'seek_event'; eventId: string } | null {
  const clean = input.trim().replace(/[。！!]+$/, '').replace(/^(?:我要|我想|我)/, '')
  const aliases: Record<string, string> = { '吃饭': 'yongfan', '买碗饭': 'yongfan', '吃点东西': 'yongfan', '去码头干活': 'zuogong', '到码头扛包': 'zuogong' }
  if (aliases[clean] || aliases[clean.replace(/^去/, '')]) return { kind: 'action', actionId: aliases[clean] ?? aliases[clean.replace(/^去/, '')]! }
  const action = ACTIONS.find(a => clean === a.label || clean === `去${a.label}`)
  if (action) return { kind: 'action', actionId: action.id }
  const location = LOCATIONS.find(l => ['去', '前往', '到'].some(prefix => ['', '看看', '逛逛', '走走'].some(suffix => clean === `${prefix}${l.name}${suffix}`)))
  if (location) return { kind: 'travel', locationId: location.id }
  const event = EVENTS.find(e => clean === e.title || clean === `参加${e.title}` || clean === `去${e.title}`)
  return event ? { kind: 'seek_event', eventId: event.id } : null
}
