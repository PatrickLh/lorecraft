/** API 客户端 + SSE 解析（plan P4：断流后查询服务端结果，避免重复提交）。 */
import type { MetaInfo, MetaState, RunState, TurnResponse, WorldCard } from './types.js'

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
    res = await fetch(path, {
      headers: { 'content-type': 'application/json' },
      ...init,
    })
  } catch (e) {
    throw new ApiError('network', `无法连接服务器：${String(e)}`, 0)
  }
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
  if (!res.ok) {
    throw new ApiError(
      body?.error?.code ?? `http_${res.status}`,
      body?.error?.message ?? res.statusText,
      res.status
    )
  }
  return body as T
}

export const api = {
  getMeta: (): Promise<MetaInfo> => req<MetaInfo>('/api/meta'),
  getWorlds: async (): Promise<WorldCard[]> => {
    const r = await req<{ worlds: WorldCard[] }>('/api/worlds')
    return r.worlds
  },
  createRun: async (): Promise<RunState> => {
    const r = await req<{ run: RunState }>('/api/runs', { method: 'POST' })
    return r.run
  },
  getActiveRun: async (): Promise<RunState | null> => {
    const r = await req<{ run: RunState | null }>('/api/runs/active')
    return r.run
  },
  getRun: async (id: string): Promise<RunState> => {
    const r = await req<{ run: RunState }>(`/api/runs/${id}`)
    return r.run
  },
  enterWorld: async (id: string, worldId: string): Promise<RunState> => {
    const r = await req<{ run: RunState }>(`/api/runs/${id}/enter-world`, {
      method: 'POST',
      body: JSON.stringify({ worldId }),
    })
    return r.run
  },
  settle: async (id: string): Promise<{ run: RunState; meta: MetaState }> => {
    return req(`/api/runs/${id}/settle`, { method: 'POST' })
  },
  retryMemory: async (id: string): Promise<{ processed: number; failed: number; meta: MetaState }> => {
    return req(`/api/runs/${id}/memory/retry`, { method: 'POST' })
  },
}

export interface StreamTurnArgs {
  runId: string
  requestId: string
  clientVersion: number
  input: string
  onDelta: (text: string) => void
}

/** POST + SSE：delta（暂存叙事增量）→ result（最终结果）或 error。返回最终结果。 */
export async function streamTurn(args: StreamTurnArgs): Promise<TurnResponse> {
  let res: Response
  try {
    res = await fetch(`/api/runs/${args.runId}/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId: args.requestId,
        clientVersion: args.clientVersion,
        input: args.input,
      }),
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
  let result: TurnResponse | null = null

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
      if (event === 'delta') {
        args.onDelta((data as { text: string }).text)
      } else if (event === 'result') {
        result = data as TurnResponse
      } else if (event === 'error') {
        const err = data as { code: string; message: string }
        throw new ApiError(err.code, err.message, 400)
      }
    }
  }

  if (!result) throw new ApiError('stream_truncated', '连接中断且未收到最终结果', 0)
  return result
}
