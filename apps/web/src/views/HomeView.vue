<script setup lang="ts">
import { state } from '../store.js'
import InkLandscape from '../components/InkLandscape.vue'
defineEmits<{ enter: []; history: []; retry: [] }>()
</script>

<template>
  <div class="home-root">
    <section class="home-scroll">
      <InkLandscape />
      <div class="home-copy">
        <p class="eyebrow">一卷江湖 · 万般人生</p>
        <h1>江湖<span>一生</span></h1>
        <p class="home-verse">山河一梦，浮生几许。<br />执笔入江湖，落子见此生。</p>
        <div class="home-actions">
          <button class="primary enter-button" :disabled="!state.booted" @click="$emit('enter')">
            {{ !state.booted ? '正在展卷…' : state.life?.phase === 'ended' ? '翻阅此生终章' : state.life ? '续写此生' : '初入江湖' }} <span aria-hidden="true">→</span>
          </button>
          <button :disabled="!state.booted" @click="$emit('history')">翻阅前尘</button>
        </div>
        <p v-if="state.error" class="error-text" role="alert">暂未连上江湖：{{ state.error }} <button @click="$emit('retry')">重新连接</button></p>
        <p class="home-caption">自由抉择 / 武学修行 / 历世轮回</p>
      </div>
      <div class="home-seal" aria-hidden="true">浮生<br />如梦</div>
      <p class="landscape-note">远山无言 · 江湖有你</p>
    </section>
    <section class="home-chapters" aria-label="游戏特色">
      <article><span class="chapter-number">壹</span><div><h2>以身入局</h2><p>从一介无名之辈起步，在钱塘城中寻自己的路。</p></div></article>
      <article><span class="chapter-number">贰</span><div><h2>以行写命</h2><p>修武学，结恩怨。你的一言一行，皆成江湖故事。</p></div></article>
      <article><span class="chapter-number">叁</span><div><h2>以前尘赴来世</h2><p>此生终有落幕，记忆与武学却能伴你再入江湖。</p></div></article>
    </section>
  </div>
</template>
