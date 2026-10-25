import type { ActionDef, FactionDef, LocationDef, NpcDef } from '../types.js'

/** 钱塘城：江南水乡的市井江湖（单城 MVP，requirement §8）。 */

export const LOCATIONS: LocationDef[] = [
  { id: 'biaoju', name: '镖局', desc: '镖师练武、杂役挑水劈柴的院落。帮工可领工钱，饭堂供饭。' },
  { id: 'fangshi', name: '坊市', desc: '钱塘城最热闹的地界，酒楼茶肆当铺药铺挤作一处，三教九流都在这里讨生活。' },
  { id: 'matou', name: '码头', desc: '漕船如织，号子震天。脚夫扛包，帮众闲逛，是力气换钱的地方，也是是非之地。' },
  { id: 'pomin', name: '贫民窟', desc: '低矮的窝棚连绵成片，破庙立在坡上。活下去都难，但没人管你从哪里来。' },
  { id: 'yamen', name: '衙门街', desc: '青石板路尽头是县衙大门，皂吏立门，告示贴墙。官府的面子，在这里最大。' },
  { id: 'yelin', name: '城郊野林', desc: '出城二里的野林子，樵夫猎户走的小道。林深路杂，有野物，也有比野物更凶的东西。' },
]

export const FACTIONS: FactionDef[] = [
  { id: 'tiejianmen', name: '铁剑门', desc: '浙地有数的剑术门派，门规森严，弟子行走江湖颇受敬重。', joinable: true },
  { id: 'guanfu', name: '官府', desc: '钱塘县衙。拿了官府的粮，就得替官府办事。', joinable: true },
  { id: 'caobang', name: '漕帮', desc: '运河上的地头蛇，明里运货暗里做买卖，刀口舔血的营生。', joinable: true },
  { id: 'shanghui', name: '钱塘商会', desc: '南来北往的买卖人都给几分面子，银子开路的地方。', joinable: false },
]

export const NPCS: NpcDef[] = [
  { id: 'shen_tiexiao', name: '沈铁箫', faction: 'tiejianmen', role: '铁剑门掌门', desc: '五十许人，鬓角霜白，一柄未开锋的长剑从不离身。话少，看人极准。', martialHint: '惊鸿剑法' },
  { id: 'lu_zhanpeng', name: '陆展鹏', faction: 'caobang', role: '漕帮堂主', desc: '络腮胡大汉，笑声洪亮，讲义气也记仇。码头上的事，他说了算。', martialHint: '排云掌' },
  { id: 'zhao_heng', name: '赵横', faction: null, role: '坊市恶霸', desc: '横行坊市的地痞头子，收摊税收保护费，拳头硬，心眼小。', martialHint: '铁砂掌' },
  { id: 'bai_lu', name: '白露', faction: 'shanghui', role: '回春堂药铺掌柜', desc: '年轻女子独自撑着药铺，医术颇精，性子清冷，账算得极明白。' },
  { id: 'liu_wenyuan', name: '柳文远', faction: 'shanghui', role: '钱塘商会会长', desc: '富甲一方的绸缎商人，笑面待人，最会用人，也最会算计人。' },
  { id: 'tie_butou', name: '铁捕头', faction: 'guanfu', role: '钱塘县捕头', desc: '面色黝黑的精瘦汉子，二十年捕快熬出来的眼力，六扇门里出了名的铁面。' },
  { id: 'lao_qigai', name: '老乞丐', faction: null, role: '破庙怪人', desc: '贫民窟破庙里的疯乞丐，时而糊涂时而清明，偶尔说出的话深不可测。', martialHint: '不明' },
  { id: 'sun_zhanggui', name: '孙掌柜', faction: 'shanghui', role: '悦来客栈掌柜', desc: '圆滑富态的中年人，天南地北的消息，银子到位都能买到。' },
  { id: 'qin_yueniang', name: '秦月娘', faction: null, role: '醉仙楼花魁', desc: '色艺双绝，来往皆城中权贵。宴席间的闲谈，比衙门的告示灵通得多。' },
  { id: 'he_yidao', name: '何一刀', faction: null, role: '独行刀客', desc: '背刀游侠，独来独往，兴许与你拼酒，兴许与你拼命，看缘分。', martialHint: '刀法自成一路' },
  { id: 'wang_po', name: '王婆', faction: null, role: '消息贩子', desc: '坊市口的牙婆，一张嘴半城闲话，几个铜板能买一句要紧话。' },
  { id: 'xuanzhen', name: '玄真道长', faction: null, role: '城外道观观主', desc: '须发花白的老道，常年闭关。据说年轻时也是刀口上走过的人。', martialHint: '纯阳内功' },
]

/** 固定行动菜单（requirement §10；修炼=成长层②，做工/闲逛等触发事件抽取） */
export const ACTIONS: ActionDef[] = [
  { id: 'biaoju_banggong', label: '镖局帮工', desc: '做一段杂役，工钱三两并管饭（温饱 +3），消耗一个时辰', slots: 1, moneyGain: [3, 3], foodGain: 3 },
  { id: 'lianwu', label: '练武', desc: '打熬拳脚功夫', slots: 1, growth: { key: 'atk', chance: 0.25 }, martialLevelChance: 0.08 },
  { id: 'lianti', label: '练体', desc: '扎马打熬筋骨皮肉', slots: 1, growth: { key: 'def', chance: 0.25 } },
  { id: 'dushu', label: '读书', desc: '读些书册经卷，长学问', slots: 1, moneyCost: 1, growth: { key: 'int', chance: 0.3 } },
  { id: 'dazuo', label: '打坐', desc: '吐纳养气，修炼内功根基', slots: 1, growth: { key: 'maxMp', chance: 0.2 }, mpGain: 3 },
  { id: 'lianqinggong', label: '练轻功', desc: '跑墙跳瓦，练身法步履', slots: 1, growth: { key: 'agi', chance: 0.25 } },
  { id: 'yongfan', label: '用饭', desc: '吃碗热饭，垫垫肚子', slots: 0, moneyCost: 1, foodGain: 4 },
  { id: 'zhusu', label: '住店', desc: '客栈睡一晚，养精蓄锐到明日清晨', slots: 4, moneyCost: 3, hpGain: 8, restToMorning: true },
  { id: 'yishang', label: '医伤', desc: '回春堂抓药治伤，痊愈内伤', slots: 1, moneyCost: 10, healInjury: true, hpGain: 6 },
  { id: 'zuogong', label: '码头扛包', desc: '出力气换饭钱', slots: 1, moneyGain: [3, 6], eventChance: 0.15 },
  { id: 'fangshi', label: '坊市闲逛', desc: '街上走走，遇事见缘', slots: 1, eventChance: 0.5 },
  { id: 'dating', label: '打听消息', desc: '花几个钱买句要紧话', slots: 1, moneyCost: 2, eventChance: 0.3 },
  { id: 'guoyiri', label: '过一日', desc: '什么都做，就这样过了一天', slots: 4 },
]
