/**
 * DeepSeek provider（OpenAI 兼容接口，fetch 直连，无 SDK 隐式重试）。
 * 结构化输出：response_format json_object + prompt 内嵌 JSON Schema。
 */
import type {
  GenerateHooks,
  GenerateRequest,
  GenerateResult,
  LlmProvider,
} from './provider.js'
import { ProviderError } from './provider.js'

export interface DeepSeekConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export class DeepSeekProvider implements LlmProvider {
  readonly name = 'deepseek'

  constructor(private readonly config: DeepSeekConfig) {}

  get model(): string {
    return this.config.model
  }

  async generate(req: GenerateRequest, hooks?: GenerateHooks): Promise<GenerateResult> {
    const stream = Boolean(hooks?.onDelta)
    const messages = [
      { role: 'system', content: req.system + (req.jsonSchema ? `\n必须返回符合以下 JSON Schema 的 JSON 对象，字段名和嵌套结构必须完全一致：\n${JSON.stringify(req.jsonSchema)}` : '') },
      ...req.turns.map((t) => ({ role: t.role, content: t.content })),
    ]
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: req.temperature ?? 0.8,
      max_tokens: req.maxTokens,
      response_format: { type: 'json_object' },
      stream,
    }
    if (stream) body.stream_options = { include_usage: true }

    let res: Response
    try {
      res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
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
        `DeepSeek HTTP ${res.status}`,
        res.status === 429 || res.status >= 500
      )
    }

    if (!stream) {
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const text = json.choices?.[0]?.message?.content ?? ''
      return {
        text,
        usage: {
          promptTokens: json.usage?.prompt_tokens ?? 0,
          completionTokens: json.usage?.completion_tokens ?? 0,
        },
      }
    }

    // SSE 流式
    let text = ''
    let promptTokens = 0
    let completionTokens = 0
    const reader = res.body?.getReader()
    if (!reader) throw new ProviderError('response', 'DeepSeek 流响应无 body', false)
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
        if (payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[]
            usage?: { prompt_tokens?: number; completion_tokens?: number }
          }
          const delta = json.choices?.[0]?.delta?.content
          if (delta) {
            text += delta
            hooks?.onDelta?.(delta)
          }
          if (json.usage) {
            promptTokens = json.usage.prompt_tokens ?? 0
            completionTokens = json.usage.completion_tokens ?? 0
          }
        } catch {
          // 忽略无法解析的行
        }
      }
    }
    return { text, usage: { promptTokens, completionTokens } }
  }
}

export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e
  if (e instanceof Error && e.name === 'AbortError') {
    return new ProviderError('timeout', 'LLM 请求超时', false)
  }
  return new ProviderError('network', `网络错误：${String(e)}`, true)
}
