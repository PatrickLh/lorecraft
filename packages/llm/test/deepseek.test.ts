import { describe, expect, it, vi } from 'vitest'
import { DeepSeekProvider } from '../src/deepseek.js'
describe('DeepSeek 结构化输出', () => {
  it('将嵌套 JSON Schema 放入请求，而不只要求返回任意 JSON', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"routes":[]}' } }], usage: {} }), { status: 200 }))
    try {
      const schema = { type: 'object', required: ['routes'], properties: { routes: { type: 'array', items: { type: 'object', required: ['stages'] } } } }
      const provider = new DeepSeekProvider({ apiKey: 'test', baseUrl: 'https://test.invalid', model: 'test' })
      await provider.generate({ system: '编写故事', turns: [{ role: 'user', content: '今天的故事' }], jsonSchema: schema, maxTokens: 100 })
      const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body))
      expect(body.messages[0].content).toContain(JSON.stringify(schema))
      expect(body.messages[0].content).toContain('编写故事')
      expect(body.response_format).toEqual({ type: 'json_object' })
    } finally { fetcher.mockRestore() }
  })
})
