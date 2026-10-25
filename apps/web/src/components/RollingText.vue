<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ value: string | number; order?: number }>()
const direction = ref('roll-up')
watch(() => [props.value, props.order] as const, ([value, order], [before, oldOrder]) => {
  direction.value = (order ?? Number(value)) < (oldOrder ?? Number(before)) ? 'roll-down' : 'roll-up'
}, { flush: 'sync' })
</script>
<template>
  <span class="rolling-text" :aria-label="String(value)">
    <Transition :name="direction"><span :key="value" class="roll-cell" aria-hidden="true">{{ value }}</span></Transition>
  </span>
</template>
<style scoped>
.rolling-text { display: inline-grid; vertical-align: bottom; overflow: hidden; line-height: 1.4; position: relative; }
.roll-cell { grid-area: 1 / 1; white-space: nowrap; }
.roll-up-enter-active, .roll-up-leave-active, .roll-down-enter-active, .roll-down-leave-active { transition: transform .38s ease, opacity .38s ease; }
.roll-up-enter-from, .roll-down-leave-to { transform: translateY(100%); opacity: 0; }
.roll-up-leave-to, .roll-down-enter-from { transform: translateY(-100%); opacity: 0; }
@media(prefers-reduced-motion: reduce) { .roll-up-enter-active, .roll-up-leave-active, .roll-down-enter-active, .roll-down-leave-active { transition: none; } }
</style>
