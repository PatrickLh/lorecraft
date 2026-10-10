import type { WorldDef } from '../types.js'

/**
 * 《风雪山庄》—— 武侠江湖。
 * 机制验证点：多 NPC 关系网、信息搜集与站边博弈、自由叙事。
 */
export const fengxue: WorldDef = {
  id: 'fengxue',
  title: '风雪山庄',
  theme: '武侠江湖',
  intro:
    '大雪封山，黑风口。你背刀投宿「悦来客栈」，怀里盘缠不多，刀倒是快。堂内七八拨人：绸缎商人搓着手烤火，一队镖师闷头喝酒却兵刃不离身，角落的道人眯眼假寐，柜台后的掌柜笑得见牙不见眼——账房先生却从头到尾没抬过一次头。小二凑过来，压低声音：「客官，今晚……睡踏实点。」',
  systemRules: [
    '大雪封山，雪停之前，谁也出不了黑风口。',
    '江湖事江湖了，官府的人从不进黑风口——至少明面上如此。',
    '悦来客栈掌柜待客热情，但镇上人都说，三年前歇在这里的商队再没人见过。',
    '镖局护送的和商人收购的，似乎都不是普通货物。',
  ],
  flagCatalog: [
    { id: 'scout_inn', description: '摸清了客栈的后门与柴房路线' },
    { id: 'befriend_xiaoer', description: '和店小二攀上了交情，肯对你说实话' },
    { id: 'overhear_plot', description: '偷听到了匪众与内应在三更动手的密谋', requires: ['befriend_xiaoer'] },
    { id: 'identify_officer', description: '认出绸缎商人其实是官府密探', requires: ['overhear_plot'] },
    { id: 'spot_artifact', description: '注意到掌柜柜下藏着的曜变天目盏来路不明' },
    { id: 'protect_target', description: '大战之夜护下了被追杀的镖师遗孤', requires: ['overhear_plot'] },
    { id: 'win_duel', description: '堂前对决中击败匪首过山风' },
    { id: 'expose_innkeeper', description: '当众揭穿掌柜与匪众勾结的真相', requires: ['identify_officer'] },
    { id: 'leave_together', description: '天明雪住，带着镖师遗孤平安离庄', requires: ['protect_target'] },
  ],
  acts: [
    {
      id: 'act1',
      title: '第一幕 · 风雪投宿',
      goal: '摸清店内每一拨人的来路，为自己留好退路。',
      milestoneFlags: ['scout_inn', 'befriend_xiaoer'],
    },
    {
      id: 'act2',
      title: '第二幕 · 图穷匕见',
      goal: '密谋浮出水面。选择站边：置身事外、通风报信，还是执刀入局。',
      milestoneFlags: ['overhear_plot', 'identify_officer'],
    },
    {
      id: 'act3',
      title: '第三幕 · 堂前对决',
      goal: '三更已至，图穷匕见。这一夜过后，黑风口再无悦来客栈。',
      milestoneFlags: ['win_duel'],
    },
  ],
  winFlags: ['win_duel', 'expose_innkeeper'],
  balanceHint: 28,
  npcs: [
    { name: '掌柜', role: '悦来客栈掌柜', note: '笑面虎，三年前商队失踪的知情者。' },
    { name: '店小二', role: '店伙计', note: '十六七岁，良心未泯，是消息与后门的关键。' },
    { name: '过山风', role: '匪首', note: '使一对短戟，杀官造反的通缉犯，血债累累。' },
    { name: '绸缎商人', role: '官府密探', note: '伪装成商人入庄查案，一旦暴露必被灭口。' },
    { name: '镖师遗孤', role: '被追杀的孩子', note: '镖队唯一活口，怀里揣着匪众要的东西。' },
  ],
  dangers: [
    '三更匪众动手时，无辜者格杀勿论',
    '身份暴露会被提前灭口',
    '大雪封山，硬闯山路会失足坠崖',
    '堂前对决失败，客官便要留在黑风口了',
  ],
  unlocks: [],
  entryActions: ['环视堂内众人，记住每一张脸', '找店小二打探客栈底细', '检查自己的刀与盘缠'],
}
