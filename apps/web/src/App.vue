<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { state, boot, toggleHistory } from './store.js'
import PlayerStatus from './components/PlayerStatus.vue'
import StatChanges from './components/StatChanges.vue'
import HomeView from './views/HomeView.vue'
import OriginSelectView from './views/OriginSelectView.vue'
import LifeView from './views/LifeView.vue'
import BattleView from './views/BattleView.vue'
import EndingView from './views/EndingView.vue'
import HistoryView from './views/HistoryView.vue'

const home = ref(sessionStorage.getItem('lorecraft-screen') !== 'play')
watch(() => state.archivedLife, value => { if (value) home.value = false })
watch(home, value => { sessionStorage.setItem('lorecraft-screen', value ? 'home' : 'play') })
const impact = ref(0)
let impactTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => { void boot() })
onUnmounted(() => { clearTimeout(impactTimer) })
watch(() => state.life?.attrs.hp, (hp, previous) => {
  if (hp !== undefined && previous !== undefined && hp < previous && !home.value) {
    impact.value++
    clearTimeout(impactTimer)
    impactTimer = setTimeout(() => { impact.value = 0 }, 650)
  }
})
const mode = computed(() => {
  if (home.value) return 'home'
  if (!state.booted) return state.error ? 'error' : 'loading'
  if (state.showHistory) return 'history'
  if (state.archivedLife) return 'ended'
  if (!state.life) return 'origin'
  if (state.life.phase === 'ended') return 'ended'
  return state.life.pendingBattle ? 'battle' : 'life'
})
const playing = computed(() => mode.value === 'life' || mode.value === 'battle')
function enter(): void { state.archivedLife = null; state.showHistory = false; home.value = false }
function history(): void { home.value = false; if (!state.showHistory) toggleHistory() }
</script>

<template>
  <div :class="{ 'playing-shell': playing }">
  <header v-if="!playing" class="app-header">
    <button class="brand" aria-label="江湖一生，返回首页" @click="home = true">
      <img src="/logo.svg" alt="" width="42" height="42" />
      <span>江湖一生<small>LORECRAFT</small></span>
    </button>
    <nav class="top-nav" aria-label="主导航">
      <button :class="{ active: home }" @click="home = true">卷首</button>
      <button :class="{ active: !home && !state.showHistory }" :disabled="!state.booted" @click="enter">{{ state.life ? '此生江湖' : '入世' }}</button>
      <button :class="{ active: !home && state.showHistory }" :disabled="!state.booted" @click="history">前尘录</button>
    </nav>
    <span v-if="state.metaInfo" class="header-meta">历世 {{ state.metaInfo.meta.livesCount }} <span>·</span> 记忆 {{ state.metaInfo.meta.memories.length }}</span>
  </header>

  <div v-else class="play-return"><button @click="home = true">← 返回主页</button><span>江湖一生 · {{ mode === 'battle' ? '交锋' : '此生' }}</span></div>
  <PlayerStatus v-if="playing" />
  <StatChanges v-if="!home" />
  <main :class="{ 'ink-impact': impact > 0 }">
    <TransitionGroup name="notice" tag="div" class="notice-stack" aria-live="polite">
      <div v-for="n in state.notices" :key="n.id" class="notice" :class="{ bad: n.bad }">{{ n.text }}</div>
    </TransitionGroup>
    <Transition name="page" mode="out-in">
      <HomeView v-if="mode === 'home'" @enter="enter" @history="history" @retry="boot" />
      <div v-else-if="mode === 'loading'" class="card loading-scroll">正在入世……</div>
      <div v-else-if="mode === 'error'" class="card error-text">启动失败：{{ state.error }} <button @click="boot">重试</button></div>
      <HistoryView v-else-if="mode === 'history'" />
      <OriginSelectView v-else-if="mode === 'origin'" />
      <EndingView v-else-if="mode === 'ended'" />
      <BattleView v-else-if="mode === 'battle'" />
      <LifeView v-else />
    </Transition>
  </main>
  <footer v-if="!playing" class="app-footer"><span>江湖一生</span> · 故事由你落笔 <span class="footer-mark">山河长在，故人再来。</span></footer>
  </div>
</template>
