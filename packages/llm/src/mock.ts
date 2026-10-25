/**
 * v2.0 Mock provider（plan P0）：不依赖 API key，覆盖四类输出契约与斜杠命令。
 * 命令：/grow 属性 ｜ /bad-grow ｜ /bad-json ｜ 普通文本 → 普通演绎
 * 战斗与结局演绎按 prompt 中的标记返回模板文本。
 */
import type { GenerateHooks, GenerateRequest, GenerateResult, LlmProvider, ProviderErrorKind } from './provider.js'
import { ProviderError } from './provider.js'
import { fallbackDaily } from '@lorecraft/core'

export type MockStep =
  | { type: 'raw'; text: string }
  | { type: 'error'; kind: ProviderErrorKind; message: string }

const TAG_BY_KEY: Record<string, string> = {
  atk: 'combat',
  def: 'training',
  int: 'study',
  agi: 'agility',
  maxMp: 'breath',
  maxHp: 'body',
}

function extractAfterMarker(text: string, marker: string): string {
  const idx = text.lastIndexOf(marker)
  if (idx === -1) return ''
  return text.slice(idx + marker.length).trim()
}

export class MockProvider implements LlmProvider {
  readonly name = 'mock'
  readonly model = 'mock-1'
  private queue: MockStep[] = []

  push(step: MockStep): void {
    this.queue.push(step)
  }
  clear(): void {
    this.queue = []
  }
  get pending(): number {
    return this.queue.length
  }

  async generate(req: GenerateRequest, hooks?: GenerateHooks): Promise<GenerateResult> {
    const step = this.queue.shift()
    if (step?.type === 'error') {
      throw new ProviderError(step.kind, step.message, step.kind === 'network' || step.kind === 'http')
    }

    const userText = req.turns
      .filter((t) => t.role === 'user')
      .map((t) => t.content)
      .join('\n')

    const text = step?.type === 'raw' ? step.text : this.defaultOutput(userText)
    await this.streamOut(text, hooks)
    return { text, usage: { promptTokens: 100, completionTokens: Math.ceil(text.length / 2) } }
  }

  private async streamOut(text: string, hooks?: GenerateHooks): Promise<void> {
    if (!hooks?.onDelta) return
    for (let i = 0; i < text.length; i += 8) {
      hooks.onDelta(text.slice(i, i + 8))
    }
  }

  /** 按 prompt 中的 schema 名标记（【输出类型：…】）决定默认输出形状 */
  private defaultOutput(userText: string): string {
    if (userText.includes('【输出类型：每日事件】')) {
      const id = userText.match(/当前地点ID：([^。\n]+)/)?.[1] ?? 'pomin'
      return JSON.stringify(fallbackDaily(id, '此地', Number(userText.match(/绝对日序：(\d+)/)?.[1] ?? 0)))
    }
    if (userText.includes('【输出类型：人物档案】')) return JSON.stringify({ characters: [] })
    if (userText.includes('【输出类型：战斗】')) {
      const enemy = extractAfterMarker(userText, '【敌方】').split('\n')[0]?.trim() || '敌人'
      return JSON.stringify({
        narrative: `（mock 战斗演绎）刀光剑影间，你与${enemy}战作一团，招式往来全凭本能。`,
      })
    }
    if (userText.includes('【输出类型：结局】')) {
      return JSON.stringify({
        title: '江湖路远',
        narrative: '（mock 结局章）多年以后，茶馆里的说书人仍会讲起那个少年离城的清晨。',
      })
    }
    if (userText.includes('【输出类型：记忆】')) {
      return JSON.stringify({
        memories: ['你记得恶霸赵横的刀法有个旧伤破绽', '钱塘城的醉仙楼后院藏着一条密道'],
      })
    }
    if (userText.includes('【输出类型：摘要】')) {
      return JSON.stringify({ summary: '（mock 摘要）少年在钱塘城谋生习武，结下数段恩怨。' })
    }

    // 行动演绎（默认）
    const input = extractAfterMarker(userText, '【玩家输入】')
    const cmds = input
      .split(/[\n;；]+/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith('/'))

    if (input.includes('/bad-json')) {
      return '{"narrative": "四周的一切忽然扭曲，'
    }

    const decl: { narrative: string; growth?: Record<string, string>; suggestedActions?: string[] } = {
      narrative: `（mock 演绎）你：「${input || '环顾四周'}」。街市人声嘈杂，日子照常过。`,
      suggestedActions: ['去坊市逛逛', '找个地方歇脚'],
    }

    for (const cmd of cmds) {
      const parts = cmd.slice(1).split(/\s+/)
      switch (parts[0]) {
        case 'grow': {
          const key = parts[1] ?? 'atk'
          decl.growth = {
            key,
            reasonTag: TAG_BY_KEY[key] ?? 'combat',
            reason: '这次经历让你有所精进',
          }
          decl.narrative = `（mock 演绎）这一番经历让你隐隐有所得，${key}似乎精进了一分。`
          break
        }
        case 'bad-grow': {
          // 类别不匹配：智力成长挂 combat 标签 → 校验应拒绝
          decl.growth = { key: 'int', reasonTag: 'combat', reason: '胡乱打的' }
          decl.narrative = '（mock 演绎）你胡乱挥舞了几下拳头。'
          break
        }
        case 'help': {
          decl.narrative = 'Mock 命令：/grow 属性 ｜ /bad-grow ｜ /bad-json'
          break
        }
        default:
          decl.narrative = `（mock 演绎）你：「${input}」。一切如常。`
      }
    }
    return JSON.stringify(decl)
  }
}
