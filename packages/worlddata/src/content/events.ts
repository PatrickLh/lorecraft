import type { EventDefView } from '../types.js'

/**
 * 事件库（requirement §8）。首批 20 条沙箱事件 + 9 条身世线事件（P5 补齐至 50 沙箱）。
 * 机械结果由代码结算，文本只是引子，LLM 负责演绎。
 */
export const EVENTS: EventDefView[] = [
  // ==================== 沙箱事件（首批 20） ====================
  {
    id: 'e_baofei',
    title: '恶霸收钱',
    weight: 10,
    cond: { location: 'fangshi', noFlag: 'e_baofei_done' },
    text: '「站住！这条街是赵爷的地盘，摆摊的、行路的，都得留下买路钱。」赵横带着两个跟班拦住了你，手里盘着一条铁鞭。',
    choices: [
      { label: '交钱消灾', outcome: { money: -5, text: '你摸出五两银子递了过去。' } },
      { label: '拔拳相向', outcome: { battle: { enemy: 'zhao_heng_goon' } } },
      {
        label: '好汉不吃眼前亏，低头绕路',
        outcome: { rep: -2, text: '你低着头从他们身边挤了过去，背后传来一阵哄笑。' },
      },
    ],
  },
  {
    id: 'e_matou_qianghuo',
    title: '码头抢活',
    weight: 8,
    cond: { location: 'matou' },
    text: '两拨脚夫为了刚靠岸的一条货船吵了起来，眼看就要动手。管事的急得直跳脚。',
    choices: [
      { label: '帮一边扛包占住活计', outcome: { money: 4, food: -1, factions: { caobang: 5 }, text: '你闷头扛完了这趟包，挣了几个辛苦钱。' } },
      { label: '上前劝架', outcome: { rep: 2, text: '你说得口干舌燥，两边总算没打起来。管事的记住了你。' } },
      { label: '趁乱摸个包袱', randomOutcomes: [
        { weight: 6, outcome: { money: 10, rep: -3, text: '乱糟糟中，一个鼓囊囊的包袱到了你怀里。' } },
        { weight: 4, outcome: { hp: -3, rep: -3, text: '被人当场抓住，挨了几拳才脱身。' } },
      ] },
    ],
  },
  {
    id: 'e_yejian_qiezei',
    title: '夜半梁上君子',
    weight: 7,
    cond: { location: 'fangshi', night: true, slots: [3] },
    text: '巷子深处，一条黑影正往人家窗缝里递手。那贼也看见了你，两人隔着半条巷子对视。',
    choices: [
      { label: '大喝一声抓贼', randomOutcomes: [
        { weight: 5, outcome: { rep: 3, money: 5, text: '你一声断喝，那贼吓得从墙头栽了下来，刀还压在你手里。' } },
        { weight: 5, outcome: { hp: -3, text: '那贼竟是个练家子，反手给了你一刀，翻墙跑了。' } },
      ] },
      { label: '只当没看见', outcome: { text: '江湖上的事，管不过来。你转身走进另一条巷子。' } },
      { label: '要他分一半', outcome: { money: 8, rep: -3, text: '「识相的留一半。」那贼扔下一串钱，消失在夜色里。' } },
    ],
  },
  {
    id: 'e_jiulou_douou',
    title: '酒楼斗殴',
    weight: 8,
    cond: { location: 'fangshi' },
    text: '醉仙楼里两桌人不知怎么打了起来，桌翻碗碎，拳头棍棒齐飞，看客们轰然叫好。',
    choices: [
      { label: '上前拉架', outcome: { rep: 2, hp: -2, text: '你被流拳扫中肩膀，好歹把两边劝开了。' } },
      { label: '趁乱摸几两碎银', randomOutcomes: [
        { weight: 6, outcome: { money: 7, rep: -2 } },
        { weight: 4, outcome: { hp: -3, rep: -2, text: '失手被人揪住，好一顿收拾。' } },
      ] },
      { label: '上楼要壶好酒，冷眼看戏', outcome: { money: -3, attrs: { int: 1 }, text: '你抿着酒看着眼前人间的热闹，隐约悟了些人心取舍。' } },
    ],
  },
  {
    id: 'e_sheku',
    title: '蛇窟铁盒',
    weight: 5,
    cond: { location: 'yelin' },
    text: '林子深处一个土洞旁盘着几条花蛇，洞口半埋着一只锈迹斑斑的铁盒，隐约露出拳谱字样。',
    choices: [
      { label: '拨蛇取盒', randomOutcomes: [
        { weight: 5, outcome: { hp: -4, learn: { id: 'tiesha_zhang' }, text: '你挨了两口蛇信，到底把盒子抠了出来——里面是一册《铁砂掌练习法》。' } },
        { weight: 5, outcome: { hp: -6, text: '蛇群受惊齐扑，你抱头鼠窜，还被咬了一口。' } },
      ] },
      { label: '用长棍挑出铁盒', randomOutcomes: [
        { weight: 6, outcome: { learn: { id: 'tiesha_zhang' } } },
        { weight: 4, outcome: { text: '盒子早就朽了，拳谱烂成一团浆。' } },
      ] },
      { label: '犯不上冒险，绕路走', outcome: {} },
    ],
  },
  {
    id: 'e_pomiao_qigai',
    title: '破庙怪人',
    weight: 8,
    cond: { location: 'pomin', night: true, slots: [3] },
    text: '破庙里蜷着那个疯疯癫癫的老乞丐，见了你咧嘴一笑：「小哥，可有酒？可有饭？」',
    choices: [
      { label: '分他半个馍', outcome: { food: -2, npcs: { lao_qigai: 15 }, text: '老乞丐接过馍，浑浊的眼睛亮了一下：「好小子。」' } },
      { label: '打酒给他', randomOutcomes: [
        { weight: 6, outcome: { money: -3, npcs: { lao_qigai: 20 }, learn: { id: 'tunashu' }, text: '老乞丐喝得痛快，抓着你的手比划了一套吐纳的法门：「记住咯，气沉丹田……」' } },
        { weight: 4, outcome: { money: -3, npcs: { lao_qigai: 20 }, text: '他喝完倒头就睡，鼾声如雷。' } },
      ] },
      { label: '嫌他脏，踹开他', outcome: { npcs: { lao_qigai: -15 }, rep: -2 } },
    ],
  },
  {
    id: 'e_yaopu_banggong',
    title: '回春堂帮工',
    weight: 8,
    cond: { location: 'fangshi' },
    text: '回春堂门口贴了张红纸：招抓药学徒一名，管一顿饭。白露掌柜在柜台后拨着算盘。',
    choices: [
      { label: '老老实实干一天', outcome: { money: 3, food: 2, attrs: { int: 1 }, npcs: { bai_lu: 5 }, text: '碾了一天药，白露教你认了几味药材，晚饭在铺子里解决的。' } },
      { label: '顺手顺两味贵药', randomOutcomes: [
        { weight: 5, outcome: { money: 12, npcs: { bai_lu: -15 }, rep: -3, text: '得手了。可你总觉得柜后那双眼睛在看你。' } },
        { weight: 5, outcome: { npcs: { bai_lu: -20 }, rep: -5, hp: -2, text: '被当场拿住，挨了顿好打，撵出了铺子。' } },
      ] },
      { label: '只是路过', outcome: {} },
    ],
  },
  {
    id: 'e_leitai',
    title: '擂台比武',
    weight: 9,
    cond: { location: 'fangshi', season: 0, chance: 0.6 },
    text: '春社大集，坊市口搭起一座擂台。擂主王武生抱拳环视：「钱塘父老，有兴致的上台讨教几手，点到即止！」',
    choices: [
      { label: '上台比武', outcome: { battle: { enemy: 'biwu_wangwusheng', onWinFlags: ['unlock_origin_veteran'] } } },
      { label: '台下喝彩助威', outcome: { rep: 1 } },
      { label: '没这个本事，绕着走', outcome: {} },
    ],
  },
  {
    id: 'e_guanfu_xuan_shang',
    title: '捕头悬赏',
    weight: 8,
    cond: { location: 'yamen' },
    text: '衙门口新贴了海捕文书，铁捕头按着刀对围观的人冷声道：「城外野林里有剪径的毛贼，拿了有赏。」',
    choices: [
      { label: '揭榜领差', outcome: { battle: { enemy: 'shanzeidao', onWinFlags: ['e_guanfu_done'] } } },
      { label: '谎报贼踪领赏钱', randomOutcomes: [
        { weight: 5, outcome: { money: 5, rep: -5, factions: { guanfu: -10 }, text: '差役白跑一趟，回来要拿你问罪，你早溜了。' } },
        { weight: 5, outcome: { rep: -5, factions: { guanfu: -10 }, hp: -3, text: '谎话被当场戳穿，吃了几鞭子。' } },
      ] },
      { label: '官府的事，少沾', outcome: {} },
    ],
  },
  {
    id: 'e_caobang_zhaoRen',
    title: '漕帮招人',
    weight: 7,
    cond: { location: 'matou', sect: 'no' },
    text: '码头棚子底下，漕帮的堂口摆了张桌子。陆展鹏叼着草根打量过往的年轻人：「想不想跟着帮里吃香喝辣？」',
    choices: [
      { label: '纳头便拜，入帮', outcome: { sectJoin: 'caobang', npcs: { lu_zhanpeng: 15 }, factions: { caobang: 20 }, flags: ['unlock_origin_veteran'], text: '陆展鹏拍着你的肩膀大笑：「好小子，以后码头上有你一碗饭！」' } },
      { label: '讨碗帮里的酒喝，不拜', outcome: { food: 2, factions: { caobang: 3 }, text: '酒是好酒，陆展鹏也不恼：「想清楚了再来。」' } },
      { label: '不去', outcome: {} },
    ],
  },
  {
    id: 'e_shangdui_huwei',
    title: '商会护镖',
    weight: 7,
    cond: { location: 'fangshi', minMoney: 0 },
    text: '商会门口，柳文远正给几个镖师封赏。见到你打量货箱，他笑道：「小兄弟，走一趟野林押货，五十两，敢不敢？」',
    choices: [
      { label: '接下这趟镖', outcome: { battle: { enemy: 'shanzeidao' }, money: 25, factions: { shanghui: 10 } } },
      { label: '嫌危险，回绝', outcome: { text: '柳文远也不勉强，转头就叫了别人。' } },
    ],
  },
  {
    id: 'e_dufang',
    title: '赌坊风波',
    weight: 7,
    cond: { location: 'fangshi', night: true, slots: [3] },
    text: '赌坊里骰声鼎沸。你兜里的银子在袖子里发烫。',
    choices: [
      { label: '押一把大的', randomOutcomes: [
        { weight: 4, outcome: { money: 20, text: '骰子落定，通吃！你揣着赢来的银子挤出人群。' } },
        { weight: 6, outcome: { money: -15, text: '连输三把，庄家的手比你的命硬。' } },
      ] },
      { label: '小赌怡情', randomOutcomes: [
        { weight: 5, outcome: { money: 6 } },
        { weight: 5, outcome: { money: -5 } },
      ] },
      { label: '绕开赌坊', outcome: {} },
    ],
  },
  {
    id: 'e_heidao_yexing',
    title: '黑衣夜行',
    weight: 4,
    cond: { location: 'yelin', night: true, slots: [3], chance: 0.25 },
    text: '月色惨白。林间小道上，一个蒙面黑衣人与你擦肩而过，他的刀鞘上，暗红一片像是干涸的血。',
    choices: [
      { label: '跟上去看个究竟', outcome: { battle: { enemy: 'heidao_ke', lethal: true } } },
      { label: '屏住呼吸，躲进树影', outcome: { attrs: { agi: 1 }, text: '你贴着树干不敢出气，直到脚步声彻底消失。这一刻的隐忍，让你身法更精了一分。' } },
      { label: '掉头就跑', outcome: { hp: -2, text: '背后传来一声冷笑，一支弩箭擦着你的耳朵钉进树干。' } },
    ],
  },
  {
    id: 'e_huangmiao_shibi',
    title: '荒庙石壁',
    weight: 6,
    cond: { location: 'yelin' },
    text: '半塌的野庙里，一面石壁上密密麻麻全是剑痕，深浅错落，像是一场大战留下的，又像是有人刻意刻的剑谱。',
    choices: [
      { label: '对着剑痕参悟终日', randomOutcomes: [
        { weight: 5, outcome: { learn: { id: 'liuyun_jianfa' }, attrs: { int: 1 }, text: '剑痕流转之间，你隐约摸到了一套剑法的脉络。' } },
        { weight: 5, outcome: { attrs: { int: 2 }, text: '看不懂，但大受震撼。你把剑痕一一记在心里。' } },
      ] },
      { label: '拓印下来卖钱', outcome: { money: 10, rep: -2, text: '字画铺子给了十两，说是「前朝残帖」。' } },
      { label: '不看', outcome: {} },
    ],
  },
  {
    id: 'e_hunyan',
    title: '婚宴风波',
    weight: 7,
    cond: { location: 'fangshi' },
    text: '街口娶亲的队伍被一个醉汉拦住了，非要新娘子陪他喝一杯，幡子倒了一地。',
    choices: [
      { label: '出手撵走醉汉', randomOutcomes: [
        { weight: 6, outcome: { rep: 3, money: 2, text: '新郎官千恩万谢，塞了你个红包。围观百姓叫好。' } },
        { weight: 4, outcome: { hp: -3, text: '醉汉看着疯，力气倒大，你吃了个亏才把他按住。' } },
      ] },
      { label: '跟着起哄看热闹', outcome: { food: 1, text: '喜家散喜糖喜饼，你也混了一份。' } },
    ],
  },
  {
    id: 'e_yilao_zengshu',
    title: '老儒赠书',
    weight: 6,
    cond: { location: 'pomin' },
    text: '贫民窟的窝棚里，一个落魄老儒生守着半箱破书。见你路过，他抽出薄薄一册递来：「小子，识字么？这册《策论》送你了。」',
    choices: [
      { label: '谢过，认真读', outcome: { attrs: { int: 2 }, text: '灯下苦读数日，书中道理竟与拳脚相通。' } },
      { label: '拿去废品铺卖掉', outcome: { money: 4, rep: -1 } },
      { label: '婉谢', outcome: {} },
    ],
  },
  {
    id: 'e_liehu_yuxian',
    title: '猎户遇险',
    weight: 6,
    cond: { location: 'yelin' },
    text: '「救命——」一个猎户的腿被兽夹死死咬住，血把裤管浸透了，见你来，眼睛里全是光。',
    choices: [
      { label: '撬开兽夹救他', randomOutcomes: [
        { weight: 6, outcome: { rep: 4, attrs: { agi: 1 }, money: 5, text: '你小心避开夹齿把人弄了出来。猎户执意把猎得的野雉塞给你，又指点了你几句走林子的步法。' } },
        { weight: 4, outcome: { hp: -4, rep: 2, text: '夹子弹开时崩了你一手血。人是救下来了，你的手也挂了彩。' } },
      ] },
      { label: '帮着喊人，自己不碰', outcome: { rep: 1 } },
      { label: '走过去剥他的猎物', outcome: { money: 8, rep: -6, text: '猎户的咒骂声在林子里回荡了很久。' } },
    ],
  },
  {
    id: 'e_zhaizhu_shangmen',
    title: '认错人的债主',
    weight: 6,
    cond: { location: 'pomin' },
    text: '两条壮汉把你堵在巷口：「姓张的欠钱跑路，这身衣裳……就是他！打！」',
    choices: [
      { label: '据理力争', randomOutcomes: [
        { weight: 6, outcome: { attrs: { int: 1 }, text: '你把来龙去脉掰扯得清清楚楚，壮汉面红耳赤，抱拳走了。' } },
        { weight: 4, outcome: { hp: -3, text: '跟他们讲理？拳头就是他们的理。' } },
      ] },
      { label: '破财消灾', outcome: { money: -8, text: '掏空了钱袋，两人才骂骂咧咧地走了。' } },
      { label: '撒腿就跑', outcome: { hp: -1, attrs: { agi: 1 }, text: '你钻小巷翻矮墙，狼狈是狼狈，腿脚倒是利索了些。' } },
    ],
  },
  {
    id: 'e_tiejianmen_zhaomu',
    title: '铁剑门招收弟子',
    weight: 8,
    cond: { location: 'fangshi', season: 0, sect: 'no', chance: 0.5 },
    text: '铁剑门三年一度的收徒大会设在了坊市广场。沈铁箫端坐台上，身前立着一块青石，石上剑痕如新。',
    choices: [
      { label: '上前请试，求拜师', outcome: { sectJoin: 'tiejianmen', npcs: { shen_tiexiao: 10 }, factions: { tiejianmen: 25 }, flags: ['unlock_origin_sect'], learn: { id: 'qingzhu_jian' }, text: '你依着石上剑痕比划了几手。沈铁箫看了半晌，淡淡道：「资质尚可。明日起，入外门。」' } },
      { label: '在台下学几式', outcome: { attrs: { int: 1 }, text: '你挤在人堆里把招式默默记了个大概。' } },
    ],
  },
  {
    id: 'e_xuanzhen_daoguan',
    title: '道观奇遇',
    weight: 5,
    cond: { location: 'yelin' },
    text: '野林深处竟有座小道观。白须道长在院中打拳，一招一式慢得像在水里，你却不由自主看得入了神。',
    choices: [
      { label: '上前执弟子礼求教', randomOutcomes: [
        { weight: 5, outcome: { learn: { id: 'guixi_gong' }, npcs: { xuanzhen: 10 }, text: '玄真道长看了你半晌：「倒是有几分慧根。」传了你一套龟息养气的法门。' } },
        { weight: 5, outcome: { attrs: { int: 1 }, mp: 2, npcs: { xuanzhen: 5 }, text: '道长只笑着指点了几句呼吸的法门，却让你受益匪浅。' } },
      ] },
      { label: '讨碗观里的斋饭', outcome: { food: 3, attrs: { int: 1 } } },
      { label: '悄悄离开', outcome: {} },
    ],
  },

  // ==================== 身世线·家传秘笈 ====================
  {
    id: 'dest_jiachuan_1',
    title: '爹娘的遗物',
    weight: 20,
    cond: { destiny: 'jiachuan_miji', noFlag: 'd_jiachuan_1', slots: [3] },
    text: '夜里你又摸出那半页残破的拳谱。借着月光，「太玄」两个字的墨迹下面，似乎还有一行小字被人刮去了。',
    choices: [
      { label: '对着灯仔细辨认', outcome: { attrs: { int: 1 }, flags: ['d_jiachuan_1'], text: '刮痕下的字迹若隐若现——「城郊·野庙·石匣」。' } },
      { label: '收起来，来日再说', outcome: {} },
    ],
  },
  {
    id: 'dest_jiachuan_2',
    title: '野庙石匣',
    weight: 20,
    cond: { destiny: 'jiachuan_miji', flag: 'd_jiachuan_1', noFlag: 'd_jiachuan_2' },
    text: '你按残页所指引到了野林深处的破庙。神龛之后果然有个石匣，匣面刻着与你贴身残页相同的纹路。',
    choices: [
      { label: '按纹路旋转开启', outcome: { flags: ['d_jiachuan_2'], learn: { id: 'zhanzhuang_gong' }, attrs: { maxHp: 3 }, hp: 3, text: '石匣里是一册内功总纲和一瓶丹丸。你依照总纲试着吐纳，气血竟壮实了几分。总纲扉页写着：真经在上，非大智慧大毅力者不可习。' } },
      { label: '先封存起来，不冒险', outcome: { flags: ['d_jiachuan_2'], text: '你把石匣原样埋了回去，记死了这个地方。' } },
    ],
  },
  {
    id: 'dest_jiachuan_3',
    title: '太玄真经',
    weight: 20,
    cond: { destiny: 'jiachuan_miji', flag: 'd_jiachuan_2', noFlag: 'd_jiachuan_3' },
    text: '石匣中的《太玄真经》摊在你面前，石壁上的古篆你如今已能识得七成。这是爹娘拼死留下的东西。',
    choices: [
      { label: '依法修习（需大智慧）', req: { attrMin: { int: 16 } }, outcome: { flags: ['d_jiachuan_3', 'unlock_origin_veteran'], learn: { id: 'taixuan_zhenjing' }, text: '你凝神修习，心无旁骛。当第一缕真气汇入丹田时，你终于明白爹娘为何以命护它。' } },
      { label: '根基未足，先修总纲', outcome: { flags: ['d_jiachuan_3'], attrs: { maxMp: 5 }, mp: 5, learn: { id: 'tunashu' }, text: '你把真经供了起来，先把总纲里的吐纳法门练了个扎实。真经有灵，来日方长。' } },
      { label: '送给识货的人，换些盘缠', outcome: { flags: ['d_jiachuan_3'], money: 40, text: '知识有价，但也有价更高的时候。你把真经卖了，心里说不上是什么滋味。' } },
    ],
  },

  // ==================== 身世线·灭门之仇 ====================
  {
    id: 'dest_miemen_1',
    title: '雪夜的梦',
    weight: 20,
    cond: { destiny: 'miemen_chichou', noFlag: 'd_miemen_1' },
    text: '你又梦见那个雪夜：黑衣人一脚踹开家门，刀光落处满地皆红。惊醒时你攥着被角，指甲掐进了掌心——那人的刀鞘上，有云雷纹。',
    choices: [
      { label: '去坊市打听云雷纹刀鞘', outcome: { money: -2, flags: ['d_miemen_1'], text: '王婆眯着眼收了钱：「云雷纹？嘿，这可是大户人家的物件，城西柳府就有一支，不过——听说早叫人抢去了。」' } },
      { label: '把恨意咽回肚里', outcome: {} },
    ],
  },
  {
    id: 'dest_miemen_2',
    title: '黑影再现',
    weight: 20,
    cond: { destiny: 'miemen_chichou', flag: 'd_miemen_1', noFlag: 'd_miemen_2' },
    text: '野林边缘，你看见了一个背影——黑衣，刀鞘云雷纹。他站在树影里，像是在等什么人，也可能，在等你。',
    choices: [
      { label: '拔刀，血债血偿', outcome: { battle: { enemy: 'heidao_ke', lethal: true, onWinFlags: ['d_miemen_2'] } } },
      { label: '强压恨意，退走', outcome: { attrs: { int: 1 }, text: '君子报仇，十年不晚。你在心里把这笔账又记了一遍。' } },
    ],
  },
  {
    id: 'dest_miemen_3',
    title: '仇人遗物',
    weight: 20,
    cond: { destiny: 'miemen_chichou', flag: 'd_miemen_2', noFlag: 'd_miemen_3' },
    text: '黑衣人的尸身旁散落着一只油布包。你解开——是一册刀谱残页，和一封没寄出的信，信上你的乳名刺得你眼睛生疼。',
    choices: [
      { label: '收起一切，祭拜爹娘', outcome: { rep: 10, flags: ['d_miemen_3', 'unlock_origin_veteran'], text: '你在城外给爹娘立了块碑。江湖路远，往事终可告慰。' } },
      { label: '研读那册刀谱残页', req: { attrMin: { atk: 16 } }, outcome: { learn: { id: 'tianwen_jianjue' }, flags: ['d_miemen_3', 'unlock_origin_veteran'], text: '刀谱最后几页竟是传说中的剑诀总纲——原来黑衣人，也曾是你这样的人。' } },
    ],
  },

  // ==================== 身世线·身世之谜 ====================
  {
    id: 'dest_shenshi_1',
    title: '半枚玉扣',
    weight: 20,
    cond: { destiny: 'shenshi_zhimi', noFlag: 'd_shenshi_1' },
    text: '养母临终前把那枚玉扣塞进你手里：「去寻你的根……柳家……」玉扣断口参差，刻着半个「柳」字。',
    choices: [
      { label: '拿着玉扣去坊市打听', outcome: { money: -3, flags: ['d_shenshi_1'], text: '王婆捧着玉扣看了半天，声音都压低了：「柳文远柳老爷的独女，二十年前失散的那个……你先别声张。」' } },
      { label: '收好玉扣，不去想', outcome: {} },
    ],
  },
  {
    id: 'dest_shenshi_2',
    title: '柳府门前',
    weight: 20,
    cond: { destiny: 'shenshi_zhimi', flag: 'd_shenshi_1', noFlag: 'd_shenshi_2' },
    text: '你在柳府门外站了三天。第四天，柳文远的轿子停在了你面前，他盯着你腕上的玉扣，手竟在抖。',
    choices: [
      { label: '掏出玉扣相认', randomOutcomes: [
        { weight: 6, outcome: { flags: ['d_shenshi_2'], money: 50, factions: { shanghui: 30 }, npcs: { liu_wenyuan: 30 }, rep: 5, text: '柳文远老泪纵横：「我的儿……回来就好，回来就好。」当晚你住进了柳府的厢房。' } },
        { weight: 4, outcome: { rep: -2, text: '柳府的管家把玉扣扔了回来：「哪儿来的骗子！」你被家丁推搡出老远。' } },
      ] },
      { label: '不认，转身走', outcome: { attrs: { int: 1 }, text: '富贵是别人的，日子是自己的。你头也不回地走了。' } },
    ],
  },
  {
    id: 'dest_shenshi_3',
    title: '血脉之凭',
    weight: 20,
    cond: { destiny: 'shenshi_zhimi', flag: 'd_shenshi_2', noFlag: 'd_shenshi_3' },
    text: '柳文远带你去见了城中的老族老。老人捧着两枚玉扣合在一起，断口严丝合缝，浑浊的眼里泛起泪光：「是柳家的骨血，错不了。」',
    choices: [
      { label: '认祖归宗', outcome: { money: 100, rep: 10, factions: { shanghui: 30 }, flags: ['d_shenshi_3'], text: '柳家设宴三日，全城皆知柳氏寻回了血脉。你的命，从今日起是另一条命了。' } },
      { label: '只要一个说法，不受家业', outcome: { rep: 15, attrs: { int: 2 }, flags: ['d_shenshi_3'], text: '你谢过族老，婉拒了家产。柳文远看着你的背影，久久没有说话。' } },
    ],
  },
]
