<script setup lang="ts">
import { computed, ref } from 'vue'
import { ageOf, formatDate } from '@lorecraft/core'
import { state, locationName, destinyName, factionName } from '../store.js'
import AnimatedValue from './AnimatedValue.vue'
import RollingText from './RollingText.vue'
import AdventureJournal from './AdventureJournal.vue'
const details = ref<HTMLDialogElement | null>(null)
const journal = ref<InstanceType<typeof AdventureJournal> | null>(null)
const life = computed(() => state.life)
const hpMax = computed(() => life.value?.injured ? Math.round(life.value.attrs.maxHp * .5) : life.value?.attrs.maxHp ?? 0)
</script>

<template>
  <section v-if="life" class="player-status" aria-label="当前人物状态">
    <div class="compact-status">
      <div class="mobile-status-heading">
        <strong>{{ locationName(life.locationId) }} · {{ ageOf(life.day) }} 岁</strong>
        <span v-if="life.injured" class="injury-label">重伤</span>
        <button aria-haspopup="dialog" @click="details?.showModal()">人物</button>
        <button aria-haspopup="dialog" :aria-label="`江湖册：武学 ${life.martials.length}，恩怨 ${journal?.relationCount ?? 0}，人物 ${journal?.peopleCount ?? 0}`" @click="journal?.open('people')">江湖册 <b>{{ journal?.peopleCount ?? 0 }}</b></button>
      </div>
      <p class="mobile-status-date"><RollingText :value="formatDate(life.day, life.slot)" :order="life.day * 4 + life.slot" /></p>
      <div class="mobile-status-values">
        <div><span>气血</span><strong><AnimatedValue :value="life.attrs.hp" /><small>/{{ hpMax }}</small></strong></div>
        <div><span>真气</span><strong><AnimatedValue :value="life.attrs.mp" /><small>/{{ life.attrs.maxMp }}</small></strong></div>
        <div><span>银两</span><strong><AnimatedValue :value="life.money" /><small> 两</small></strong></div>
        <div><span>温饱</span><strong><AnimatedValue :value="life.food" /><small>/10</small></strong></div>
      </div>
    </div>
  </section>
  <dialog ref="details" class="journal-dialog side-drawer status-detail-dialog" aria-labelledby="status-detail-title" @click="($event.target === details) && details?.close()">
    <div class="journal-heading"><h2 id="status-detail-title">人物状态</h2><button aria-label="关闭人物状态" @click="details?.close()">关闭 ×</button></div>
    <template v-if="life">
      <p class="dim">身世：{{ destinyName(life.destinyId) }} · 所属：{{ life.sectId ? factionName(life.sectId) : '尚未拜入门派' }}</p>
      <p v-if="life.injured" class="injury-label">重伤：气血上限暂时受损。</p>
      <div class="detail-journal-links"><button @click="details?.close(); journal?.open('martials')">武学 {{ life.martials.length }}</button><button @click="details?.close(); journal?.open('relations')">恩怨 {{ journal?.relationCount ?? 0 }}</button></div>
      <dl class="status-detail-grid">
        <div v-for="[label,value] in [['气血',`${life.attrs.hp}/${hpMax}`],['真气',`${life.attrs.mp}/${life.attrs.maxMp}`],['武力',life.attrs.atk],['防御',life.attrs.def],['智力',life.attrs.int],['敏捷',life.attrs.agi],['银两',`${life.money} 两`],['温饱',`${life.food}/10`],['声望',life.rep]]" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div>
      </dl>
    </template>
  </dialog>
  <AdventureJournal ref="journal" />
</template>
