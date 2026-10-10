import type { WorldDef } from '../types.js'

/**
 * 《青云门外门》—— 修仙。
 * 机制验证点：寿命（寿元）与题材原生咬合、资源积累型成长、大比对抗。
 */
export const qingyunmen: WorldDef = {
  id: 'qingyunmen',
  title: '青云门外门',
  theme: '修仙',
  intro:
    '青云宗外门，杂役弟子居住的丙字院。你今年二十八岁，上月测灵时被执事随口报出一个数：寿元，三年。同门看你的眼神立刻变了。宗门大比还有一个月，前十名可入内门、赐延寿丹。丙字院的窗外，后山云雾深处隐约传来钟声——那是禁地的方向。',
  systemRules: [
    '外门弟子每日须完成杂役，月例灵石按劳发放，偷懒者扣除。',
    '聚灵阵每日寅时开放，位置有限，先到先得。',
    '宗门大比抽签对战，伤重者可当场认输，胜者晋级。',
    '内门弟子方可进入藏经阁一层，外门弟子擅入受罚。',
    '后山为宗门禁地，擅入者废去修为，逐出师门。',
  ],
  flagCatalog: [
    { id: 'get_mission', description: '在执事堂接下杂役任务，赚到第一笔灵石' },
    { id: 'spirit_array', description: '寅时抢先进入聚灵阵修炼' },
    { id: 'buy_pill', description: '用积攒的灵石购得一枚凝气丹', requires: ['get_mission'] },
    { id: 'breakthrough', description: '修为突破至炼气四层', requires: ['spirit_array'] },
    { id: 'elder_favor', description: '替胡执事办妥一件私事，得到他的赏识' },
    { id: 'secret_manual', description: '从胡执事处借阅到半部残缺功法', requires: ['elder_favor'] },
    { id: 'draw_good_lot', description: '大比抽签抽到了上上签', requires: ['breakthrough'] },
    { id: 'win_first_round', description: '大比首轮获胜', requires: ['breakthrough'] },
    { id: 'win_final', description: '大比决胜轮获胜，跻身前十', requires: ['win_first_round'] },
    { id: 'avoid_forbidden', description: '顶住了同门的撺掇，没有踏入后山禁地' },
  ],
  acts: [
    {
      id: 'act1',
      title: '第一幕 · 杂役少年',
      goal: '在杂役与修炼间站稳脚跟，攒下第一份修炼资源。',
      milestoneFlags: ['get_mission', 'spirit_array'],
    },
    {
      id: 'act2',
      title: '第二幕 · 大比之前',
      goal: '突破修为，结好援引，为大比做好万全准备。',
      milestoneFlags: ['breakthrough', 'elder_favor'],
    },
    {
      id: 'act3',
      title: '第三幕 · 大比',
      goal: '登台连战，跻身前十，拿下延寿丹的资格。',
      milestoneFlags: ['win_first_round'],
    },
  ],
  winFlags: ['win_final'],
  balanceHint: 22,
  npcs: [
    { name: '胡执事', role: '执事堂管事', note: '市侩，但收钱办事从不食言，欠他的人情要还。' },
    { name: '宋青书', role: '大比内定榜首', note: '内门长老远亲，炼气六层，性情倨傲。' },
    { name: '王二狗', role: '同门师兄', note: '总是撺掇你去后山「发财」，眼神闪躲。' },
  ],
  dangers: [
    '大比战败重伤会折损寿元',
    '灵石耗尽将被逐出外门，寿元在市井中迅速耗干',
    '后山禁地的「机缘」是吞噬修为的陷阱',
    '突破失败会经脉受损，体质大损',
  ],
  unlocks: ['fengxue'],
  entryActions: ['去执事堂接杂役任务', '寅时去聚灵阵占位', '向同门打听大比规矩'],
}
