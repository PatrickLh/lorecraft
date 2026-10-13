import type { Martial } from '../types.js'

/** 武学库 26 门（requirement §6）：三流 10 / 二流 8 / 一流 6 / 绝学 2。 */
export const MARTIALS: Martial[] = [
  // ---- 三流（10） ----
  { id: 'taizu_quan', name: '太祖长拳', category: 'fist', tier: 1, reqs: {}, mpCost: 2, powerMul: 1.0, desc: '军中相传的入门拳法，招式堂堂正正，江湖上练拳的十有八九从这里起步。' },
  { id: 'luohan_quan', name: '罗汉拳', category: 'fist', tier: 1, reqs: {}, mpCost: 2, powerMul: 1.1, desc: '寺院外传的伏魔拳法，一招一式刚猛朴实。' },
  { id: 'he_xing_quan', name: '鹤形拳', category: 'fist', tier: 1, reqs: { agi: 6 }, mpCost: 2, powerMul: 1.1, desc: '仿鹤啄鹤翔之形的巧拳，讲究身随拳走。' },
  { id: 'tiesha_zhang', name: '铁砂掌', category: 'qimen', tier: 1, reqs: { atk: 6 }, mpCost: 3, powerMul: 1.1, effect: 'break_def', desc: '插砂拍树熬出来的掌力，专破皮肉粗横之辈的护身功夫。' },
  { id: 'qingzhu_jian', name: '青竹剑法', category: 'sword', tier: 1, reqs: { int: 6 }, mpCost: 2, powerMul: 1.1, desc: '市井剑师所授的入门剑法，如青竹挺直，简明实用。' },
  { id: 'liuxu_jianfa', name: '柳絮剑法', category: 'sword', tier: 1, reqs: { agi: 6 }, mpCost: 2, powerMul: 1.0, desc: '轻灵飘忽的剑路，剑走轻灵，最适合身法快的人。' },
  { id: 'feiyan_shenfa', name: '飞燕身法', category: 'qinggong', tier: 1, reqs: {}, mpCost: 0, powerMul: 0, desc: '入门轻功，翻墙上房足以自保。' },
  { id: 'yanhui_shenfa', name: '燕回身法', category: 'qinggong', tier: 1, reqs: { agi: 6 }, mpCost: 0, powerMul: 0, desc: '去而复返的巧变身法，短打缠斗时最是滑溜。' },
  { id: 'tunashu', name: '吐纳术', category: 'neigong', tier: 1, reqs: {}, mpCost: 0, powerMul: 0, desc: '最粗浅的吐纳法门，养气强身，一切内功的根基。' },
  { id: 'zhanzhuang_gong', name: '站桩功', category: 'neigong', tier: 1, reqs: {}, mpCost: 0, powerMul: 0, desc: '外练筋骨内练气的笨功夫，日久见真章。' },
  // ---- 二流（8） ----
  { id: 'huzhao_shou', name: '虎爪手', category: 'fist', tier: 2, reqs: { atk: 8 }, mpCost: 3, powerMul: 1.3, effect: 'combo', desc: '五指如钩的擒拿狠招，一击不中，后手连绵。' },
  { id: 'dasbei_shou', name: '大摔碑手', category: 'fist', tier: 2, reqs: { atk: 8 }, mpCost: 3, powerMul: 1.3, effect: 'break_def', desc: '掌力沉猛，开碑裂石，专破硬架势。' },
  { id: 'liuyun_jianfa', name: '流云剑法', category: 'sword', tier: 2, reqs: { int: 8 }, mpCost: 3, powerMul: 1.35, desc: '剑势如流云舒卷，连绵不绝，暗藏后着。' },
  { id: 'zhuifeng_jian', name: '追风剑', category: 'sword', tier: 2, reqs: { agi: 8 }, mpCost: 3, powerMul: 1.3, effect: 'combo', desc: '以快打慢的剑法，一剑快过一剑。' },
  { id: 'caoshang_fei', name: '草上飞', category: 'qinggong', tier: 2, reqs: { agi: 8 }, mpCost: 0, powerMul: 0, desc: '踩水过河、上房越脊的二流轻功，江湖夜行人最爱。' },
  { id: 'guixi_gong', name: '龟息功', category: 'neigong', tier: 2, reqs: { int: 8 }, mpCost: 0, powerMul: 0, desc: '绵长的养气功夫，气息悠长，耐打耐磨。' },
  { id: 'suiyu_zhang', name: '碎玉掌', category: 'qimen', tier: 2, reqs: { atk: 9 }, mpCost: 4, powerMul: 1.4, effect: 'break_def', desc: '掌力透体而入，任你横练功夫也吃不消。' },
  { id: 'shenxing_baibian', name: '神行百变', category: 'qinggong', tier: 2, reqs: { agi: 10 }, mpCost: 0, powerMul: 0, desc: '身形飘忽莫测的二流身法，乱世逃命的第一等本事。' },
  // ---- 一流（6） ----
  { id: 'dali_jingang_zhang', name: '大力金刚掌', category: 'fist', tier: 3, reqs: { atk: 12 }, mpCost: 5, powerMul: 1.7, desc: '掌风到处尘土飞扬，中者筋断骨折的一流掌法。' },
  { id: 'jinghong_jianfa', name: '惊鸿剑法', category: 'sword', tier: 3, reqs: { int: 10, agi: 10 }, mpCost: 5, powerMul: 1.7, desc: '铁剑门镇门剑法，翩若惊鸿，婉若游龙。' },
  { id: 'paiyun_zhang', name: '排云掌', category: 'fist', tier: 3, reqs: { atk: 13 }, mpCost: 6, powerMul: 1.75, effect: 'combo', desc: '掌出如排云推浪，一掌紧似一掌，漕帮陆堂主的成名功夫。' },
  { id: 'lingxu_bu', name: '凌虚步', category: 'qinggong', tier: 3, reqs: { agi: 13 }, mpCost: 0, powerMul: 0, desc: '踏雪无痕的一流身法，江湖中能练成的屈指可数。' },
  { id: 'chunyang_neigong', name: '纯阳内功', category: 'neigong', tier: 3, reqs: { int: 12 }, mpCost: 0, powerMul: 0, desc: '至阳至刚的一流内功，真气沛然，百邪不侵。' },
  { id: 'zhanyi_shibadian', name: '沾衣十八跌', category: 'qimen', tier: 3, reqs: { int: 10, agi: 12 }, mpCost: 5, powerMul: 1.6, effect: 'counter', desc: '借力打力的巧劲功夫，敌越猛，摔得越狠。' },
  // ---- 绝学（2） ----
  { id: 'tianwen_jianjue', name: '天问剑诀', category: 'sword', tier: 4, reqs: { atk: 16, int: 15 }, mpCost: 10, powerMul: 2.4, effect: 'break_def', desc: '传说中的剑道绝学，一剑既出，问天问地问人间，万法皆破。' },
  { id: 'taixuan_zhenjing', name: '太玄真经', category: 'neigong', tier: 4, reqs: { int: 16 }, mpCost: 0, powerMul: 0, desc: '刻在石壁上的无上内功，练成者真气浑厚如渊，白发可返黑。' },
]
