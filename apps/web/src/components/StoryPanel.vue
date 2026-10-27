<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatDate } from '@lorecraft/core'
import { state, submitAct, refreshStoryView } from '../store.js'
const tools = [
  { id: 'goals', label: '任务', icon: 'scroll' },
  { id: 'map', label: '地图', icon: 'map' },
  { id: 'people', label: '人物', icon: 'people' },
  { id: 'news', label: '消息', icon: 'bell' },
  { id: 'life', label: '修行', icon: 'sun' },
] as const
const paths: Record<string, string> = {
  scroll: 'M8 4h11v14a2 2 0 0 1-2 2H7a3 3 0 0 1-3-3V6a2 2 0 0 1 4 0v11H4 M11 8h5 M11 12h5',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5 M9 3v16 M15 5v16',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1',
}
const dialog = ref<HTMLDialogElement | null>(null)
const tab = ref<'goals' | 'map' | 'people' | 'news' | 'life'>('goals')
const npcId = ref('')
const search = ref('')
const view = computed(() => state.storyView)
const busy = computed(() => !['idle', 'degraded'].includes(state.ui) || !!state.pendingEvent)
const focus = computed(() => view.value?.events.find(e => e.id === state.storyFocus && e.status === 'ready') ?? view.value?.events.find(e => e.status === 'ready' && e.kind === 'main'))
const nextMain = computed(() => view.value?.events.find(e => e.kind === 'main' && e.status === 'travel'))
const goal = computed(() => view.value?.events.find(e => e.kind === 'main' && e.title === view.value?.stage))
const npc = computed(() => view.value?.npcs.find(n => n.id === npcId.value))
const filteredNpcs = computed(() => view.value?.npcs.filter(n => `${n.name}${n.role}${n.background}`.includes(search.value.trim())) ?? [])
const location = (id: string | null) => view.value?.locations.find(l => l.id === id)?.name ?? '当前地点'
const travelSlots = (id: string) => view.value?.locations.find(l => l.id === state.life?.locationId)?.city === view.value?.locations.find(l => l.id === id)?.city ? 1 : 2
const statusText = { ready: '可参与', travel: '可前往', locked: '条件未齐', done: '已有决定', expired: '已随时间结束' }
function open(value: typeof tab.value) { tab.value = value; dialog.value?.showModal() }
function act(command: Record<string, unknown>, label: string) { dialog.value?.close(); void submitAct(command, label) }
function travel(id: string) { act({ kind: 'story_travel', locationId: id }, `前往${location(id)}`) }
function select(id: string) { state.storyFocus = id; dialog.value?.close() }
const routines = [
  { id: 'work', label: '当地帮工', effect: '银两 +2～3 · 温饱 +3 · 一时辰' },
  { id: 'meal', label: '用饭', effect: '银两 −1 · 温饱 +4 · 不耗时辰' },
  { id: 'rest', label: '歇息', effect: '气血 +3 · 真气 +2 · 一时辰' },
  { id: 'train', label: '练武', effect: '25% 武力 +1 · 每日上限 1 · 一时辰' },
  { id: 'study', label: '读书', effect: '银两 −1 · 30% 智力 +1 · 一时辰' },
  { id: 'wait', label: '等候', effect: '一时辰 · 世界事件照常推进' },
]
</script>

