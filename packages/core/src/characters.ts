import type { CharacterNote, LifeState } from './types.js'

/** 人物摘要仅供阅读，不改变代码权威的 NPC 恩怨。只收录本段叙事出现的人名。 */
export function rememberCharacters(life: LifeState, notes: CharacterNote[], narrative: string): void {
  const profiles = { ...(life.characterNotes ?? {}) }
  for (const note of notes.slice(0, 20)) {
    const name = note.name.trim()
    if (!name || !narrative.includes(name)) continue
    if (!profiles[name] && Object.keys(profiles).length >= 100) continue
    const previous = profiles[name]
    profiles[name] = {
      name,
      gender: note.gender === '未详' ? previous?.gender ?? '未详' : note.gender,
      organization: note.organization || previous?.organization || '',
      hobby: note.hobby || previous?.hobby || '',
      summary: note.summary || previous?.summary || '',
      relation: note.relation || previous?.relation || '',
    }
  }
  life.characterNotes = profiles
}
