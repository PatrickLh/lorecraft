/** HTTP API（plan P2 表）+ SSE 回合流。统一错误格式 { error: { code, message } }。 */
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HttpError } from './errors.js'
import type { GameService } from './game.js'

export function createApp(service: GameService): Hono {
  const app = new Hono()

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status)
    }
    console.error('[internal]', err)
    return c.json({ error: { code: 'internal', message: '内部错误' } }, 500)
  })

  app.use('/api/*', bodyLimit({ maxSize: 32 * 1024 }))

  app.get('/api/meta', (c) => c.json(service.getMeta()))

  app.get('/api/worlds', (c) => c.json({ worlds: service.listWorlds() }))

  app.post('/api/runs', (c) => c.json(service.createRun(), 201))

  app.get('/api/runs/active', (c) => {
    const run = service.getActiveRun()
    if (!run) {
      return c.json({ error: { code: 'no_active_run', message: '没有进行中的局' } }, 404)
    }
    return c.json({ run })
  })

  app.get('/api/runs/:id', (c) => c.json({ run: service.getRun(c.req.param('id')) }))

  app.post('/api/runs/:id/enter-world', async (c) => {
    const body = await parseBody<{ worldId?: string }>(c)
    if (!body.worldId) throw new HttpError(400, 'missing_world_id', '缺少 worldId')
    const run = service.enterWorld(c.req.param('id'), body.worldId)
    return c.json({ run })
  })

  // 回合：SSE。事件：delta（暂存叙事增量）/ result（最终结果）/ error
  app.post('/api/runs/:id/turn', async (c) => {
    const body = await parseBody<{ requestId?: string; clientVersion?: number; input?: string }>(c)
    if (!body.requestId || typeof body.requestId !== 'string') {
      throw new HttpError(400, 'missing_request_id', '缺少 requestId')
    }
    if (typeof body.clientVersion !== 'number') {
      throw new HttpError(400, 'missing_client_version', '缺少 clientVersion')
    }
    if (typeof body.input !== 'string') {
      throw new HttpError(400, 'missing_input', '缺少 input')
    }
    const runId = c.req.param('id')
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false
        const send = (event: string, data: unknown): void => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          } catch {
            closed = true
          }
        }
        try {
          const result = await service.submitTurn(
            runId,
            body.requestId as string,
            body.clientVersion as number,
            body.input as string,
            { onDelta: (text) => send('delta', { text }) }
          )
          send('result', result)
        } catch (e) {
          const he = e instanceof HttpError ? e : null
          if (!he) console.error('[turn]', e)
          send('error', {
            code: he?.code ?? 'internal',
            message: he?.message ?? '内部错误',
          })
        } finally {
          closed = true
          try {
            controller.close()
          } catch {
            // 已关闭
          }
        }
      },
    })
    return c.newResponse(stream, 200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
  })

  app.post('/api/runs/:id/settle', (c) => c.json(service.settleReconcile(c.req.param('id'))))

  app.post('/api/runs/:id/memory/retry', async (c) =>
    c.json(await service.retryMemory(c.req.param('id')))
  )

  return app
}

async function parseBody<T>(c: { req: { json: () => Promise<unknown> } }): Promise<T> {
  try {
    return (await c.req.json()) as T
  } catch {
    throw new HttpError(400, 'invalid_json', '请求体不是合法 JSON')
  }
}
