/** 服务配置：全部来自环境变量（模型名、超时、路径均可配置，plan §3）。 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * 从 cwd 向上查找 .env 并加载到 process.env（已存在的变量优先，不覆盖）。
 * 只在服务端入口调用一次；测试通过显式传入 env 对象，不走此路径。
 */
export function loadDotEnv(): string | null {
  let dir = process.cwd()
  for (;;) {
    const candidate = resolve(dir, '.env')
    if (existsSync(candidate)) {
      for (const rawLine of readFileSync(candidate, 'utf8').split('\n')) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
        if (!m) continue
        const key = m[1] as string
        let value = (m[2] ?? '').trim()
        if (value.startsWith('"') || value.startsWith("'")) {
          const q = value[0] as string
          const end = value.indexOf(q, 1)
          value = end > 0 ? value.slice(1, end) : value.slice(1)
        } else {
          const hash = value.indexOf(' #')
          if (hash >= 0) value = value.slice(0, hash).trim()
        }
        if (!(key in process.env)) process.env[key] = value
      }
      return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

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
