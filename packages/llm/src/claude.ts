/**
 * Claude provider（Anthropic Messages API，fetch 直连，无 SDK 隐式重试）。
 * 结构化输出：tool use（强制工具选择）；流式时从 input_json_delta 增量提取。
 */
import type {
  GenerateHooks,
  GenerateRequest,
  GenerateResult,
  LlmProvider,
} from './provider.js'
import { ProviderError } from './provider.js'
import { toProviderError } from './deepseek.js'

export interface ClaudeConfig {
  apiKey: string
  baseUrl: string
  model: string
}

interface ContentBlock {
  type: string
  name?: string
  input?: unknown
  text?: string
}

export class ClaudeProvider implements LlmProvider {
  readonly name = 'claude'

  constructor(private readonly config: ClaudeConfig) {}

  get model(): string {
    return this.config.model
  }

  async generate(req: GenerateRequest, hooks?: GenerateHooks): Promise<GenerateResult> {
    const toolName = req.toolName ?? 'respond'
    const stream = Boolean(hooks?.onDelta)
    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature ?? 0.8,
      system: req.system,
      messages: req.turns.map((t) => ({ role: t.role, content: t.content })),
      tools: [
        {
          name: toolName,
          description: '提交回合输出',
          input_schema: req.jsonSchema,
        },
      ],
      tool_choice: { type: 'tool', name: toolName },
      stream,
    }

    let res: Response
    try {
      res = await fetch(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: hooks?.signal,
      })
    } catch (e) {
      throw toProviderError(e)
    }
    if (!res.ok) {
      throw new ProviderError(
        'http',
        `Claude HTTP ${res.status}`,
        res.status === 429 || res.status >= 500
      )
    }

    if (!stream) {
      const json = (await res.json()) as {
        content?: ContentBlock[]
        usage?: { input_tokens?: number; output_tokens?: number }
      }
      const toolBlock = json.content?.find((b) => b.type === 'tool_use')
      const text = toolBlock ? JSON.stringify(toolBlock.input) : ''
      return {
        text,
        usage: {
          promptTokens: json.usage?.input_tokens ?? 0,
          completionTokens: json.usage?.output_tokens ?? 0,
        },
      }
    }

    // SSE 流式：聚合 input_json_delta
    let partialJson = ''
    let promptTokens = 0
    let completionTokens = 0
    const reader = res.body?.getReader()
    if (!reader) throw new ProviderError('response', 'Claude 流响应无 body', false)
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      let chunk: IteratorResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (e) {
        throw toProviderError(e)
      }
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        try {
          const event = JSON.parse(payload) as {
            type?: string
            delta?: { type?: string; partial_json?: string; text?: string }
            message?: { usage?: { input_tokens?: number; output_tokens?: number } }
            usage?: { input_tokens?: number; output_tokens?: number }
          }
          if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
              partialJson += event.delta.partial_json
              hooks?.onDelta?.(event.delta.partial_json)
            }
          } else if (event.type === 'message_start' && event.message?.usage) {
            promptTokens = event.message.usage.input_tokens ?? 0
          } else if (event.type === 'message_delta' && event.usage) {
            completionTokens = event.usage.output_tokens ?? 0
          }
        } catch {
          // 忽略无法解析的行
        }
      }
    }
    return { text: partialJson, usage: { promptTokens, completionTokens } }
  }
}
