import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMetaState, createRunState, enterWorld, type RunState } from '@lorecraft/core'
import { WORLDS } from '@lorecraft/worlddata'
import { ClaudeProvider } from '../src/claude.js'
import { DeepSeekProvider } from '../src/deepseek.js'
import { runTurnAttempt } from '../src/executor.js'
import { extractMemories, mergeMemoriesLlm, summarizeHistory } from '../src/memory-run.js'
import { MockProvider } from '../src/mock.js'
import { NarrativeScanner } from '../src/stream-scan.js'
import { buildTurnPrompt } from '../src/prompts.js'

const world = WORLDS[0]!
const NOW = '2026-01-01T00:00:00Z'
const genId = () => crypto.randomUUID()

function inWorldRun(): RunState {
  const run = createRunState('run-t', 60, NOW)
  const res = enterWorld(run, world, { unlocked: true })
  if (!res.ok) throw new Error(res.error)
  return res.run
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NarrativeScanner（流式 narrative 提取）', () => {
  it('跨分片与转义序列', () => {
    const out: string[] = []
    const s = new NarrativeScanner((t) => out.push(t))
    const full = JSON.stringify({ narrative: '夜色\n深沉，"规则"贴在A墙上。', stateChanges: {} })
    for (let i = 0; i < full.length; i += 3) {
      s.feed(full.slice(i, i + 3))
    }
    expect(out.join('')).toBe('夜色\n深沉，"规则"贴在A墙上。')
  })

  it('narrative 前的其它字段不产生增量', () => {
    const out: string[] = []
    const s = new NarrativeScanner((t) => out.push(t))
    s.feed('{"suggestedActions":["看"],"narrative":"正文"}')
    expect(out.join('')).toBe('正文')
  })
})

describe('MockProvider 命令协议', () => {
  it('默认输入产生普通叙事', async () => {
    const mock = new MockProvider()
    const run = inWorldRun()
    const res = await runTurnAttempt({
      provider: mock,
      world,
      run,
      meta: createMetaState(NOW),
      playerInput: '看看四周',
      timeoutMs: 1000,
    })
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.decl.narrative).toContain('看看四周')
    expect(res.decl.suggestedActions).toHaveLength(2)
  })

  it('/flag 命令申报 flag，通过校验', async () => {
    const mock = new MockProvider()
    const run = inWorldRun()
    const res = await runTurnAttempt({
      provider: mock,
      world,
      run,
      meta: createMetaState(NOW),
      playerInput: '/flag read_ruleboard',
      timeoutMs: 1000,
    })
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.decl.flagsAchieved).toEqual(['read_ruleboard'])
  })

  it('非法 flag：先重试（仍坏）后降级', async () => {
    const mock = new MockProvider()
    const run = inWorldRun()
    const res = await runTurnAttempt({
      provider: mock,
      world,
      run,
      meta: createMetaState(NOW),
      playerInput: '/bad-flag',
      timeoutMs: 1000,
    })
    // /bad-flag 每次都返回非法 flag，重试预算 1 次后降级
    expect(res.kind).toBe('degraded')
    if (res.kind !== 'degraded') return
    expect(res.retried).toBe(true)
    expect(res.reason).toContain('whitelist')
  })

  it('脚本注入：先坏 JSON 后好 JSON，重试成功（retried=true）', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'raw', text: '{"narrative": "截断的' })
    mock.push({
      type: 'raw',
      text: JSON.stringify({ narrative: '四周如常。', suggestedActions: ['观察四周'] }),
    })
    const res = await runTurnAttempt({
      provider: mock,
      world,
      run: inWorldRun(),
      meta: createMetaState(NOW),
      playerInput: '走',
      timeoutMs: 1000,
    })
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.retried).toBe(true)
  })

  it('超时错误：不消耗重试预算，立即降级', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'error', kind: 'timeout', message: '超时' })
    const res = await runTurnAttempt({
      provider: mock,
      world,
      run: inWorldRun(),
      meta: createMetaState(NOW),
      playerInput: '走',
      timeoutMs: 1000,
    })
    expect(res.kind).toBe('degraded')
    if (res.kind !== 'degraded') return
    expect(res.retried).toBe(false)
    expect(res.reason).toContain('timeout')
    expect(mock.pending).toBe(0) // 没有第二次调用
  })

  it('可恢复网络错误：重试一次后成功', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'error', kind: 'network', message: '连接重置' })
    mock.push({
      type: 'raw',
      text: JSON.stringify({ narrative: '恢复后成功。' }),
    })
    const res = await runTurnAttempt({
      provider: mock,
      world,
      run: inWorldRun(),
      meta: createMetaState(NOW),
      playerInput: '走',
      timeoutMs: 1000,
    })
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.retried).toBe(true)
  })

  it('流式：只透出可解析的 narrative 文本增量（不含原始 JSON 结构）', async () => {
    const mock = new MockProvider()
    const deltas: string[] = []
    await runTurnAttempt({
      provider: mock,
      world,
      run: inWorldRun(),
      meta: createMetaState(NOW),
      playerInput: '看',
      timeoutMs: 1000,
      onNarrativeDelta: (t) => deltas.push(t),
    })
    const joined = deltas.join('')
    expect(joined).toContain('（mock 演绎）')
    expect(joined).not.toContain('"narrative"')
    expect(joined).not.toContain('{')
  })

  it('继承记忆注入 prompt（验收：继承可感知）', () => {
    const meta = createMetaState(NOW)
    meta.memories = [
      { id: 'm1', text: '便利店的第三条规则是假的', source: 'bianlidian', createdAt: NOW },
    ]
    const prompt = buildTurnPrompt({ world, run: inWorldRun(), meta, playerInput: '看向冷柜' })
    const user = prompt.turns[0]?.content ?? ''
    expect(user).toContain('【继承记忆')
    expect(user).toContain('便利店的第三条规则是假的')
  })
})

