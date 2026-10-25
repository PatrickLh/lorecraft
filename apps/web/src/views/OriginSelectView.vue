<script setup lang="ts">
import { computed } from 'vue'
import { state, startLife, destinyName, openLatestEnding } from '../store.js'

const origins = computed(() => state.catalog?.origins ?? [])
const memoryCount = computed(() => state.metaInfo?.meta.memories.length ?? 0)
</script>

<template>
  <div class="origin-root">
    <div class="card intro">
      <h2>钱塘城 · 转生台</h2>
      <p>
        你将带着 <strong>{{ memoryCount }}</strong> 条已提炼的前世记忆，落进这座城。
        选一个出身，开始新的一世。
      </p>
      <p class="dim">前世记忆（叙事中会被引用）：</p>
      <ul class="mem">
        <li v-for="m in state.metaInfo?.meta.memories ?? []" :key="m.id">{{ m.text }}</li>
      </ul>
      <p v-if="memoryCount === 0 && !state.metaInfo?.meta.livesCount" class="dim">这是你的第一世，尚无前世记忆。一世结束后可提炼经历，供来世叙事引用。</p>
      <p v-else-if="memoryCount === 0" class="dim">你已历经 {{ state.metaInfo?.meta.livesCount }} 世，暂未提炼出前世记忆，无需达成特殊结局。</p>
      <p v-if="state.metaInfo?.openMemoryTaskCount" class="dim">还有 {{ state.metaInfo.openMemoryTaskCount }} 项记忆待提炼；可在结局页提炼后再转世。</p>
      <button v-if="state.metaInfo?.meta.livesCount" :disabled="state.loading" @click="openLatestEnding">查看上一世结局 / 提炼记忆</button>
    </div>

    <div class="origin-grid">
      <div
        v-for="o in origins"
        :key="o.id"
        class="card origin-card"
        :class="{ locked: !o.available }"
      >
        <div class="head">
          <strong>{{ o.name }}</strong>
          <span v-if="o.unlockOnly" class="tag">{{ o.available ? '前世缘 · 已解锁' : '前世缘 · 未解锁' }}</span>
        </div>
        <p class="desc">{{ o.desc }}</p>
        <button class="primary" :disabled="!o.available || state.loading" @click="startLife(o.id)">
          以此身入世
        </button>
      </div>
    </div>
    <p class="dim hint">身世线（家传秘笈 / 灭门之仇 / 身世之谜）将随机降临，亦可被出身带定。</p>
  </div>
</template>

<style scoped>
.intro {
  margin-bottom: 16px;
}
.intro h2 {
  margin-top: 0;
  color: var(--accent);
}
.mem {
  margin: 4px 0;
  padding-left: 18px;
  font-size: 15px;
}
.origin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.origin-card.locked {
  background: var(--bg-soft);
  border-style: dashed;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.desc {
  font-size: 15px;
  min-height: 66px;
}
.hint {
  margin-top: 14px;
}
</style>
