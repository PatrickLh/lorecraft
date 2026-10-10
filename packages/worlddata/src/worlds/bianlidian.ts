import type { WorldDef } from '../types.js'

/**
 * 《午夜便利店》—— 规则怪谈。
 * 机制验证点：flag 密集型目标、规则遵守/打破的后果、氛围张力。
 */
export const bianlidian: WorldDef = {
  id: 'bianlidian',
  title: '午夜便利店',
  theme: '规则怪谈',
  intro:
    '深夜 11 点 50 分，你推开「永晖便利店」的玻璃门，开始第一个夜班。店内白得刺眼的灯光下，货架整整齐齐，收银台后贴着一张泛黄的《夜班员工守则》，第一行写着：「守规则的人，活到天亮。」墙上的挂钟指向 11:51，秒针的声音大得不正常。',
  systemRules: [
    '夜班时间 0:00 至 6:00，期间收银台必须始终有人值守。',
    '0:00 之后进店的「顾客」，若没有影子，请正常收银，不要看它的眼睛。',
    '冷柜第三层的商品永远不要补货，也不要向任何人询问那是什么。',
    '若听到仓库传来敲门声：数清间隔，敲满三声才可开门；两声或一声，绝对不开。',
    '凌晨 3 点会出现「查岗的店长」，他不说话；把当日收银小票递给他，他就会离开。',
    '6:00 整打烊。走出店门之前，确认店内的镜子里只有你自己。',
  ],
  flagCatalog: [
    { id: 'read_ruleboard', description: '仔细读完了收银台后的《夜班员工守则》' },
    { id: 'no_shadow_customer', description: '平安接待了一位没有影子的顾客', requires: ['read_ruleboard'] },
    { id: 'find_torch', description: '在仓库深处找到一支手电筒', requires: ['read_ruleboard'] },
    { id: 'hear_knock', description: '听到了仓库传来的敲门声' },
    { id: 'knock_correct', description: '等到敲满三声才打开仓库门', requires: ['hear_knock'] },
    { id: 'cold_shelf_secret', description: '发现了冷柜第三层藏着的旧照片', requires: ['read_ruleboard'] },
    { id: 'manager_visit', description: '凌晨 3 点，无话店长到店查岗' },
    { id: 'manager_pacified', description: '把收银小票递给无话店长，让他离开', requires: ['manager_visit'] },
    { id: 'coworker_note', description: '借手电筒的光找到了前任店员留下的字条', requires: ['find_torch'] },
    { id: 'mirror_check', description: '天亮前完成了镜子确认，镜中只有自己' },
  ],
  acts: [
    {
      id: 'act1',
      title: '第一幕 · 入夜',
      goal: '熟悉店面环境与员工守则，平安度过 0 点后最初的诡异时刻。',
      milestoneFlags: ['read_ruleboard', 'no_shadow_customer'],
    },
    {
      id: 'act2',
      title: '第二幕 · 长夜',
      goal: '应对仓库敲门与冷柜异象，弄清上一班店员的下落。',
      milestoneFlags: ['knock_correct', 'coworker_note'],
    },
    {
      id: 'act3',
      title: '第三幕 · 查岗',
      goal: '熬过凌晨 3 点的店长查岗，在 6 点打烊前完成镜子确认，活着走出便利店。',
      milestoneFlags: ['manager_pacified'],
    },
  ],
  winFlags: ['manager_pacified', 'mirror_check'],
  balanceHint: 25,
  npcs: [
    { name: '无影顾客', role: '0 点后出现的诡异来客', note: '没有影子，购买的东西总是同一款饭团，付的钱是冥币。' },
    { name: '无话店长', role: '凌晨 3 点查岗者', note: '从不说话，脸模糊得像隔着毛玻璃，只收小票。' },
    { name: '前任店员小陈', role: '字条的主人', note: '已在留言里消失，字迹越来越潦草。' },
  ],
  dangers: [
    '直视无影顾客的眼睛会中被抽走心智',
    '敲门未满三声开门会被仓库里的东西拖进去',
    '给冷柜第三层补货或询问会引来注视',
    '店长查岗时拿不出小票，自己就会变成小票',
    '镜子确认失败意味着你已经被替换',
  ],
  unlocks: ['qingyunmen'],
  entryActions: ['仔细阅读收银台后的员工守则', '清点收银台里的物品', '去仓库盘点库存'],
}