describe('prompt 构建（plan P3）', () => {
  it('包含世界规则、当前幕、可达 flag、权威状态与玩家输入；不含前置未满足的 flag', () => {
    const run = inWorldRun()
    const prompt = buildTurnPrompt({
      world,
      run,
      meta: createMetaState(NOW),
      playerInput: '查看货架',
    })
    expect(prompt.system).toContain('JSON Schema')
    const user = prompt.turns[0]?.content ?? ''
    expect(user).toContain('【世界规则】')
    expect(user).toContain('第一幕')
    expect(user).toContain('【权威状态')
    expect(user).toContain('查看货架')
    // no_shadow_customer 需要 read_ruleboard 前置，不可直接申报
    expect(user).not.toContain('- no_shadow_customer')
    expect(user).toContain('- read_ruleboard:')
    expect(user).toContain('【通关所需 flag（本局主目标）】')
  })
})

describe('记忆提炼 / 合并 / 摘要（plan P3）', () => {
  it('extractMemories：清洗去重（schema 已限 5 条 × 50 字 × 非空）', async () => {
    const mock = new MockProvider()
    mock.push({
      type: 'raw',
      text: JSON.stringify({
        memories: [
          '便利店的第三条规则是假的',
          '店长只在凌晨三点出现',
          '便利店的第三条规则是假的',
        ],
      }),
    })
    const res = await extractMemories(mock, { sourceTitle: '测试', sourceText: '经历', timeoutMs: 1000 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value).toEqual(['便利店的第三条规则是假的', '店长只在凌晨三点出现'])
  })

  it('extractMemories：坏输出返回 ok:false', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'raw', text: 'not json' })
    const res = await extractMemories(mock, { sourceTitle: '测试', sourceText: '经历', timeoutMs: 1000 })
    expect(res.ok).toBe(false)
  })

  it('mergeMemoriesLlm：失败返回 ok:false（调用方走 fallbackMerge）', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'raw', text: '{"memories": []}' })
    const res = await mergeMemoriesLlm(mock, { memories: ['a', 'b'], maxTotal: 2, timeoutMs: 1000 })
    expect(res.ok).toBe(false)
  })

  it('summarizeHistory：成功与失败', async () => {
    const mock = new MockProvider()
    mock.push({ type: 'raw', text: JSON.stringify({ summary: '主角检查了货架，平安度过最初一小时。' }) })
    const ok = await summarizeHistory(mock, {
      existingSummary: null,
      turns: [{ turn: 1, playerInput: '看', narrative: '看了' }],
      timeoutMs: 1000,
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value).toContain('货架')

    const bad = new MockProvider()
    bad.push({ type: 'raw', text: 'oops' })
    const fail = await summarizeHistory(bad, {
      existingSummary: null,
      turns: [{ turn: 1, playerInput: '看', narrative: '看了' }],
      timeoutMs: 1000,
    })
    expect(fail.ok).toBe(false)
  })
})

