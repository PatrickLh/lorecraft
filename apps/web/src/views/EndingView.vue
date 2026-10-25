<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '../api.js'
import { END_CAUSE_TEXT } from '../types.js'
import { destinyName, martialName, originName, state, retryMemory } from '../store.js'

const extracting = ref(false)
const extractionResult = ref<{ ok: boolean; text: string; memories: string[] } | null>(null)
const memoryStatus = ref<{ pending: number; failed: number; lastError: string | null } | null>(null)
const statusError = ref('')
const life = computed(() => state.archivedLife ?? state.life)
async function loadMemoryStatus(): Promise<void> {
  const id = life.value?.id
  if (!id) return
  try {
    const result = await api.getMemoryStatus(id)
    if (life.value?.id === id) { memoryStatus.value = result; statusError.value = '' }
  } catch { if (life.value?.id === id) statusError.value = '暂时无法读取提炼状态，请重新打开此页或重试。' }
}
watch(() => life.value?.id, () => { memoryStatus.value = null; extractionResult.value = null; void loadMemoryStatus() }, { immediate: true })
const hasMemoryTasks = computed(() => memoryStatus.value ? memoryStatus.value.pending + memoryStatus.value.failed > 0 : (state.metaInfo?.openMemoryTaskCount ?? 0) > 0)
const failureReason = computed(() => {
  const error = memoryStatus.value?.lastError
  if (!error) return ''
  if (/schema|JSON|契约/.test(error)) return '模型返回的记忆格式未通过校验，本次内容未保存，可以重试。'
  if (/timeout|超时/.test(error)) return '提炼请求超时，本次内容未保存，可以重试。'
  return '提炼服务未能完成请求，已有记忆已保留，请稍后重试。'
})
async function extract(): Promise<void> {
  if (extracting.value) return
  extracting.value = true
  extractionResult.value = null
  try { extractionResult.value = await retryMemory(); await loadMemoryStatus() } finally { extracting.value = false }
}

const end = computed(() => state.archivedLife ? null : state.endInfo)
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
  if (state.archivedLife) {
    state.archivedLife = null
    if (state.life?.phase === 'alive') return
  }
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
        <li>历世记忆：{{ state.metaInfo?.meta.memories.length ?? 0 }} 条（可供后续叙事引用）</li>
        <li>历世数：{{ state.metaInfo?.meta.livesCount ?? 0 }}</li>
        <li v-if="unlockedOrigins.length > 0">新出身可选：{{ unlockedOrigins.map((o) => o.name).join('、') }}</li>
      </ul>
      <p v-if="hasMemoryTasks" class="dim">这一世有 {{ memoryStatus ? memoryStatus.pending + memoryStatus.failed : '若干' }} 项记忆待提炼。</p>
      <p v-if="statusError" role="status">{{ statusError }}</p>
      <p v-if="failureReason && !extracting" class="extraction-error" role="alert">上次提炼未完成：{{ failureReason }}</p>
      <button v-if="hasMemoryTasks" :disabled="extracting" @click="extract">{{ extracting ? '正在提炼前世记忆……' : memoryStatus?.failed ? '重新提炼前世记忆' : '提炼前世记忆' }}</button>
      <p v-if="extracting" role="status" class="dim">正在整理这一世的经历，请稍候。完成后会在此处展示结果。</p>
      <div v-if="extractionResult" class="extraction-result" :class="{ 'extraction-error': !extractionResult.ok }" role="status" aria-live="polite">
        <p>{{ extractionResult.text }}</p>
        <ul v-if="extractionResult.memories.length"><li v-for="memory in extractionResult.memories" :key="memory">{{ memory }}</li></ul>
      </div>
      <details v-if="state.metaInfo?.meta.memories.length" class="saved-memories"><summary>查看已保存的前世记忆</summary><ul><li v-for="memory in state.metaInfo.meta.memories" :key="memory.id">{{ memory.text }}</li></ul></details>
    </div>

    <button class="primary" :disabled="state.loading || extracting" @click="reincarnate">{{ state.archivedLife && state.life?.phase === 'alive' ? '返回当前一世' : '转世重来' }}</button>
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
  display: block;
  width: min(100%, 680px);
  box-sizing: border-box;
  text-align: left;
  margin: 24px auto;
  font-size: 15px;
}
.inherit ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.extraction-result { margin-top: 12px; padding: 10px 14px; border: 1px solid #b4bcb2; border-radius: 10px; background: #f3f6f0; color: #293d2d; }
.extraction-error { color: #962e2e; }
.saved-memories { margin-top: 16px; line-height: 1.8; }
.saved-memories summary { cursor: pointer; }
</style>
