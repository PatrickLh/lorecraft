import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig, loadDotEnv } from '../src/config.js'

const cleanupDirs: string[] = []
const prevCwd = process.cwd()

afterEach(() => {
  process.chdir(prevCwd)
  for (const dir of cleanupDirs) rmSync(dir, { recursive: true, force: true })
  delete process.env.__LC_TEST_KEY
})

describe('loadDotEnv', () => {
  it('从 cwd 向上查找并加载 .env；不覆盖已存在的环境变量；支持注释与引号', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'lc-env-'))
    cleanupDirs.push(tmp)
    // 在子目录中运行，验证向上查找
    const sub = join(tmp, 'a', 'b')
    mkdirSync(sub, { recursive: true })
    writeFileSync(
      join(tmp, '.env'),
      [
        '# 注释行',
        'LLM_PROVIDER=deepseek',
        'PORT=9999 # 行内注释',
        'QUOTED="abc # not comment"',
        '__LC_TEST_KEY=from_file',
      ].join('\n')
    )
    process.env.__LC_TEST_KEY = 'already_set'

    process.chdir(sub)
    const loaded = loadDotEnv()
    // macOS 上 /var 是 /private/var 的符号链接，cwd 会解析为物理路径
    expect(loaded).toBe(join(realpathSync(tmp), '.env'))
    expect(process.env.LLM_PROVIDER).toBe('deepseek')
    expect(process.env.PORT).toBe('9999')
    expect(process.env.QUOTED).toBe('abc # not comment')
    expect(process.env.__LC_TEST_KEY).toBe('already_set') // 已存在不覆盖
    delete process.env.LLM_PROVIDER
    delete process.env.PORT
    delete process.env.QUOTED
  })

  it('无 .env 时返回 null 且不改环境', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'lc-empty-'))
    cleanupDirs.push(tmp)
    process.chdir(tmp)
    expect(loadDotEnv()).toBeNull()
  })

  it('loadConfig 显式传参时不读 process.env', () => {
    const config = loadConfig({ LLM_PROVIDER: 'claude', PORT: '1234' })
    expect(config.provider).toBe('claude')
    expect(config.port).toBe(1234)
    const dflt = loadConfig({})
    expect(dflt.provider).toBe('mock')
    expect(dflt.port).toBe(8787)
  })
})
