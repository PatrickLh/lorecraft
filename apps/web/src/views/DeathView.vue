<script setup lang="ts">
import { computed } from 'vue'
import { DEATH_CAUSE_TEXT } from '../types.js'
import { state, newRun } from '../store.js'

const causeText = computed(() =>
  state.deathCause ? DEATH_CAUSE_TEXT[state.deathCause] : '未知死因'
)
const meta = computed(() => state.metaInfo?.meta ?? null)
</script>

<template>
  <div class="death card">
    <h2 class="death-title">—— 本局终结 ——</h2>
    <p class="cause">死因：{{ causeText }}</p>
    <p v-if="state.deathNarrative" class="narrative">{{ state.deathNarrative }}</p>

    <div class="inherit">
      <h3>带走的遗产（继承层）</h3>
      <ul>
        <li>记忆 {{ meta?.memories.length ?? 0 }} 条 —— 已注入下一局</li>
        <li>寿命上限 {{ meta?.lifespanCap }}（下一局生效）</li>
        <li>世界解锁进度：{{ meta?.permanentClearedWorlds.length ?? 0 }} / {{ state.worlds.length }}</li>
      </ul>
    </div>

    <button class="primary" :disabled="state.loading" @click="newRun">带着记忆，重入轮回</button>
  </div>
</template>

<style scoped>
.death {
  text-align: center;
  padding: 40px 24px;
}
.death-title {
  color: var(--danger);
  letter-spacing: 0.3em;
}
.cause {
  color: var(--danger);
}
.narrative {
  max-width: 640px;
  margin: 12px auto 24px;
  white-space: pre-wrap;
  text-align: left;
}
.inherit {
  display: inline-block;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 20px;
  margin-bottom: 24px;
  font-size: 14px;
}
.inherit ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
</style>
