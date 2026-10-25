<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { api } from '../api.js'
import DailyEvents from '../components/DailyEvents.vue'
import { currentDailyScene } from '@lorecraft/core'
import {
  clearNotices,
  locationName,
  resync,
  retryMemory,
  state,
  submitAct,
} from '../store.js'

const input = ref('')
const dailyScene = computed(() => state.life ? currentDailyScene(state.life) : null)
const dailyMode = ref(localStorage.getItem('lorecraft-event-mode') !== 'legacy')
const visibleLog = computed(() => state.log.filter((entry, index) => !(dailyMode.value && index === state.log.length - 1 && entry.kind === 'narrative' && entry.text === dailyScene.value?.text)))
watch(dailyMode, value => localStorage.setItem('lorecraft-event-mode', value ? 'daily' : 'legacy'))
const exploration = ref<HTMLDialogElement | null>(null)
const opportunities = ref<{ id: string; title: string; text: string }[]>([])
const exploring = ref(false)
const explorationError = ref('')
async function openExploration(): Promise<void> {
  exploration.value?.showModal()
  opportunities.value = []; explorationError.value = ''; exploring.value = true
  try { if (state.life) opportunities.value = (await api.getOpportunities(state.life.id)).events }
  catch (error) { explorationError.value = error instanceof Error ? error.message : '暂时无法查看机缘' }
  finally { exploring.value = false }
}
function explore(act: Record<string, unknown>, label: string): void {
  exploration.value?.close()
  void submitAct(act, label)
}

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
  () => [state.log.length, state.log.at(-1)?.text, dailyScene.value?.title, state.life?.slot],
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
  <div class="life-grid" :class="{ 'daily-layout': dailyMode }">
    <section class="card main-pane">
      <div ref="logPane" class="log" @scroll="onScroll">
        <div v-for="entry in visibleLog" :key="entry.id" :class="['entry', entry.kind]">
          <span v-if="entry.kind === 'player'" class="player-line">❯ {{ entry.text }}</span>
          <span v-else-if="entry.kind === 'system'" class="system-line">{{ entry.text }}</span>
          <span v-else-if="entry.kind === 'battle'" class="battle-line">{{ entry.text }}</span>
          <template v-else>
            {{ entry.text }}<span v-if="entry.pending" class="cursor">▍</span>
          </template>
        </div>
        <article v-if="dailyMode && dailyScene && !state.pendingEvent" class="current-daily-scene"><h3>{{ dailyScene.title }}</h3><p>{{ dailyScene.text }}</p></article>
      </div>

      <div v-if="!dailyMode && state.ui === 'degraded'" class="notice">
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
      <div v-if="state.pendingEvent" role="region" aria-label="事件抉择" :key="state.pendingEvent.title + state.pendingEvent.text" class="card event-panel">
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
      <DailyEvents v-if="dailyMode && !state.pendingEvent" />
      <div v-if="!state.pendingEvent && endingOptions.length > 0" class="endings">
        <span class="dim">心头忽然浮起一个念头：</span>
        <button v-for="e in endingOptions" :key="e.id" class="suggestion" :disabled="busy" @click="chooseEnding(e.id, e.name)">
          {{ e.name }}
        </button>
      </div>

      <!-- 建议行动 -->
      <div class="suggestions" role="group" aria-label="推荐行动" v-if="!dailyMode && state.suggestions.length > 0 && !state.pendingEvent">
        <button v-for="sg in state.suggestions" :key="sg" class="suggestion" :disabled="busy" @click="sendFree(sg)">
          {{ sg }}
        </button>
      </div>

      <div v-if="!dailyMode" class="input-row">
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
      <p v-if="!dailyMode" class="dim hint">每行动消耗一个时辰（一日四时辰：晨/午/昏/夜）；「住店」「过一日」快进时间。</p>
      <div class="event-mode-switch"><span class="dim">{{ dailyMode ? '每日事件体验版 · 自由输入暂关闭' : '原有逐轮生成模式' }}</span><button :disabled="busy" @click="dailyMode = !dailyMode">{{ dailyMode ? '切回逐轮生成' : '试用每日事件' }}</button></div>
    </section>

    <aside v-if="!dailyMode" class="card side-pane" :class="{ collapsed: !actionsOpen }">
      <div class="exploration-toolbar"><button :disabled="actionBusy" @click="openExploration">附近机缘</button>
      <button class="actions-toggle" :aria-expanded="actionsOpen" aria-controls="quick-actions" @click="actionsOpen = !actionsOpen">快捷行动 <span>{{ actionsOpen ? '收起 −' : '展开 +' }}</span></button></div>
      <div v-if="actionsOpen" id="quick-actions" class="action-grid">
        <button v-for="a in availableActions" :key="a.id" :disabled="actionBusy" @click="doAction(a.id, a.label)">
          {{ a.label }}
        </button>
      </div>
      <p v-if="(state.metaInfo?.openMemoryTaskCount ?? 0) > 0" style="margin-top: 10px">
        <button @click="retryMemory">记忆待提炼，点击重试</button>
      </p>
    </aside>
    <dialog ref="exploration" class="journal-dialog" aria-labelledby="exploration-title" @click="($event.target === exploration) && exploration?.close()">
      <div class="journal-heading"><h2 id="exploration-title">附近机缘</h2><button aria-label="关闭附近机缘" @click="exploration?.close()">关闭 ×</button></div>
      <p class="dim">当前地点：{{ locationName(state.life?.locationId ?? '') }}。选择机缘进入抉择，奖励由后续选项结算。</p>
      <p v-if="exploring" role="status">正在寻访……</p>
      <p v-else-if="explorationError" role="alert">{{ explorationError }}</p>
      <p v-else-if="!opportunities.length" class="dim">此刻暂无符合条件的机缘。可换个地点寻访，或稍后再来。</p>
      <div v-else class="opportunity-list">
        <article v-for="event in opportunities" :key="event.id" class="person-detail"><h3>{{ event.title }}</h3><p>{{ event.text }}</p><button class="primary" :disabled="actionBusy" @click="explore({ kind: 'seek_event', eventId: event.id }, `寻找机缘：${event.title}`)">进入事件</button></article>
      </div>
      <h3>前往其他地点</h3><p class="dim">移动消耗一个时辰；自由输入「去坊市」「去码头」也可以实际移动。</p>
      <div class="travel-options"><button v-for="location in state.catalog?.locations" :key="location.id" :disabled="actionBusy || location.id === state.life?.locationId" @click="explore({ kind: 'travel', locationId: location.id }, `前往${location.name}`)">{{ location.name }}{{ location.id === state.life?.locationId ? ' · 当前' : '' }}</button></div>
    </dialog>
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
