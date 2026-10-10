/**
 * Mock provider（plan P0）：不依赖 API key，返回可控成功、死亡、通关与异常输出。
 * 两种用法：
 * 1. 测试脚本：push() 灌入原始 JSON 或错误。
 * 2. 手动联调：玩家输入里使用斜杠命令（见下方帮助）。
 */
import type { GenerateHooks, GenerateRequest, GenerateResult, LlmProvider, ProviderErrorKind } from './provider.js'
import { ProviderError } from './provider.js'

export type MockStep =
  | { type: 'raw'; text: string }
  | { type: 'error'; kind: ProviderErrorKind; message: string }

export const MOCK_COMMAND_HELP = `Mock 命令：/flag id1,id2 ｜ /win ｜ /dmg con 3 ｜ /heal mind 2 ｜ /life -5 ｜ /gain 名称|描述 ｜ /lose 名称 ｜ /tag 中毒 ｜ /untag 中毒 ｜ /bad-json ｜ /bad-flag`

function extractPlayerInput(userText: string): string {
  const idx = userText.lastIndexOf('【玩家输入】')
  if (idx === -1) return userText
  return userText.slice(idx + '【玩家输入】'.length).trim()
}

function extractFlagSection(userText: string, header: string): string[] {
  const lines = userText.split('\n')
  const ids: string[] = []
  let inSection = false
  for (const line of lines) {
    if (line.startsWith('【')) {
      inSection = line.startsWith(header)
      continue
    }
    if (inSection) {
      const m = /^- ([a-z0-9_]+):/.exec(line.trim())
      if (m?.[1]) ids.push(m[1])
    }
  }
  return ids
}

interface ParsedDecl {
  narrative: string
  stateChanges?: Record<string, unknown>
  flagsAchieved?: string[]
  suggestedActions?: string[]
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

    // 命令与 prompt 结构信息可能分布在多条 user 消息（重试反馈追加在后面），
    // 因此跨全部 user 消息提取
    const userText = req.turns
      .filter((t) => t.role === 'user')
      .map((t) => t.content)
      .join('\n')
    const input = extractPlayerInput(userText)

    // 故意截断的非法 JSON，用于注入 schema 失败
    const text =
      step?.type === 'raw'
        ? step.text
        : input.includes('/bad-json')
          ? '{"narrative": "四周的一切忽然扭曲，'
          : JSON.stringify(this.commandDecl(userText, input))
    await this.streamOut(text, hooks)
    return { text, usage: { promptTokens: 100, completionTokens: Math.ceil(text.length / 2) } }
  }

  private async streamOut(text: string, hooks?: GenerateHooks): Promise<void> {
    if (!hooks?.onDelta) return
    for (let i = 0; i < text.length; i += 8) {
      hooks.onDelta(text.slice(i, i + 8))
    }
  }

  private commandDecl(userText: string, input: string): ParsedDecl {
    const decl: ParsedDecl = {
      narrative: '',
      suggestedActions: ['观察四周', '原地休息'],
    }
    const cmds = input
      .split(/[\n;；]+/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith('/'))
    if (cmds.length === 0) {
      decl.narrative = `（mock 演绎）你：「${input}」。四周的景象静静延伸，暂时一切如常。`
      return decl
    }

    const reachable = new Set(extractFlagSection(userText, '【可直接申报的 flag】'))
    const winFlags = extractFlagSection(userText, '【通关所需 flag（本局主目标）】')
    const narrativeParts: string[] = []
    const attrDelta: Record<string, number> = {}
    const flags: string[] = []
    let lifespanDelta: number | undefined
    const itemsGained: { name: string; desc?: string }[] = []
    const itemsLostNames: string[] = []
    const tagsGained: string[] = []
    const tagsRemoved: string[] = []

    for (const cmd of cmds) {
      const parts = cmd.slice(1).split(/\s+/)
      const head = parts[0]
      switch (head) {
        case 'flag': {
          for (const id of (parts[1] ?? '').split(',')) {
            if (id) flags.push(id)
          }
          narrativeParts.push('某种隐秘的真相被你握在了手里。')
          break
        }
        case 'win': {
          flags.push(...winFlags)
          narrativeParts.push('你完成了这个世界交给你的一切。')
          break
        }
        case 'dmg': {
          const k = parts[1]
          const v = -Math.abs(Number(parts[2] ?? 3))
          if (k === 'con' || k === 'mind' || k === 'agi') attrDelta[k] = (attrDelta[k] ?? 0) + v
          narrativeParts.push('一阵剧痛袭来。')
          break
        }
        case 'heal': {
          const k = parts[1]
          const v = Math.abs(Number(parts[2] ?? 2))
          if (k === 'con' || k === 'mind' || k === 'agi') attrDelta[k] = (attrDelta[k] ?? 0) + v
          narrativeParts.push('暖流涌过四肢百骸。')
          break
        }
        case 'life': {
          lifespanDelta = (lifespanDelta ?? 0) + Number(parts[1] ?? 0)
          narrativeParts.push('你感到生命在流逝/充盈。')
          break
        }
        case 'gain': {
          const rest = cmd.slice('/gain '.length)
          const [name, desc] = rest.split('|')
          if (name?.trim()) itemsGained.push({ name: name.trim(), desc: desc?.trim() })
          narrativeParts.push('你把它收进了怀里。')
          break
        }
        case 'lose': {
          const name = parts.slice(1).join(' ')
          if (name) itemsLostNames.push(name)
          narrativeParts.push('它从你手中消失了。')
          break
        }
        case 'tag': {
          const t = parts.slice(1).join(' ')
          if (t) tagsGained.push(t)
          narrativeParts.push('某种状态缠上了你。')
          break
        }
        case 'untag': {
          const t = parts.slice(1).join(' ')
          if (t) tagsRemoved.push(t)
          narrativeParts.push('那种状态消散了。')
          break
        }
        case 'bad-flag': {
          flags.push('not_a_real_flag')
          narrativeParts.push('。')
          break
        }
        case 'help': {
          narrativeParts.push(MOCK_COMMAND_HELP)
          break
        }
        default:
          narrativeParts.push(`（未知 mock 命令 ${head}）`)
      }
    }
    // 可直接申报列表过滤不在此处做——非法 id 交给真实校验链路，用于测试重试/降级
    void reachable

    decl.narrative = `（mock 演绎）${narrativeParts.join('') || '四周一切如常。'}`
    const sc: Record<string, unknown> = {}
    if (Object.keys(attrDelta).length > 0) sc.attributeDelta = attrDelta
    if (lifespanDelta !== undefined) sc.lifespanDelta = lifespanDelta
    if (itemsGained.length > 0) sc.itemsGained = itemsGained
    if (itemsLostNames.length > 0) sc.itemsLostNames = itemsLostNames
    if (tagsGained.length > 0) sc.tagsGained = tagsGained
    if (tagsRemoved.length > 0) sc.tagsRemoved = tagsRemoved
    if (Object.keys(sc).length > 0) decl.stateChanges = sc
    if (flags.length > 0) decl.flagsAchieved = flags
    return decl
  }
}
