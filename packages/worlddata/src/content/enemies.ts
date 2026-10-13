import type { Enemy } from '../types.js'

/** 敌人数据（requirement §4：兵力值化 + 行为倾向 + lethal 标注）。 */
export const ENEMIES: Enemy[] = [
  { id: 'zhao_heng_goon', name: '赵横', hp: 25, atk: 6, def: 3, agi: 4, tendency: 'balanced', lethal: false, loot: [5, 15], npcId: 'zhao_heng', desc: '坊市恶霸，拳脚硬，欺软怕硬。' },
  { id: 'matou_dakou', name: '码头打手', hp: 22, atk: 6, def: 2, agi: 4, tendency: 'aggressive', lethal: false, loot: [3, 8], npcId: 'lu_zhanpeng', desc: '漕帮帮众，膀大腰圆，打群架出身。' },
  { id: 'shanzeidao', name: '剪径山贼', hp: 24, atk: 7, def: 3, agi: 5, tendency: 'aggressive', lethal: false, loot: [8, 20], desc: '野林里讨生活的毛贼，见财起意。' },
  { id: 'yelang_dudao', name: '野林独行盗', hp: 28, atk: 8, def: 4, agi: 7, tendency: 'balanced', lethal: true, loot: [15, 40], desc: '背命案的积年巨盗，见人杀人。' },
  { id: 'feng_gai', name: '疯丐', hp: 18, atk: 5, def: 2, agi: 6, tendency: 'aggressive', lethal: false, loot: [0, 2], desc: '癫狂的乞丐，招式毫无章法却难缠。' },
  { id: 'biwu_wangwusheng', name: '王武生', hp: 26, atk: 7, def: 4, agi: 5, tendency: 'balanced', lethal: false, loot: [10, 20], desc: '武举出身的教头，拳脚端正，比武点到即止。' },
  { id: 'heidao_ke', name: '黑衣客', hp: 35, atk: 10, def: 5, agi: 8, tendency: 'balanced', lethal: true, loot: [30, 60], desc: '蒙面黑衣，刀法狠辣，出手就是要命的杀招。' },
  { id: 'heyi_dao_duel', name: '何一刀', hp: 32, atk: 10, def: 4, agi: 9, tendency: 'aggressive', lethal: false, loot: [0, 0], npcId: 'he_yidao', desc: '刀客较技，胜负是一回事，性命是另一回事。' },
]
