<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  clearNotices,
  resync,
  retryMemory,
  state,
  submitAct,
} from '../store.js'

const input = ref('')
const wideLayout = window.matchMedia('(min-width: 861px)')
const actionsOpen = ref(wideLayout.matches)
const adaptActions = (event: MediaQueryListEvent) => { actionsOpen.value = event.matches }
const logPane = ref<HTMLElement | null>(null)
const stick = ref(true)

const busy = computed(() => state.ui !== 'idle' && state.ui !== 'degraded')
const actionBusy = computed(() => busy.value || !!state.pendingEvent)
const endingOptions = computed(() => state.availableEndings)
const availableActions = computed(() => state.catalog?.actions ?? [])

watch(
  () => [state.log.length, state.log.at(-1)?.text],
  async () => {
    if (!stick.value) return
    await nextTick()
    logPane.value?.scrollTo({ top: logPane.value.scrollHeight })
  }
)
onMounted(() => {
  wideLayout.addEventListener('change', adaptActions)
  logPane.value?.scrollTo({ top: logPane.value.scrollHeight })
})
onUnmounted(() => { wideLayout.removeEventListener('change', adaptActions) })
function onScroll(): void {
  const el = logPane.value
  if (!el) return
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

function doAction(id: string, label: string): void {
  clearNotices()
  void submitAct({ kind: 'action', actionId: id }, label)
}
function chooseEvent(index: number, label: string): void {
  clearNotices()
  void submitAct({ kind: 'event_choice', index }, label)
}
function chooseEnding(id: string, name: string): void {
  clearNotices()
  void submitAct({ kind: 'ending', endingId: id }, `【抉择】${name}`)
}
function sendFree(text?: string): void {
  const value = (text ?? input.value).trim()
  if (!value || actionBusy.value) return
  input.value = ''
  void submitAct({ kind: 'free', input: value }, value)
}
</script>

<template>
  <div class="life-grid">
    <section class="card main-pane">
      <div ref="logPane" class="log" @scroll="onScroll">
        <div v-for="entry in state.log" :key="entry.id" :class="['entry', entry.kind]">
          <span v-if="entry.kind === 'player'" class="player-line">❯ {{ entry.text }}</span>
          <span v-else-if="entry.kind === 'system'" class="system-line">{{ entry.text }}</span>
          <span v-else-if="entry.kind === 'battle'" class="battle-line">{{ entry.text }}</span>
          <template v-else>
            {{ entry.text }}<span v-if="entry.pending" class="cursor">▍</span>
          </template>
        </div>
      </div>

      <div v-if="state.ui === 'degraded'" class="notice">
        时空扰动：{{ state.lastDegradedReason ?? '演绎未通过校验' }}。本段行动无果。
      </div>
      <div v-if="state.ui === 'connection_lost'" class="notice bad">
        连接中断——正在以服务器记录为准恢复。
        <button style="margin-left: 12px" @click="resync">重新同步</button>
      </div>
      <div v-if="state.ui === 'waiting' || state.ui === 'streaming'" class="dim pulsing">
        {{ state.ui === 'streaming' ? '叙事进行中（暂存）……' : '等待判定……' }}
      </div>

      <!-- 待抉择事件 -->
      <div v-if="state.pendingEvent" :key="state.pendingEvent.title + state.pendingEvent.text" class="card event-panel">
        <h3>【{{ state.pendingEvent.title }}】</h3>
        <p class="event-text">{{ state.pendingEvent.text }}</p>
        <div class="choices">
          <button
            v-for="c in state.pendingEvent.choices"
            :key="c.index"
            class="primary"
            :disabled="busy"
            @click="chooseEvent(c.index, c.label)"
          >
            {{ c.label }}
          </button>
        </div>
      </div>

      <!-- 特殊行动：选择型结局 -->
      <div v-if="!state.pendingEvent && endingOptions.length > 0" class="endings">
        <span class="dim">心头忽然浮起一个念头：</span>
        <button v-for="e in endingOptions" :key="e.id" class="suggestion" :disabled="busy" @click="chooseEnding(e.id, e.name)">
          {{ e.name }}
        </button>
      </div>

      <!-- 建议行动 -->
      <div class="suggestions" role="group" aria-label="推荐行动" v-if="state.suggestions.length > 0 && !state.pendingEvent">
        <button v-for="sg in state.suggestions" :key="sg" class="suggestion" :disabled="busy" @click="sendFree(sg)">
          {{ sg }}
        </button>
      </div>

      <div class="input-row">
        <input
          v-model="input"
          type="text"
          placeholder="你要做什么？（自由输入，回车提交）"
          maxlength="500"
          :disabled="actionBusy"
          @keydown.enter="sendFree()"
        />
        <button class="primary" :disabled="actionBusy || !input.trim()" @click="sendFree()">
          {{ busy ? '……' : '行动' }}
        </button>
      </div>
      <p class="dim hint">每行动消耗一个时辰（一日四时辰：晨/午/昏/夜）；「住店」「过一日」快进时间。</p>
    </section>

    <aside class="card side-pane" :class="{ collapsed: !actionsOpen }">
      <button class="actions-toggle" :aria-expanded="actionsOpen" aria-controls="quick-actions" @click="actionsOpen = !actionsOpen">快捷行动 <span>{{ actionsOpen ? '收起 −' : '展开 +' }}</span></button>
      <div v-if="actionsOpen" id="quick-actions" class="action-grid">
        <button v-for="a in availableActions" :key="a.id" :disabled="actionBusy" @click="doAction(a.id, a.label)">
          {{ a.label }}
        </button>
      </div>
      <p v-if="(state.metaInfo?.openMemoryTaskCount ?? 0) > 0" style="margin-top: 10px">
        <button @click="retryMemory">记忆待提炼，点击重试</button>
      </p>
    </aside>
  </div>
</template>

<style scoped>
.life-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 16px;
  align-items: start;
}
@media (max-width: 860px) {
  .life-grid {
    grid-template-columns: 1fr;
  }
}
.log {
  min-height: 280px;
  flex: 1;
  max-height: none;
  overflow-y: auto;
  padding-right: 6px;
}
.entry {
  margin-bottom: 12px;
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
.entry.battle {
  color: var(--danger);
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
.event-panel {
  margin-top: 12px;
  border-color: var(--accent);
}
.event-panel h3 {
  margin: 0 0 6px;
  color: var(--accent);
}
.event-text {
  font-size: 15px;
}
.choices {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.suggestions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}
.suggestion {
  font-size: 14px;
  padding: 5px 12px;
  border-radius: 999px;
}
.endings {
  margin: 10px 0;
}
.input-row {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.hint {
  margin: 8px 0 0;
  font-size: 14px;
}
.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.action-grid button {
  font-size: 14px;
  padding: 6px 4px;
}
</style>
