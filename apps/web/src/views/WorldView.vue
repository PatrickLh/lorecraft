<script setup lang="ts">
import { computed, ref } from 'vue'
import { currentWorldCard, resync, state, submit } from '../store.js'

const input = ref('')

const run = computed(() => state.run)
const visit = computed(() => run.value?.visit ?? null)
const card = computed(() => currentWorldCard())
const lifespanPct = computed(() => {
  const r = run.value
  if (!r || r.capSnapshot === 0) return 0
  return Math.round((r.lifespan / r.capSnapshot) * 100)
})
const busy = computed(() => state.ui !== 'idle')

const UI_LABEL: Record<string, string> = {
  idle: '',
  waiting: '等待判定……',
  streaming: '叙事进行中（暂存）……',
  degraded: '本回合为环境回合（LLM 输出未通过校验，状态未变更）',
  connection_lost: '连接中断——正在以服务器记录为准恢复',
}

function attrLine(label: string, v: number | undefined): string {
  return `${label} ${v ?? '—'}`
}

function send(text?: string): void {
  const value = (text ?? input.value).trim()
  if (!value || busy.value) return
  input.value = ''
  void submit(value)
}
</script>

<template>
  <div class="world-grid">
    <section class="card main-pane">
      <div class="world-head">
        <strong>《{{ card?.title }}》</strong>
        <span class="tag">第 {{ (visit?.actIndex ?? 0) + 1 }} 幕</span>
        <span class="tag">第 {{ run?.turn }} 回合</span>
      </div>

      <div ref="logPane" class="log">
        <div v-for="entry in state.log" :key="entry.id" :class="['entry', entry.kind]">
          <span v-if="entry.kind === 'player'" class="player-line">❯ {{ entry.text }}</span>
          <span v-else-if="entry.kind === 'system'" class="system-line">{{ entry.text }}</span>
          <template v-else>
            {{ entry.text }}<span v-if="entry.pending" class="cursor">▍</span>
          </template>
        </div>
      </div>

      <div v-if="state.ui === 'degraded'" class="notice">
        时空扰动：{{ state.lastDegradedReason ?? 'LLM 输出未通过校验' }}。本回合状态未变更。
      </div>
      <div v-if="state.ui === 'connection_lost'" class="notice bad">
        {{ UI_LABEL.connection_lost }}
        <button style="margin-left: 12px" @click="resync">重新同步</button>
      </div>
      <div v-if="state.ui === 'waiting' || state.ui === 'streaming'" class="dim pulsing">
        {{ UI_LABEL[state.ui] }}
      </div>

      <div class="suggestions" v-if="state.suggestions.length > 0">
        <button
          v-for="s in state.suggestions"
          :key="s"
          class="suggestion"
          :disabled="busy"
          @click="send(s)"
        >
          {{ s }}
        </button>
      </div>

      <div class="input-row">
        <input
          v-model="input"
          type="text"
          placeholder="你要做什么？（自由输入，回车提交）"
          maxlength="500"
          :disabled="busy"
          @keydown.enter="send()"
        />
        <button class="primary" :disabled="busy || !input.trim()" @click="send()">
          {{ busy ? '……' : '行动' }}
        </button>
      </div>
      <p class="dim hint">每回合消耗 1 点寿命。行动一旦提交不可撤回；连接中断后会自动向服务器查询结果。</p>
    </section>

    <aside class="card side-pane">
      <h3>寿命</h3>
      <div class="life-bar">
        <div class="life-fill" :style="{ width: lifespanPct + '%' }"></div>
      </div>
      <p>{{ run?.lifespan }} / {{ run?.capSnapshot }}</p>

      <h3>属性</h3>
      <p>
        {{ attrLine('体质', run?.attrs.con) }} ｜
        {{ attrLine('心智', run?.attrs.mind) }} ｜
        {{ attrLine('敏捷', run?.attrs.agi) }}
      </p>

      <h3>状态标记</h3>
      <p v-if="(run?.statusTags.length ?? 0) === 0" class="dim">无</p>
      <p v-else>
        <span v-for="t in run?.statusTags ?? []" :key="t" class="tag warn">{{ t }}</span>
      </p>

      <h3>物品</h3>
      <p v-if="(run?.items.length ?? 0) === 0" class="dim">空空如也</p>
      <ul v-else class="item-list">
        <li v-for="i in run?.items ?? []" :key="i.id">
          <strong>{{ i.name }}</strong>
          <span v-if="i.desc" class="dim">（{{ i.desc }}）</span>
        </li>
      </ul>
    </aside>
  </div>
</template>

<style scoped>
.world-grid {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 16px;
  align-items: start;
}
@media (max-width: 800px) {
  .world-grid {
    grid-template-columns: 1fr;
  }
}
.world-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.log {
  min-height: 320px;
  max-height: 55vh;
  overflow-y: auto;
  padding-right: 6px;
}
.entry {
  margin-bottom: 14px;
  white-space: pre-wrap;
}
.entry.player {
  color: var(--accent);
  font-weight: 600;
}
.entry.system {
  color: var(--text-dim);
  text-align: center;
  letter-spacing: 0.2em;
}
.cursor {
  animation: blink 1s steps(1) infinite;
  color: var(--accent);
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.pulsing {
  margin: 8px 0;
}
.suggestions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}
.suggestion {
  font-size: 13px;
  padding: 5px 12px;
  border-radius: 999px;
}
.input-row {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.hint {
  margin: 8px 0 0;
  font-size: 12px;
}
.life-bar {
  height: 10px;
  background: var(--bg-soft);
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.life-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--danger), var(--accent));
  transition: width 0.4s;
}
.side-pane h3 {
  margin: 14px 0 6px;
  font-size: 14px;
  color: var(--text-dim);
}
.side-pane h3:first-child {
  margin-top: 0;
}
.side-pane p {
  margin: 0;
  font-size: 14px;
}
.item-list {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
}
</style>
