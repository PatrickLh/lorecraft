<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { MARTIAL_LEVEL_NAMES } from '@lorecraft/core'
import { martialName, state, submitBattleCommand } from '../store.js'

const logPane = ref<HTMLElement | null>(null)
const stick = ref(true)

const life = computed(() => state.life)
const battle = computed(() => state.battle)
const busy = computed(() => state.ui !== 'idle' && state.ui !== 'degraded')

const enemyHpPct = computed(() => {
  const e = battle.value?.enemy
  if (!e || e.maxHp === 0) return 0
  return Math.round((e.hp / e.maxHp) * 100)
})
const playerHpPct = computed(() => {
  const l = life.value
  if (!l || l.attrs.maxHp === 0) return 0
  return Math.round((l.attrs.hp / l.attrs.maxHp) * 100)
})
const skills = computed(() =>
  (life.value?.martials ?? []).map((m) => ({
    ...m,
    def: state.catalog?.martials.find((x) => x.id === m.id),
  }))
)

watch(
  () => [state.log.length, state.log.at(-1)?.text],
  async () => {
    if (!stick.value) return
    await nextTick()
    logPane.value?.scrollTo({ top: logPane.value.scrollHeight })
  }
)
onMounted(() => {
  logPane.value?.scrollTo({ top: logPane.value.scrollHeight })
})
function onScroll(): void {
  const el = logPane.value
  if (!el) return
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

function cmd(command: Record<string, unknown>, label: string): void {
  void submitBattleCommand(command, label)
}
</script>

<template>
  <div class="battle-grid">
    <section class="card main-pane">
      <div class="vs">
        <div class="fighter">
          <strong>你</strong>
          <div class="bar"><div class="fill hp" :style="{ width: playerHpPct + '%' }"></div></div>
          <p class="stat">生命 {{ life?.attrs.hp }}/{{ life?.attrs.maxHp }} ｜ 真气 {{ life?.attrs.mp }}/{{ life?.attrs.maxMp }}</p>
        </div>
        <div class="vs-mark">对</div>
        <div class="fighter">
          <strong>{{ battle?.enemy.name }}</strong>
          <div class="bar"><div class="fill enemy" :style="{ width: enemyHpPct + '%' }"></div></div>
          <p class="stat">生命 {{ battle?.enemy.hp }}/{{ battle?.enemy.maxHp }}</p>
        </div>
      </div>

      <div ref="logPane" class="log" @scroll="onScroll">
        <div v-for="entry in state.log" :key="entry.id" :class="['entry', entry.kind]">
          <span v-if="entry.kind === 'player'">❯ {{ entry.text }}</span>
          <span v-else-if="entry.kind === 'battle'" class="battle-line">{{ entry.text }}<span v-if="entry.pending" class="cursor">▍</span></span>
          <template v-else>{{ entry.text }}<span v-if="entry.pending" class="cursor">▍</span></template>
        </div>
      </div>

      <div v-if="state.ui === 'degraded'" class="notice">
        战斗演绎未成，以战报代之：{{ state.lastDegradedReason ?? '' }}
      </div>
      <div v-if="state.ui === 'connection_lost'" class="notice bad">连接中断，正在恢复……</div>
      <div v-if="state.ui === 'waiting' || state.ui === 'streaming'" class="dim pulsing">
        {{ state.ui === 'streaming' ? '过招进行中……' : '等待出手……' }}
      </div>

      <div class="commands">
        <button
          v-for="s in skills"
          :key="s.id"
          class="skill"
          :disabled="busy || life!.attrs.mp < (s.def?.mpCost ?? 0)"
          @click="cmd({ kind: 'skill', martialId: s.id }, `使出「${s.def?.name ?? s.id}」`)"
        >
          {{ s.def?.name ?? martialName(s.id) }}
          <span class="dim">· {{ MARTIAL_LEVEL_NAMES[s.level] }} · 耗气 {{ s.def?.mpCost ?? 0 }}</span>
        </button>
        <button :disabled="busy" @click="cmd({ kind: 'attack' }, '普通攻击')">普通攻击</button>
        <button :disabled="busy" @click="cmd({ kind: 'defend' }, '防御')">防御（减伤+回气）</button>
        <button :disabled="busy" @click="cmd({ kind: 'flee' }, '逃跑')">逃跑</button>
      </div>
      <p class="dim hint">指令由引擎结算，说书人只负责把结果讲给你听。敏捷高者先手。</p>
    </section>
  </div>
</template>

<style scoped>
.battle-grid {
  max-width: 860px;
}
.vs {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}
.vs-mark {
  color: var(--danger);
  font-size: 22px;
  font-weight: 700;
}
.fighter strong {
  display: block;
  margin-bottom: 4px;
}
.bar {
  height: 12px;
  border-radius: 999px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  overflow: hidden;
}
.fill {
  height: 100%;
  transition: width 0.4s;
}
.fill.hp {
  background: linear-gradient(90deg, var(--ok), var(--accent));
}
.fill.enemy {
  background: linear-gradient(90deg, #5a2a2a, var(--danger));
}
.stat {
  font-size: 14px;
  margin: 4px 0 0;
}
.log {
  min-height: 260px;
  max-height: none;
  flex: 1;
  overflow-y: auto;
  padding-right: 6px;
}
.entry {
  margin-bottom: 12px;
  white-space: pre-wrap;
}
.battle-line {
  color: var(--danger);
}
.cursor {
  animation: blink 1s steps(1) infinite;
  color: var(--accent);
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.pulsing {
  margin: 8px 0;
}
.commands {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.hint {
  margin: 8px 0 0;
  font-size: 14px;
}
</style>
