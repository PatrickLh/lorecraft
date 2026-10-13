import type { DestinyDef, OriginDef } from '../types.js'

/** 出身（requirement §8）：初始 4 种 + 可解锁出身；身世线由出身附带。 */

export const ORIGINS: OriginDef[] = [
  {
    id: 'nongjia_zi',
    name: '农家子',
    desc: '乡下遭了灾，随流民进城讨生活。筋骨结实，兜里比脸还干净。',
    money: 5,
    food: 8,
    rep: 0,
    locationId: 'pomin',
    destiny: null, // 开局随机
    attrDelta: { maxHp: 4, def: 1 },
  },
  {
    id: 'shijing_youer',
    name: '市井游儿',
    desc: '在坊市街面上混大的，偷鸡摸狗不敢说，跑得快是真的。',
    money: 8,
    food: 6,
    rep: -5,
    locationId: 'fangshi',
    destiny: null,
    attrDelta: { agi: 2, atk: 1 },
    factions: { caobang: 5 },
  },
  {
    id: 'shanghang_xuetu',
    name: '商行学徒',
    desc: '在商会铺子里学生意，识文断字，见过些世面，兜里也有几个余钱。',
    money: 30,
    food: 8,
    rep: 5,
    locationId: 'fangshi',
    destiny: null,
    attrDelta: { int: 2 },
    factions: { shanghui: 15 },
  },
  {
    id: 'junhu_zidi',
    name: '军户子弟',
    desc: '爹是老兵，从小跟着扎马步练拳脚，一身力气是棒打出来的。',
    money: 6,
    food: 7,
    rep: 0,
    locationId: 'yamen',
    destiny: null,
    attrDelta: { atk: 3, def: 1 },
    factions: { guanfu: 10 },
  },
  // ---- 可解锁出身（前世达成） ----
  {
    id: 'menpai_dizi',
    name: '门派亲传（前世缘）',
    desc: '前世你曾在铁剑门学艺。这一世，冥冥中似乎有条路引你重入师门。',
    unlockOnly: true,
    unlockFlag: 'unlock_origin_sect',
    money: 15,
    food: 8,
    rep: 10,
    locationId: 'fangshi',
    destiny: null,
    attrDelta: { atk: 2, int: 2 },
    factions: { tiejianmen: 30 },
    martials: [{ id: 'qingzhu_jian', level: 0 }],
  },
  {
    id: 'jianghu_laoshou',
    name: '江湖老手（前世缘）',
    desc: '你分明是初临人世，却总觉得这一套拳脚兵刃，前世早就练过千百遍。',
    unlockOnly: true,
    unlockFlag: 'unlock_origin_veteran',
    money: 12,
    food: 7,
    rep: 0,
    locationId: 'fangshi',
    destiny: null,
    attrDelta: { atk: 1, def: 1, int: 1, agi: 1 },
    martials: [{ id: 'taizu_quan', level: 0 }],
  },
]

/** 身世轻主线（requirement §8）：大奖励、不强制、跨世可换。 */
export const DESTINIES: DestinyDef[] = [
  {
    id: 'jiachuan_miji',
    name: '家传秘笈',
    desc: '你贴身藏着半页残破的拳谱，是爹娘留下的唯一遗物——上面写着「太玄」二字。',
    chainEvents: ['dest_jiachuan_1', 'dest_jiachuan_2', 'dest_jiachuan_3'],
  },
  {
    id: 'miemen_chichou',
    name: '灭门之仇',
    desc: '你记得那个雪夜，黑衣人的刀，和满地的血。仇人还活着，就在这钱塘城里。',
    chainEvents: ['dest_miemen_1', 'dest_miemen_2', 'dest_miemen_3'],
  },
  {
    id: 'shenshi_zhimi',
    name: '身世之谜',
    desc: '你手腕上系着一枚小小的玉扣——养父母说，你是被人放在门口的。玉扣上刻着半个「柳」字。',
    chainEvents: ['dest_shenshi_1', 'dest_shenshi_2', 'dest_shenshi_3'],
  },
]
