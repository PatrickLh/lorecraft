/** Provider 抽象（requirement §9.5）。统一 chat + 结构化输出，fetch 直连，不引入 SDK 隐式重试（plan §2 重试范围）。 */

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

export interface GenerateRequest {
  system: string
  turns: { role: 'user' | 'assistant'; content: string }[]
  /** 结构化输出的 JSON Schema */
  jsonSchema?: unknown
  /** Claude 工具调用时的工具名 */
  toolName?: string
  temperature?: number
  maxTokens: number
}

export interface GenerateHooks {
  /** 流式文本增量（可能是 JSON 片段；narrative 增量由上层扫描器提取） */
  onDelta?: (text: string) => void
  signal?: AbortSignal
}

export interface GenerateResult {
  text: string
  usage: TokenUsage
}

export type ProviderErrorKind = 'timeout' | 'network' | 'http' | 'response'

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    /** 可恢复错误（网络/5xx/429）消耗重试预算；超时与不可恢复错误直接降级（plan §2 重试范围） */
    readonly recoverable: boolean
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export interface LlmProvider {
  readonly name: string
  readonly model: string
  generate(req: GenerateRequest, hooks?: GenerateHooks): Promise<GenerateResult>
}

export function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0 }
}
