<script setup lang="ts">
import { onMounted } from 'vue'
import { state, boot } from './store.js'
import HubView from './views/HubView.vue'
import WorldView from './views/WorldView.vue'
import DeathView from './views/DeathView.vue'

onMounted(() => {
  void boot()
})
</script>

<template>
  <header class="app-header">
    <h1>LoreCraft <span class="dim">· 无限轮回</span></h1>
    <p class="dim">文字冒险 × LLM 动态叙事 × 无限流世界穿梭 × Roguelite 死亡继承</p>
  </header>

  <div v-if="!state.booted" class="card">
    <span v-if="state.loading">正在连接轮回空间……</span>
    <span v-else class="error-text">启动失败：{{ state.error }}</span>
  </div>

  <template v-else>
    <div v-for="n in state.notices" :key="n.id" class="notice" :class="{ bad: n.bad }">
      {{ n.text }}
    </div>
    <DeathView v-if="state.run?.phase === 'dead'" />
    <WorldView v-else-if="state.run?.phase === 'in_world'" />
    <HubView v-else />
  </template>
</template>

<style scoped>
.app-header {
  margin-bottom: 20px;
}
.app-header h1 {
  margin: 0;
  color: var(--accent);
}
.app-header p {
  margin: 4px 0 0;
}
</style>