// ---- 真实 provider 契约（fetch stub） ----

function jsonRes(obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('DeepSeekProvider 契约（结构化输出）', () => {
  it('非流式：json_object + prompt schema；解析 content', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} })
        return jsonRes({
          choices: [{ message: { content: '{"narrative":"ok"}' } }],
          usage: { prompt_tokens: 11, completion_tokens: 7 },
        })
      }
    )
    const p = new DeepSeekProvider({ apiKey: 'k', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' })
    const res = await p.generate({
      system: 's',
      turns: [{ role: 'user', content: 'u' }],
      jsonSchema: { type: 'object' },
      maxTokens: 100,
    })
    expect(res.text).toBe('{"narrative":"ok"}')
    expect(res.usage).toEqual({ promptTokens: 11, completionTokens: 7 })
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>
    expect(calls[0]?.url).toBe('https://api.deepseek.com/chat/completions')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.model).toBe('deepseek-chat')
  })

  it('流式：解析 SSE data: 行并聚合 content', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"{\\"narr"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"ative\\":\\"hi\\"}"}}]}',
      '',
      'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":4}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')
    vi.stubGlobal('fetch', async () => new Response(sse, { status: 200 }))
    const p = new DeepSeekProvider({ apiKey: 'k', baseUrl: 'https://x', model: 'm' })
    const deltas: string[] = []
    const res = await p.generate(
      { system: 's', turns: [{ role: 'user', content: 'u' }], maxTokens: 10 },
      { onDelta: (t) => deltas.push(t) }
    )
    expect(JSON.parse(res.text)).toEqual({ narrative: 'hi' })
    expect(deltas.join('')).toBe(res.text)
    expect(res.usage).toEqual({ promptTokens: 3, completionTokens: 4 })
  })

  it('HTTP 500 可恢复，401 不可恢复', async () => {
    const p = new DeepSeekProvider({ apiKey: 'k', baseUrl: 'https://x', model: 'm' })
    vi.stubGlobal('fetch', async () => new Response('boom', { status: 500 }))
    await expect(p.generate({ system: 's', turns: [], maxTokens: 1 })).rejects.toMatchObject({
      recoverable: true,
    })
    vi.stubGlobal('fetch', async () => new Response('no', { status: 401 }))
    await expect(p.generate({ system: 's', turns: [], maxTokens: 1 })).rejects.toMatchObject({
      recoverable: false,
      kind: 'http',
    })
  })
})

describe('ClaudeProvider 契约（工具调用结构化输出）', () => {
  it('非流式：强制工具选择；从 tool_use 块提取输入', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return jsonRes({
        content: [{ type: 'tool_use', name: 'turn_output', input: { narrative: 'cl' } }],
        usage: { input_tokens: 9, output_tokens: 5 },
      })
    })
    const p = new ClaudeProvider({ apiKey: 'k', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5' })
    const res = await p.generate({
      system: 's',
      turns: [{ role: 'user', content: 'u' }],
      jsonSchema: { type: 'object' },
      toolName: 'turn_output',
      maxTokens: 100,
    })
    expect(JSON.parse(res.text)).toEqual({ narrative: 'cl' })
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages')
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'turn_output' })
    expect((res as { text: string }).text).toBeTruthy()
  })

  it('流式：聚合 input_json_delta', async () => {
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":8}}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"narrative\\":"}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"\\"x\\"}"}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","usage":{"output_tokens":6}}',
      '',
    ].join('\n')
    vi.stubGlobal('fetch', async () => new Response(sse, { status: 200 }))
    const p = new ClaudeProvider({ apiKey: 'k', baseUrl: 'https://x', model: 'm' })
    const res = await p.generate(
      { system: 's', turns: [{ role: 'user', content: 'u' }], maxTokens: 10 },
      { onDelta: () => {} }
    )
    expect(JSON.parse(res.text)).toEqual({ narrative: 'x' })
    expect(res.usage).toEqual({ promptTokens: 8, completionTokens: 6 })
  })
})
