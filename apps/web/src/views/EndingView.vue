<script setup lang="ts">
import { computed } from 'vue'
import { END_CAUSE_TEXT } from '../types.js'
import { destinyName, martialName, originName, state } from '../store.js'

const life = computed(() => state.life)
const end = computed(() => state.endInfo)
const endName = computed(() => {
  if (!life.value) return ''
  return life.value.endType === 'ending'
    ? end.value?.endingName ?? '一世功成'
    : END_CAUSE_TEXT[life.value.deathCause ?? ''] ?? '死于非命'
})
const age = computed(() => {
  const l = life.value
  if (!l?.endedAtDay && l?.endedAtDay !== 0) return '?'
  return 16 + Math.floor(l.endedAtDay / 360)
})
const unlockedOrigins = computed(() => {
  // 结算后新解锁的出身（简化：全部已解锁出身）
  return state.catalog?.origins.filter((o) => o.unlockOnly && o.available) ?? []
})

function reincarnate(): void {
  state.life = null
  state.endInfo = null
  state.log = []
  state.battle = null
  state.pendingEvent = null
}
</script>

<template>
  <div class="ending card">
    <h2 class="title">—— {{ endName }} ——</h2>
    <p class="dim">享年第 {{ age }} 岁 · {{ originName(life?.originId ?? '') }} · 身世：{{ destinyName(life?.destinyId ?? null) }}</p>

    <div v-if="end" class="chapter">
      <h3>{{ end.chapterTitle }}</h3>
      <p class="chapter-text">{{ end.chapter }}</p>
    </div>
    <p v-else-if="life?.endNarrative" class="chapter-text">{{ life.endNarrative }}</p>

    <div class="inherit card">
      <h3>带往来世的东西</h3>
      <ul>
        <li>武学：{{ (life?.martials ?? []).map((m) => `${martialName(m.id)}（${['入门', '小成', '大成'][m.level]}）`).join('、') || '无' }}</li>
        <li>历世记忆：{{ state.metaInfo?.meta.memories.length ?? 0 }} 条（已注入下一世）</li>
        <li>历世数：{{ state.metaInfo?.meta.livesCount ?? 0 }}</li>
        <li v-if="unlockedOrigins.length > 0">新出身可选：{{ unlockedOrigins.map((o) => o.name).join('、') }}</li>
      </ul>
    </div>

    <button class="primary" :disabled="state.loading" @click="reincarnate">带着记忆，转世重来</button>
  </div>
</template>

<style scoped>
.ending {
  text-align: center;
  padding: 32px 24px;
}
.title {
  color: var(--accent);
  letter-spacing: 0.25em;
}
.chapter {
  max-width: 680px;
  margin: 16px auto;
  text-align: left;
}
.chapter h3 {
  color: var(--accent);
  text-align: center;
}
.chapter-text {
  white-space: pre-wrap;
  line-height: 2;
}
.inherit {
  display: inline-block;
  text-align: left;
  margin-bottom: 20px;
  font-size: 15px;
}
.inherit ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
</style>