<template>
  <section class="story-controls" aria-label="章节行动">
    <p v-if="state.ui === 'degraded' && state.lastDegradedReason" class="chapter-guide" role="status">本次细读暂未完成，已保留原文；任务和数值未受影响，可稍后再试。</p>
    <div class="chapter-objective"><span>{{ view?.ending ? `本章结局：${view.ending}` : focus?.kind === 'side' ? `人物支线：${focus.title}` : `当前目标：${view?.stage ?? '正在读取章节……'}` }}</span><button v-if="nextMain?.locationId" :disabled="busy" @click="travel(nextMain.locationId)">{{ nextMain.reason }} · {{ travelSlots(nextMain.locationId) }}时辰 →</button><button v-if="state.storyError" @click="refreshStoryView">{{ state.storyError }} 重试</button></div>
    <div v-if="focus" class="chapter-choices">
      <button v-for="choice in focus.choices" :key="`${focus.id}:${choice.id}`" :disabled="busy || !choice.enabled" :title="choice.reason" @click="act({ kind: 'story_choice', eventId: focus.id, choiceId: choice.id }, choice.label)"><strong>{{ choice.label }}</strong><small>{{ choice.reason || choice.effects }}</small></button>
    </div>
    <p v-else class="chapter-guide">{{ view?.ending ? '第一章已告一段落。可继续探索人物支线；后续章节尚未开放。' : goal?.reason || '查看目标中的地点与条件，主动前往调查；也可谋生、练武或等候赴约。' }}</p>
    <nav class="chapter-tabs" aria-label="江湖探索"><button v-for="tool in tools" :key="tool.id" aria-haspopup="dialog" @click="open(tool.id)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[tool.icon]" /></svg><span>{{ tool.label }}</span><i v-if="tool.id === 'news' && view?.news.length" aria-label="有江湖消息" /></button></nav>
  </section>

  <dialog ref="dialog" class="journal-dialog side-drawer chapter-dialog" aria-label="江湖探索手册" @click="($event.target === dialog) && dialog?.close()">
    <div class="journal-heading"><h2>{{ ({ goals: '目标与任务', map: '两城行图', people: '江湖人物', news: '江湖消息', life: '谋生与修行' })[tab] }}</h2><button aria-label="关闭探索手册" @click="dialog?.close()">关闭 ×</button></div>
    <div class="drawer-tabs"><button v-for="tool in tools" :key="tool.id" :aria-pressed="tab === tool.id" @click="tab = tool.id">{{ tool.label }}</button></div>
    <div v-if="tab === 'goals'">
      <p>{{ view?.title }}</p><p class="dim">{{ view?.premise }}</p>
      <div class="quest-card"><strong>已取得的证据与引荐</strong><p v-if="!view?.evidence?.length" class="dim">暂未取得可核验的凭据。听闻线索不等于拥有原件。</p><ul v-else><li v-for="item in (view?.evidence ?? [])" :key="item">{{ item }}</li></ul></div>
      <template v-for="kind in ['main', 'side']" :key="kind"><h3>{{ kind === 'main' ? '身世主线' : '人物支线' }}</h3>
        <article v-for="event in view?.events.filter(e => e.kind === kind)" :key="event.id" class="quest-card"><div class="quest-title"><strong>{{ event.title }}</strong><span>{{ statusText[event.status] }}</span></div><p>{{ event.summary }}</p><small v-if="event.deadline">事件期限：{{ event.deadline }}（到期即结束）</small><p class="dim">{{ event.reason || '当前地点可参与，查看后由你决定。' }}</p><button v-if="event.status === 'ready'" @click="select(event.id)">查看事件与选择</button><button v-else-if="event.status === 'travel' && event.locationId" :disabled="busy" @click="travel(event.locationId)">前往{{ location(event.locationId) }}</button></article>
      </template>
    </div>
    <div v-else-if="tab === 'map'">
      <p class="dim">当前：{{ location(state.life?.locationId ?? '') }}。查看不耗时；同城移动一时辰，跨城两时辰。路上照常消耗温饱，并可能错过事件期限。</p>
      <section v-for="city in ['钱塘', '临安']" :key="city"><h3>{{ city }}</h3><div class="chapter-map"><article v-for="place in view?.locations.filter(l => l.city === city)" :key="place.id" class="quest-card"><div class="quest-title"><strong>{{ place.name }}</strong><span>{{ place.kind }}</span></div><p>{{ place.desc }}</p><small>{{ view?.npcs.filter(n => n.locationId === place.id && n.present).map(n => n.name).join('、') }}</small><button :disabled="busy || place.id === state.life?.locationId" @click="travel(place.id)">{{ place.id === state.life?.locationId ? '当前所在' : `前往${place.name}` }}</button></article></div></section>
    </div>
    <div v-else-if="tab === 'people'">
      <input v-model="search" placeholder="搜索姓名、身份或背景" aria-label="搜索人物" />
      <template v-if="npc"><article class="quest-card npc-profile"><h3>{{ npc.name }} · {{ npc.gender }} · {{ npc.role }}</h3><p>{{ npc.background }}</p><p>所求：{{ npc.goal }}</p><p>喜好：{{ npc.likes.join('、') }}；底线：{{ npc.boundary }}</p><p>{{ location(npc.locationId) }} · {{ npc.present ? '在此活动' : '已离开，当前不可见面' }} · 信任 {{ npc.relation }}</p><div class="npc-ties"><button v-for="tie in npc.ties" :key="tie.id" @click="npcId = tie.id">{{ view?.npcs.find(n => n.id === tie.id)?.name }}：{{ tie.text }}</button></div><div class="npc-topics" v-if="npc.locationId === state.life?.locationId && npc.present"><button v-for="topic in (['past','rumor','interest'] as const)" :key="topic" :disabled="busy" @click="act({kind:'story_talk',npcId:npc.id,topic},`与${npc.name}交谈`)">{{ ({past:'询问来历',rumor:'打听近况',interest:'聊聊看重的事'})[topic] }} · 一时辰</button></div><button v-else-if="npc.present" :disabled="busy" @click="travel(npc.locationId)">前往见面</button></article></template>
      <div class="npc-roster"><button v-for="person in filteredNpcs" :key="person.id" @click="npcId = person.id"><strong>{{ person.name }}</strong><small>{{ person.role }} · {{ location(person.locationId) }}{{ person.met ? ' · 已相识' : '' }}</small></button></div>
    </div>
    <div v-else-if="tab === 'news'">
      <p class="dim">你可以不参与，但事件不会停下。这里记录已经发生的世界变化。</p><p v-if="!view?.news.length">尚无公开的新消息。目标列表会显示已知事件的期限。</p><article v-for="news in [...(view?.news ?? [])].reverse()" :key="news.id" class="quest-card"><small>{{ formatDate(Math.floor(news.tick / 4), news.tick % 4) }}</small><p>{{ news.text }}</p></article>
    </div>
    <div v-else><p class="dim">恢复受数值上限影响，温饱随时间消耗。帮工可获得工钱和饭食；每个选择只结算一次。</p><div class="chapter-map"><button v-for="routine in routines" :key="routine.id" :disabled="busy || (['meal','study'].includes(routine.id) && (state.life?.money ?? 0) < 1)" @click="act({kind:'story_routine',activity:routine.id},routine.label)"><strong>{{ routine.label }}</strong><small>{{ routine.effect }}</small></button><button :disabled="busy" @click="act({kind:'story_detail'},'细读上一幕')"><strong>细读上一幕</strong><small>可选的 AI 场景演绎，需等待；不耗游戏时间，不改变任务与数值。</small></button></div></div>
  </dialog>
