<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { state, submitAct } from '../store.js'
import { currentDailyScene, type DailyActivity } from '@lorecraft/core'

const busy = computed(() => state.ui !== 'idle' && state.ui !== 'degraded')
const plan = computed(() => state.life?.dailyPlan?.day === state.life?.day ? state.life?.dailyPlan : null)
const offset = computed(() => state.life && plan.value ? state.life.slot - plan.value.startSlot : 0)
const choices = computed(() => state.life ? currentDailyScene(state.life)?.choices ?? [] : [])
const ruleText: Record<DailyActivity, string> = {
  work: '工钱 +3 两 · 温饱 +3', meal: '花费 1 两 · 温饱 +4', train: '有机会武力 +1', rest: '气血 +3 · 真气 +2', investigate: '观察线索 · 无物资收益',
}
const attempted = new Set<string>()
async function prepare(retry = false) { await submitAct({ kind: 'daily_prepare', retry }, retry ? '重新展开今日故事' : '展开今日事件') }
watch(() => [state.life?.id, state.life?.day, state.ui, !!state.pendingEvent], async () => {
  const l = state.life
  if (!l || l.phase !== 'alive' || state.pendingEvent || busy.value || plan.value) return
  const key = `${l.id}:${l.day}`
  if (attempted.has(key)) return
  attempted.add(key)
  await nextTick()
  if (!busy.value && !plan.value && !state.pendingEvent) await prepare()
}, { immediate: true })
function choose(index: number) {
  if (!plan.value || !state.life || busy.value) return
  void submitAct({ kind: 'daily_choose', planId: plan.value.id, slot: state.life.slot, index }, choices.value[index]?.label ?? '事件选择')
}
</script>

<template>
  <section class="daily-panel" aria-label="每日事件选择">
    <div class="daily-heading"><h3>你的选择</h3><span class="dim">选择下一步</span></div>
    <template v-if="plan">
      <div v-if="plan.source === 'fallback'" class="fallback-note"><span>当前使用本地故事。</span><button v-if="offset === 0 && plan.selectedRoute === null" :disabled="busy" @click="prepare(true)">重试生成今日故事</button><details v-if="plan.generationError"><summary>生成状态</summary>{{ plan.generationError }}</details></div>
      <div class="daily-choices">
        <button v-for="(choice, index) in choices" :key="`${plan.id}:${state.life?.slot}:${index}`" :disabled="busy || (choice.activity === 'meal' && (state.life?.money ?? 0) < 1)" @click="choose(index)">
          <strong><span class="choice-index">{{ ['壹', '贰', '叁'][index] }}</span>{{ choice.label }}</strong>
          <small>{{ ruleText[choice.activity] }}{{ choice.activity === 'meal' && (state.life?.money ?? 0) < 1 ? ' · 银两不足' : '' }}</small>
        </button>
      </div>
    </template>
    <div v-else class="daily-loading"><p>{{ busy ? '正在铺陈今日的江湖与分支……' : '准备当前时辰至夜晚的事件；已有经历会用于衔接剧情。' }}</p><button v-if="!busy" class="primary" @click="prepare()">生成今日事件</button></div>
  </section>
</template>

<style scoped>
.daily-panel { border-top: 1px solid var(--line, #ccc); padding-top: 8px; flex-shrink: 0; max-height: 30dvh; overflow: auto; overscroll-behavior: contain; }
.daily-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.daily-heading h3 { margin: 0; }
.daily-choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.daily-choices button { text-align: left; padding: 9px 12px; border-radius: 12px; white-space: normal; background: #fafbf8; color: #252b27; min-height: 64px; }
.daily-choices button:hover:not(:disabled) { background: #e9ece6; }
.daily-choices strong, .daily-choices small { display: block; line-height: 1.6; }
.daily-choices small { color: #555e56; font-size: 12px; margin-top: 7px; }
.choice-index { margin-right: 8px; color: #687267; }
.daily-loading { padding: 10px 0; }
@media(max-width: 600px) { .daily-heading h3 { font-size: 17px; } .daily-heading .dim { font-size: 11px; } .daily-choices { grid-template-columns: 1fr; gap: 6px; margin-top: 8px; } .daily-choices button { padding: 8px 12px; min-height: auto; } .daily-choices small { margin-top: 2px; } }
</style>

<style scoped>
.fallback-note { display: flex; gap: 6px 12px; flex-wrap: wrap; align-items: center; font-size: 11px; margin: 4px 0; color: #595f59; }
.fallback-note button { padding: 2px 8px; font-size: 11px; }
.fallback-note details { max-width: 100%; overflow-wrap: anywhere; }
@media(max-width:600px) { .daily-heading { display: none; } .daily-choices { margin-top: 0; gap: 4px; } .daily-choices button { padding: 5px 10px; } .daily-choices strong { font-size: 13px; } .daily-choices small { font-size: 10px; } }
</style>
