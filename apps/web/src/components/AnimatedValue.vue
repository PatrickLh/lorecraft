<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
const props = defineProps<{ value: number }>()
const displayed = ref(props.value)
const change = ref(0)
const revision = ref(0)
let frame = 0
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => props.value, (value, previous) => {
  cancelAnimationFrame(frame)
  clearTimeout(timer)
  change.value = value - previous
  revision.value++
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) displayed.value = value
  else {
    const from = displayed.value
    const start = performance.now()
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / 450)
      displayed.value = Math.round(from + (value - from) * (1 - (1 - progress) ** 3))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
  }
  timer = setTimeout(() => { change.value = 0 }, 1800)
})
onUnmounted(() => { cancelAnimationFrame(frame); clearTimeout(timer) })
</script>

<template>
  <span class="animated-value" :class="{ 'value-changed': change !== 0 }">
    <span aria-hidden="true">{{ displayed }}</span>
    <span v-if="change" :key="revision" aria-hidden="true" class="value-delta" :class="change > 0 ? 'gain' : 'loss'">{{ change > 0 ? '↑ +' : '↓ ' }}{{ change }}</span>
    <span class="sr-only" aria-live="polite">{{ value }}{{ change ? `，${change > 0 ? '增加' : '减少'} ${Math.abs(change)}` : '' }}</span>
  </span>
</template>
