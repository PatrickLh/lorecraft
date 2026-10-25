<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { state } from '../store.js'

const changes = ref<{ label: string; delta: number }[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
const snapshot = () => {
  const l = state.life
  return l ? { id: l.id, version: l.version, values: {
    气血: l.attrs.hp, 真气: l.attrs.mp, 武力: l.attrs.atk, 防御: l.attrs.def,
    智力: l.attrs.int, 敏捷: l.attrs.agi, 气血上限: l.attrs.maxHp,
    真气上限: l.attrs.maxMp, 银两: l.money, 温饱: l.food, 声望: l.rep,
  } } : null
}
watch(snapshot, (current, previous) => {
  if (!current || !previous || current.id !== previous.id || current.version === previous.version) return
  const next = Object.entries(current.values).map(([label, value]) => ({
    label, delta: value - previous.values[label as keyof typeof previous.values],
  })).filter(c => c.delta !== 0)
  if (!next.length) return
  clearTimeout(timer)
  changes.value = next
  timer = setTimeout(() => { changes.value = [] }, 2800)
})
onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <Transition name="stat-toast">
    <div v-if="changes.length" class="stat-changes" role="status" aria-live="polite">
      <div v-for="change in changes" :key="change.label" :class="change.delta > 0 ? 'gain' : 'loss'">
        {{ change.label }} {{ change.delta > 0 ? '+' : '' }}{{ change.delta }}
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.stat-changes { position: fixed; left: 50%; top: 45%; transform: translate(-50%, -50%); z-index: 90; pointer-events: none; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 18px; width: max-content; max-width: min(80vw, 480px); padding: 16px 22px; border: 1px solid #c5c7c3; border-radius: 16px; background: #fffffff2; box-shadow: 0 8px 32px #0002; font-size: clamp(18px, 3vw, 24px); font-weight: 700; }
.gain { color: #ac3030; }
.loss { color: #246c43; }
.stat-toast-enter-active, .stat-toast-leave-active { transition: opacity .3s, margin-top .3s; }
.stat-toast-enter-from { opacity: 0; margin-top: 16px; }
.stat-toast-leave-to { opacity: 0; margin-top: -16px; }
@media (prefers-reduced-motion: reduce) { .stat-toast-enter-active, .stat-toast-leave-active { transition: opacity .1s; } }
</style>
