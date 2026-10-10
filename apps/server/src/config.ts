/** 服务配置：全部来自环境变量（模型名、超时、路径均可配置，plan §3）。 */

export interface AppConfig {
  port: number
  host: string
  sqlitePath: string
  provider: 'mock' | 'deepseek' | 'claude'
  deepseek: { apiKey: string; baseUrl: string; model: string }
  claude: { apiKey: string; baseUrl: string; model: string }
  llmTimeoutMs: number
  llmAuxTimeoutMs: number
}

function num(v: string | undefined, dflt: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : dflt
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const provider = (env.LLM_PROVIDER ?? 'mock') as AppConfig['provider']
  return {
    port: num(env.PORT, 8787),
    host: env.HOST ?? '127.0.0.1',
    sqlitePath: env.SQLITE_PATH ?? './data/lorecraft.db',
    provider,
    deepseek: {
      apiKey: env.DEEPSEEK_API_KEY ?? '',
      baseUrl: (env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, ''),
      model: env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    },
    claude: {
      apiKey: env.ANTHROPIC_API_KEY ?? '',
      baseUrl: (env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, ''),
      model: env.CLAUDE_MODEL ?? 'claude-sonnet-5',
    },
    llmTimeoutMs: num(env.LLM_TIMEOUT_MS, 60_000),
    llmAuxTimeoutMs: num(env.LLM_AUX_TIMEOUT_MS, 30_000),
  }
}
