import type { EventChoiceView, OutcomeView } from './types.js'

export interface ChapterState {
  id: 'xuandeng'
  startTick: number
  decisions: Record<string, string>
  news: { id: string; text: string; tick: number }[]
  interactions: Record<string, number>
  ending: string | null
  lastScene: string
}
export interface StoryLocation {
  id: string; name: string; city: '钱塘' | '临安'; kind: '城内' | '城外'; desc: string
}
export interface StoryNpc {
  id: string; name: string; gender: '男' | '女'; locationId: string; faction: string | null
  role: string; background: string; goal: string; likes: string[]; boundary: string
  ties: { id: string; text: string }[]
}
export interface ChapterChoice extends EventChoiceView {
  id: string; outcome: OutcomeView; requires?: string[]; npcMin?: { id: string; value: number }
  ending?: string
}
export interface ChapterEvent {
  id: string; title: string; kind: 'main' | 'side'; locationId: string | null; npcIds: string[]
  summary: string; text: string; requires: string[]; excludes: string[]
  after?: number; deadline?: number; expire?: { text: string; flags: string[]; ending?: string }
  choices: ChapterChoice[]
}
export interface StoryEventView {
  id: string; title: string; kind: 'main' | 'side'; locationId: string | null; summary: string
  text: string; status: 'ready' | 'travel' | 'locked' | 'done' | 'expired'; reason: string
  deadline: string | null
  choices: { id: string; label: string; enabled: boolean; reason: string; effects: string }[]
}
export interface StoryView {
  active: boolean; title: string; premise: string; ending: string | null; stage: string
  locations: StoryLocation[]; npcs: (StoryNpc & { relation: number; met: boolean; present: boolean })[]
  events: StoryEventView[]; news: ChapterState['news']; scene: { title: string; text: string } | null
  evidence: string[]
}
