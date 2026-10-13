/** v2.0 HTTP API（plan P2）+ SSE 流。统一错误 { error: { code, message } }。 */
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { BattleCommand } from '@lorecraft/core'
import { HttpError } from './errors.js'
import type { ActRequest, GameService } from './game.js'

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
  app.get('/api/catalog', (c) => c.json(service.catalog()))
  app.get('/api/lives', (c) => c.json({ history: service.history() }))

  app.post('/api/lives', async (c) => {
    const body = await parseBody<{ originId?: string }>(c)
    if (!body.originId) throw new HttpError(400, 'missing_origin', '缺少 originId')
    return c.json(service.createLife(body.originId), 201)
  })

  app.get('/api/lives/active', (c) => {
    // 无活跃一世是常态：200 + null
    const life = service.getActiveLife()
    return c.json({
      life,
      event: life ? service.presentLifeEvent(life) : null,
      availableEndings: life ? service.availableEndings(life) : [],
    })
  })

  app.get('/api/lives/:id', (c) => {
    const life = service.getLife(c.req.param('id'))
    return c.json({
      life,
      event: life ? service.presentLifeEvent(life) : null,
      availableEndings: service.availableEndings(life),
    })
  })

  app.post('/api/lives/:id/act', async (c) => {
    const body = await parseBody<{
      requestId?: string
      clientVersion?: number
      act?: ActRequest
    }>(c)
    if (!body.requestId) throw new HttpError(400, 'missing_request_id', '缺少 requestId')
    if (typeof body.clientVersion !== 'number') throw new HttpError(400, 'missing_client_version', '缺少 clientVersion')
    if (!body.act || typeof body.act.kind !== 'string') throw new HttpError(400, 'missing_act', '缺少 act')
    return sseResponse(c, (send) =>
      service.submitAct(c.req.param('id'), body.requestId!, body.clientVersion!, body.act!, {
        onDelta: (text) => send('delta', { text }),
      })
    )
  })

  app.post('/api/lives/:id/battle/turn', async (c) => {
    const body = await parseBody<{
      requestId?: string
      clientVersion?: number
      command?: BattleCommand
    }>(c)
    if (!body.requestId) throw new HttpError(400, 'missing_request_id', '缺少 requestId')
    if (typeof body.clientVersion !== 'number') throw new HttpError(400, 'missing_client_version', '缺少 clientVersion')
    if (!body.command || typeof body.command.kind !== 'string') throw new HttpError(400, 'missing_command', '缺少 command')
    return sseResponse(c, (send) =>
      service.submitBattleTurn(
        c.req.param('id'),
        body.requestId!,
        body.clientVersion!,
        body.command!,
        { onDelta: (text) => send('delta', { text }) }
      )
    )
  })

  app.post('/api/lives/:id/characters/summarize', async (c) => {
    const body = await parseBody<{ requestId?: string; clientVersion?: number }>(c)
    if (!body.requestId || !Number.isInteger(body.clientVersion)) throw new HttpError(400, 'bad_request', '缺少请求标识或存档版本')
    return c.json(await service.summarizeCharacters(c.req.param('id'), body.requestId, body.clientVersion!))
  })

  app.post('/api/lives/:id/settle', (c) => c.json(service.settleReconcile(c.req.param('id'))))

  app.post('/api/lives/:id/memory/retry', async (c) =>
    c.json(await service.retryMemory(c.req.param('id')))
  )

  return app
}

/** SSE 流：delta / result / error */
function sseResponse<T>(
  c: { req: { param: (k: string) => string } },
  run: (send: (event: string, data: unknown) => void) => Promise<T>
): Response {
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
        const result = await run(send)
        send('result', result)
      } catch (e) {
        const he = e instanceof HttpError ? e : null
        if (!he) console.error('[sse]', e)
        send('error', { code: he?.code ?? 'internal', message: he?.message ?? '内部错误' })
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
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}

async function parseBody<T>(c: { req: { json: () => Promise<unknown> } }): Promise<T> {
  try {
    return (await c.req.json()) as T
  } catch {
    throw new HttpError(400, 'invalid_json', '请求体不是合法 JSON')
  }
}