</template>

<style scoped>
.story-controls { flex-shrink: 0; padding-top: 8px; border-top: 1px solid #cdd0c9; max-height: 32dvh; overflow: auto; }
.chapter-objective { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; font-size: 12px; color: #475347; margin-bottom: 7px; }
.chapter-objective button { padding: 3px 8px; font-size: 12px; }
.chapter-choices { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px; }
.chapter-choices button, .chapter-map > button { text-align: left; padding: 9px 12px; border-radius: 10px; white-space: normal; }
.chapter-choices small, .chapter-map small, .npc-roster small { display: block; color: #5b645a; font-size: 11px; line-height: 1.5; margin-top: 4px; }
.chapter-tabs { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.chapter-tabs button { flex: 1; padding: 6px 9px; white-space: nowrap; font-size: 12px; }
.chapter-guide { font-size: 13px; margin: 5px 0 10px; }
.chapter-map { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
.quest-card { padding: 14px; border: 1px solid #c9cdc4; border-radius: 12px; margin-bottom: 12px; background: #fcfcfa; line-height: 1.75; }
.quest-card p { margin: 8px 0; }
.quest-card button { margin-top: 8px; }
.quest-title { display: flex; justify-content: space-between; gap: 12px; }
.quest-title span { font-size: 12px; color: #5c6859; }
.npc-roster { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; margin-top: 12px; }
.npc-roster button { text-align: left; padding: 10px; white-space: normal; }
.chapter-dialog input { display: block; width: 100%; box-sizing: border-box; padding: 10px 12px; font: inherit; color: #293028; background: white; border: 1px solid #b9c1b5; border-radius: 10px; margin-bottom: 12px; }
.npc-ties, .npc-topics { display: flex; flex-wrap: wrap; gap: 8px; }
@media(max-width:600px) { .chapter-choices button { padding: 6px 9px; font-size: 12px; } .chapter-choices small { font-size: 10px; } .chapter-tabs { gap: 3px; } .chapter-tabs button { font-size: 11px; padding: 5px; } .chapter-map, .npc-roster { grid-template-columns: 1fr; } }
</style>

<style scoped>
.story-controls { max-height: 36dvh; padding-top: 10px; }
.chapter-choices { grid-template-columns: repeat(3,minmax(0,1fr)); }
.chapter-choices button { padding: 10px 12px; line-height: 1.5; }
.chapter-choices small { font-size: 12px; color: #535953; }
.chapter-tabs { position: absolute; right: 0; top: 0; bottom: 0; width: 70px; margin: 0; padding: 12px 6px; flex-direction: column; flex-wrap: nowrap; gap: 8px; border: 1px solid var(--border); border-radius: 12px; background: #fafbf8; }
.chapter-tabs button { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 11px 4px; position: relative; border-color: transparent; background: transparent; }
.chapter-tabs button:hover { background: #e8ebe5; border-color: #c9cdc4; }
.chapter-tabs svg { width: 22px; height: 22px; }
.chapter-tabs i { position: absolute; right: 10px; top: 9px; width: 6px; height: 6px; background: #525c51; border-radius: 50%; }
.drawer-tabs { display: flex; gap: 6px; margin: 18px 0; flex-wrap: wrap; }
.drawer-tabs button { flex: 1; font-size: 13px; padding: 7px; }
.drawer-tabs [aria-pressed=true] { background: #353b35; color: white; }
@media(max-width: 600px) {
  .story-controls { max-height: 39dvh; padding-top: 7px; }
  .chapter-choices { grid-template-columns: 1fr; gap: 5px; }
  .chapter-choices button { display: flex; align-items: baseline; gap: 10px; justify-content: space-between; padding: 8px 10px; font-size: 13px; }
  .chapter-choices strong { flex: 1; }
  .chapter-choices small { margin: 0; font-size: 11px; text-align: right; flex: 1; }
  .chapter-tabs { position: static; width: auto; flex-direction: row; padding: 3px 0 0; border: 0; border-radius: 0; margin-top: 6px; gap: 2px; background: transparent; }
  .chapter-tabs button { flex: 1; flex-direction: row; justify-content: center; gap: 4px; padding: 7px 3px; font-size: 11px; }
  .chapter-tabs svg { width: 16px; height: 16px; }
  .chapter-tabs i { right: 3px; top: 3px; }
}
</style>
