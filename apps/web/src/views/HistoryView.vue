<script setup lang="ts">
import { computed } from 'vue'
import { END_CAUSE_TEXT } from '../types.js'
import { martialName, originName, state, toggleHistory, openLatestEnding } from '../store.js'

const history = computed(() => state.history)

function endText(h: { endType: string; endingId: string | null; deathCause: string | null }): string {
  if (h.endType === 'ending') return `结局 · ${h.endingId ?? '?'}`
  return END_CAUSE_TEXT[h.deathCause ?? ''] ?? '死于非命'
}
</script>

<template>
  <div>
    <div class="head">
      <h2>轮回历史</h2>
      <button v-if="history.length" :disabled="state.loading" @click="openLatestEnding">查看上一世结局</button>
      <button @click="toggleHistory">返回</button>
    </div>

    <p v-if="history.length === 0" class="card dim">还没有任何一世走到终点。刀光血影之外，活着本身就是本事。</p>

    <div v-for="h in [...history].reverse()" :key="h.index" class="card life-card">
      <div class="row1">
        <strong>第 {{ h.index }} 世</strong>
        <span class="tag">{{ originName(h.originId) }}</span>
        <span class="tag" :class="{ warn: h.endType === 'death' }">{{ endText(h) }}</span>
        <span class="dim">享年 {{ h.endAge }} 岁</span>
      </div>
      <p class="dim">武学：{{ h.martials.map((m) => `${martialName(m.id)}（${['入门', '小成', '大成'][m.level]}）`).join('、') || '无' }}</p>
      <p class="dim">
        属性峰值：武力 {{ h.peak.atk }} / 防御 {{ h.peak.def }} / 智力 {{ h.peak.int }} / 敏捷 {{ h.peak.agi }}
      </p>
      <p v-if="h.keyEvents.length > 0" class="dim">经历：{{ h.keyEvents.join(' → ') }}</p>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.head h2 {
  margin: 0;
  color: var(--accent);
}
.life-card {
  margin-bottom: 12px;
}
.row1 {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.dim {
  font-size: 14px;
}
</style>
