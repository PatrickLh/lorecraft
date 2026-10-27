/** v2.0 API 客户端 + SSE 解析（断流后以服务端快照为准恢复）。 */
import type {
  ActResponse,
  BattleResponse,
  BattleState,
  EndingOption,
  EventPresentation,
  LifeState,
  MetaInfo,
  WorldCatalog,
} from './types.js'
import type { StoryView } from '@lorecraft/core'

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...init })
  } catch (e) {
    throw new ApiError('network', `无法连接服务器：${String(e)}`, 0)
  }
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
  if (!res.ok) {
    throw new ApiError(body?.error?.code ?? `http_${res.status}`, body?.error?.message ?? res.statusText, res.status)
  }
  return body as T
}

export const api = {
  getStory: (id: string): Promise<StoryView> => req(`/api/lives/${id}/story`),
  getLatestEndedLife: (): Promise<{ life: LifeState | null }> => req('/api/lives/latest-ended'),
  getOpportunities: (id: string): Promise<{ events: { id: string; title: string; text: string }[] }> => req(`/api/lives/${id}/opportunities`),
  getMeta: (): Promise<MetaInfo> => req<MetaInfo>('/api/meta'),
  getCatalog: (): Promise<WorldCatalog> => req<WorldCatalog>('/api/catalog'),
  getHistory: (): Promise<MetaInfo['meta']['history']> =>
    req<{ history: MetaInfo['meta']['history'] }>('/api/lives').then((r) => r.history),
  createLife: async (originId: string): Promise<LifeState> => {
    const r = await req<{ life: LifeState }>('/api/lives', { method: 'POST', body: JSON.stringify({ originId }) })
    return r.life
  },
  getActiveLife: async (): Promise<{
    life: LifeState | null
    event: EventPresentation | null
    availableEndings: EndingOption[]
  }> => {
    return req('/api/lives/active')
  },
  getLife: async (id: string): Promise<{
    life: LifeState
    event: EventPresentation | null
    availableEndings: EndingOption[]
  }> => {
    return req(`/api/lives/${id}`)
  },
  summarizeCharacters: (id: string, version: number): Promise<{ life: LifeState }> =>
    req(`/api/lives/${id}/characters/summarize`, { method: 'POST', body: JSON.stringify({ requestId: crypto.randomUUID(), clientVersion: version }) }),
  retryMemory: (id: string): Promise<{ processed: number; failed: number }> =>
    req(`/api/lives/${id}/memory/retry`, { method: 'POST' }),
  getMemoryStatus: (id: string): Promise<{ pending: number; failed: number; lastError: string | null }> => req(`/api/lives/${id}/memory`),
  settle: (id: string): Promise<{ life: LifeState }> =>
    req(`/api/lives/${id}/settle`, { method: 'POST' }),
}

export interface StreamArgs<T> {
  path: string
  body: Record<string, unknown>
  onDelta: (text: string) => void
}

/** POST + SSE：delta / result / error */
export async function streamCall<T>(args: StreamArgs<T>): Promise<T> {
  let res: Response
  try {
    res = await fetch(args.path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args.body),
    })
  } catch (e) {
    throw new ApiError('network', `无法连接服务器：${String(e)}`, 0)
  }
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    throw new ApiError(body?.error?.code ?? `http_${res.status}`, body?.error?.message ?? res.statusText, res.status)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: T | null = null
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      let event = 'message'
      const dataLines: string[] = []
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim()
        else if (line.startsWith('data: ')) dataLines.push(line.slice(6))
      }
      if (dataLines.length === 0) continue
      const data = JSON.parse(dataLines.join('\n')) as unknown
      if (event === 'delta') args.onDelta((data as { text: string }).text)
      else if (event === 'result') result = data as T
      else if (event === 'error') {
        const err = data as { code: string; message: string }
        throw new ApiError(err.code, err.message, 400)
      }
    }
  }
  if (!result) throw new ApiError('stream_truncated', '连接中断且未收到最终结果', 0)
  return result
}

export function actPath(lifeId: string): string {
  return `/api/lives/${lifeId}/act`
}
export function battlePath(lifeId: string): string {
  return `/api/lives/${lifeId}/battle/turn`
}

export type { ActResponse, BattleResponse, BattleState }
