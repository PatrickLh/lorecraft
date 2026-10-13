<script setup lang="ts">
import { computed, ref } from 'vue'
import { MARTIAL_LEVEL_NAMES } from '@lorecraft/core'
import { api } from '../api.js'
import { state, martialName, factionName } from '../store.js'
const dialog = ref<HTMLDialogElement | null>(null)
const tab = ref<'martials' | 'relations' | 'people'>('people')
const query = ref('')
const selected = ref('')
const page = ref(0)
const extracting = ref(false)
const message = ref('')
const people = computed(() => {
  const notes = state.life?.characterNotes ?? {}
  const names = new Set(Object.keys(notes))
  for (const id of Object.keys(state.life?.npcs ?? {})) {
    names.add(state.catalog?.npcs.find(n => n.id === id)?.name ?? id)
  }
  // 旧存档可从近期叙事识别预设角色，未知的人物信息仍不猜测。
  for (const npc of state.catalog?.npcs ?? []) {
    if (state.life?.history.some(h => h.text.includes(npc.name))) names.add(npc.name)
  }
  return [...names].map(name => {
    const npc = state.catalog?.npcs.find(n => n.name === name)
    const note = notes[name]
    const score = npc ? state.life?.npcs[npc.id] : undefined
    return { name, gender: note?.gender ?? '未详', organization: npc?.faction ? factionName(npc.faction) : note?.organization || '未详', hobby: note?.hobby || '未详', summary: note?.summary || npc?.desc || '尚无详细经历', relation: score !== undefined ? `${score > 0 ? '交好' : score < 0 ? '结怨' : '相识'} ${score > 0 ? '+' : ''}${score}` : note?.relation || '故事提及（无数值恩怨）', score, role: npc?.role || '江湖人物' }
  }).sort((a,b) => a.name.localeCompare(b.name, 'zh-CN'))
})
const relations = computed(() => people.value.filter(p => p.score !== undefined && p.score !== 0))
const filtered = computed(() => (tab.value === 'relations' ? relations.value : people.value).filter(p => `${p.name} ${p.organization} ${p.relation}`.includes(query.value.trim())))
const visible = computed(() => filtered.value.slice(page.value * 12, (page.value + 1) * 12))
const groups = computed(() => [...new Set(visible.value.map(p => p.organization))].map(name => ({ name, people: visible.value.filter(p => p.organization === name) })))
const detail = computed(() => people.value.find(p => p.name === selected.value))
function open(kind: typeof tab.value): void {
  tab.value = kind; query.value = ''; selected.value = ''; page.value = 0
  dialog.value?.showModal()
}
async function extract(): Promise<void> {
  const life = state.life
  if (!life || extracting.value) return
  extracting.value = true; message.value = ''
  try {
    const result = await api.summarizeCharacters(life.id, life.version)
    if (state.life?.id === result.life.id && state.life.version <= result.life.version) state.life = result.life
    message.value = '已有经历已整理，新人物会继续随故事记入。'
  } catch (error) { message.value = error instanceof Error ? error.message : '整理失败，请重试' }
  finally { extracting.value = false }
}
defineExpose({ open, peopleCount: computed(() => people.value.length), relationCount: computed(() => relations.value.length) })
</script>

<template>
  <dialog ref="dialog" class="journal-dialog" aria-labelledby="journal-title" @click="($event.target === dialog) && dialog?.close()">
    <div class="journal-heading"><h2 id="journal-title">此生江湖册</h2><button aria-label="关闭江湖册" @click="dialog?.close()">关闭 ×</button></div>
    <div class="journal-tabs">
      <button v-for="kind in (['martials', 'relations', 'people'] as const)" :key="kind" :aria-pressed="tab === kind" @click="tab = kind; page = 0; selected = ''">
        {{ kind === 'martials' ? `武学 · ${state.life?.martials.length ?? 0}` : kind === 'relations' ? `恩怨 · ${relations.length}` : `人物关系图 · ${people.length}` }}
      </button>
    </div>
    <div v-if="tab === 'martials'" class="martial-list">
      <p v-if="!state.life?.martials.length" class="dim">尚未习武。入世修行，来日自有所得。</p>
      <article v-for="m in state.life?.martials" :key="m.id" class="person-detail">
        <h3>{{ martialName(m.id) }} <span class="tag">{{ MARTIAL_LEVEL_NAMES[m.level] }}</span></h3>
        <p>{{ state.catalog?.martials.find(x => x.id === m.id)?.desc }}</p>
        <p class="dim">耗气 {{ state.catalog?.martials.find(x => x.id === m.id)?.mpCost ?? 0 }}</p>
      </article>
    </div>
    <template v-else>
      <label class="people-search">寻人 <input v-model="query" type="text" placeholder="搜索姓名、所属或关系" @input="page = 0; selected = ''" /></label>
      <div class="people-extract"><button :disabled="extracting || state.ui !== 'idle'" @click="extract">{{ extracting ? '整理中…' : '整理已有经历' }}</button><span class="dim">从已有摘要和近期故事补记人物，不推进游戏时间。</span></div>
      <p v-if="message" role="status" class="dim">{{ message }}</p>
      <p class="dim">连线表示本世人物记录，节点注明与你的联系，分组表示所属组织。数值恩怨由游戏记录；人物摘要来自叙事，未知信息保留“未详”。</p>
      <p v-if="!filtered.length" class="empty-journal">{{ query ? '未找到符合条件的人物。' : '此生尚无相关人物记录，邂逅之后会陆续记入。' }}</p>
      <div v-else class="relationship-map" aria-label="人物关系图">
        <div class="self-node">你 <span>此生的江湖</span></div>
        <div class="relationship-branches">
          <section v-for="group in groups" :key="group.name" class="relationship-group">
            <h3>{{ group.name === '未详' ? '所属未详' : group.name }}</h3>
            <button v-for="person in group.people" :key="person.name" class="person-node" :aria-pressed="selected === person.name" @click="selected = person.name">
              <strong>{{ person.name }}</strong><span>{{ person.relation }}</span>
            </button>
          </section>
        </div>
      </div>
      <div v-if="filtered.length > 12" class="people-pages">
        <button :disabled="page === 0" @click="page--">上一页</button><span>{{ page + 1 }} / {{ Math.ceil(filtered.length / 12) }} · {{ filtered.length }} 人</span><button :disabled="(page + 1) * 12 >= filtered.length" @click="page++">下一页</button>
      </div>
      <article v-if="detail" class="person-detail" aria-live="polite">
        <h3>{{ detail.name }} <span class="tag">{{ detail.role }}</span></h3>
        <dl><div><dt>性别</dt><dd>{{ detail.gender }}</dd></div><div><dt>所属</dt><dd>{{ detail.organization }}</dd></div><div><dt>爱好</dt><dd>{{ detail.hobby }}</dd></div><div><dt>关系</dt><dd>{{ detail.relation }}</dd></div></dl>
        <p>{{ detail.summary }}</p>
      </article>
      <p v-else-if="filtered.length" class="dim">点击人物节点，查看简要档案。</p>
    </template>
  </dialog>
</template>
