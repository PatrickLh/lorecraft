<script setup lang="ts">
import { computed } from 'vue'
import { state, enterWorld, newRun, retryMemory } from '../store.js'

const meta = computed(() => state.metaInfo?.meta ?? null)
const hasActiveRun = computed(() => state.run !== null)
const runHub = computed(() => state.run?.phase === 'hub')

function worldState(w: { unlocked: boolean; permanentlyCleared: boolean; clearedThisRun: boolean | null }): string {
  if (w.clearedThisRun) return '本局已通关'
  if (!w.unlocked) return '未解锁'
  if (w.permanentlyCleared) return '已永久通关 · 可再入'
  return '可进入'
}
</script>

<template>
  <div v-if="state.metaInfo?.prototypeComplete" class="banner">
    ★ 原型完成：三个世界均已永久通关。可开启新局继续轮回。
  </div>

  <div v-if="(state.metaInfo?.openMemoryTaskCount ?? 0) > 0" class="notice">
    有记忆提炼尚未完成。旧记忆已保留，结算与奖励不受影响。
    <button style="margin-left: 12px" @click="retryMemory">重试提炼</button>
  </div>

  <div class="hub-grid">
    <section class="card">
      <h3>轮回档案</h3>
      <p>
        寿命上限 <strong>{{ meta?.lifespanCap ?? '—' }}</strong>
        <span class="dim">（下一局生效）</span>
      </p>
      <p>开局数 {{ meta?.runsCount ?? 0 }} ｜ 死亡次数 {{ meta?.deathCount ?? 0 }}</p>
      <p>记忆 {{ meta?.memories.length ?? 0 }} / 20 条</p>

      <h3 style="margin-top: 18px">继承记忆</h3>
      <ul v-if="(meta?.memories.length ?? 0) > 0" class="mem-list">
        <li v-for="m in meta?.memories ?? []" :key="m.id">{{ m.text }}</li>
      </ul>
      <p v-else class="dim">暂无记忆。第一次死亡后，你将带走一些东西。</p>
    </section>

    <section class="card">
      <h3>世界池</h3>
      <div v-for="w in state.worlds" :key="w.id" class="world-card" :class="{ locked: !w.unlocked }">
        <div class="world-head">
          <strong>《{{ w.title }}》</strong>
          <span class="tag">{{ w.theme }}</span>
          <span class="tag" :class="{ warn: !w.unlocked }">{{ worldState(w) }}</span>
        </div>
        <p class="world-intro dim">{{ w.intro }}</p>
        <button
          v-if="w.unlocked && !w.clearedThisRun"
          class="primary"
          :disabled="!runHub || state.loading"
          @click="enterWorld(w.id)"
        >
          进入世界
        </button>
        <button v-if="!w.unlocked" disabled>尚未解锁</button>
      </div>
    </section>
  </div>

  <div class="hub-actions">
    <p v-if="hasActiveRun && runHub" class="dim">当前处于枢纽：选择一个世界坠入。寿命池跨世界共享，进出世界不消耗寿命。</p>
    <button v-if="!hasActiveRun" class="primary" :disabled="state.loading" @click="newRun">
      开启新局
    </button>
  </div>
</template>

<style scoped>
.hub-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 800px) {
  .hub-grid {
    grid-template-columns: 1fr;
  }
}
.mem-list {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 14px;
}
.mem-list li {
  margin-bottom: 6px;
}
.world-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  margin-top: 12px;
}
.world-card.locked {
  opacity: 0.55;
}
.world-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.world-intro {
  margin: 8px 0 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hub-actions {
  margin-top: 20px;
}
</style>
