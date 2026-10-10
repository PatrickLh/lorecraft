/**
 * 从流式 JSON 增量中提取 "narrative" 字段的字符串内容（plan §2 流式输出）。
 * 容忍分片边界与转义序列；无法解析时安静地不产出增量（退化为完整结果展示）。
 */
export class NarrativeScanner {
  private buf = ''
  private i = 0
  private phase: 'seek' | 'string' | 'done' = 'seek'
  private escBuf: string | null = null
  private readonly ESCAPES: Record<string, string> = {
    n: '\n',
    t: '\t',
    r: '\r',
    '"': '"',
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
  }

  constructor(private readonly onDelta: (text: string) => void) {}

  feed(chunk: string): void {
    if (this.phase === 'done') return
    this.buf += chunk
    this.run()
  }

  private run(): void {
    while (this.i < this.buf.length && this.phase !== 'done') {
      if (this.phase === 'seek') {
        const keyIdx = this.buf.indexOf('"narrative"', Math.max(0, this.i - 1))
        if (keyIdx === -1) {
          // 保留尾部，避免键名被分片截断
          this.i = Math.max(0, this.buf.length - 16)
          return
        }
        let j = keyIdx + '"narrative"'.length
        while (j < this.buf.length && /\s/.test(this.buf[j] ?? '')) j++
        if (this.buf[j] !== ':') {
          this.i = j
          continue
        }
        j++
        while (j < this.buf.length && /\s/.test(this.buf[j] ?? '')) j++
        if (this.buf[j] !== '"') {
          this.i = j
          continue
        }
        this.i = j + 1
        this.phase = 'string'
      } else {
        while (this.i < this.buf.length) {
          const c = this.buf[this.i] as string
          if (this.escBuf !== null) {
            this.escBuf += c
            this.i++
            if (this.escBuf[0] === 'u') {
              if (this.escBuf.length < 5) continue
              const code = parseInt(this.escBuf.slice(1), 16)
              if (!Number.isNaN(code)) this.onDelta(String.fromCharCode(code))
            } else {
              this.onDelta(this.ESCAPES[this.escBuf] ?? '')
            }
            this.escBuf = null
            continue
          }
          if (c === '\\') {
            this.escBuf = ''
            this.i++
            continue
          }
          if (c === '"') {
            this.phase = 'done'
            this.i++
            return
          }
          this.onDelta(c)
          this.i++
        }
      }
    }
  }
}
