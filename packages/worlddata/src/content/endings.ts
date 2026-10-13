import type { EndingDef } from '@lorecraft/core'

/** 结局表（requirement §8）：达成型 7 + 选择型 3，另有死亡结局由系统记录。 */
export const ENDINGS: EndingDef[] = [
  // ---- 达成型（静默判定，priority 高者优先） ----
  { id: 'wulin_diyi', name: '武功天下第一', kind: 'achieved', priority: 100, cond: { atk: 22, martialTierMin: 3 }, desc: '你的拳剑已臻化境，放眼江湖再无敌手。' },
  { id: 'mengzhu', name: '武林盟主', kind: 'achieved', priority: 90, cond: { atk: 18, rep: 80, sect: 'tiejianmen' }, desc: '天下英雄聚义，共推你执掌牛耳。' },
  { id: 'guanju_sipin', name: '官居四品', kind: 'achieved', priority: 80, cond: { rep: 50, faction: { id: 'guanfu', min: 60 } }, desc: '累功升迁，穿上了四品官服。' },
  { id: 'modao_jubo', name: '魔道巨擘', kind: 'achieved', priority: 85, cond: { atk: 16, repMax: -60 }, desc: '江湖人提你的名字，都要先看一眼门内外有没有耳目。' },
  { id: 'mingdong_jianghu', name: '名动江湖', kind: 'achieved', priority: 60, cond: { rep: 60 }, desc: '大江南北都知道钱塘城出过一号人物。' },
  { id: 'shan_zhong', name: '寿终正寝', kind: 'achieved', priority: 5, cond: { ageMin: 70 }, desc: '儿孙绕膝，含笑而终，是江湖人最难得的福气。' },
  { id: 'jianghu_yinshi', name: '江湖隐士', kind: 'achieved', priority: 30, cond: { int: 14, ageMin: 50 }, desc: '看淡了刀光血影，你把余生交给了山水。' },
  // ---- 选择型（基础条件满足后作为行动出现） ----
  { id: 'kaizong_lipai', name: '开宗立派', kind: 'chosen', priority: 70, cond: { atk: 14, rep: 60, money: 200 }, desc: '广收门徒，开山立派，自成一家。' },
  { id: 'yuanzou_haiwai', name: '远走海外', kind: 'chosen', priority: 50, cond: { money: 300 }, desc: '买舟南下，去看看江湖之外的天地。' },
  { id: 'guichang_foqian', name: '皈依佛前', kind: 'chosen', priority: 40, cond: { int: 12 }, desc: '放下恩仇，剃度出家，青灯古佛了此残生。' },
]

/** 死亡结局说明（系统自动记录，不入条件表） */
export const DEATH_ENDINGS: { cause: string; name: string; desc: string }[] = [
  { cause: 'battle', name: '横死刀兵', desc: '江湖险恶，你终究没能避开那要命的一刀。' },
  { cause: 'starve', name: '饿殍雪夜', desc: '三天没吃到一口热饭，你倒在了没人看见的角落。' },
  { cause: 'mischief', name: '死于非命', desc: '祸事来得太快，你没能撑过去。' },
]
