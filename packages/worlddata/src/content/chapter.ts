import type { ChapterEvent, StoryLocation, StoryNpc } from '@lorecraft/core'

export const CHAPTER_TITLE = '玄灯旧案 · 第一章：故纸藏灯'
export const CHAPTER_PREMISE = '你随身的旧物上，一枚云雷暗纹与十年前玄灯庄的灭门案相连。有人说那是匪徒的标记，有人却在看见它后叫出了你家人的旧姓。查清家人为何被卷入旧案，也决定这份真相应该交给谁。'
export const CHAPTER_LOCATIONS: StoryLocation[] = [
  { id: 'fangshi', name: '钱塘坊市', city: '钱塘', kind: '城内', desc: '药铺、茶楼与消息贩子聚集之处，旧商号的往事仍有人记得。' },
  { id: 'biaoju', name: '威远镖局', city: '钱塘', kind: '城内', desc: '周劲守着一册旧押镖簿。杂役管饭，押镖往事却不是谁都肯谈。' },
  { id: 'matou', name: '钱塘码头', city: '钱塘', kind: '城内', desc: '漕帮与商会在此交接货物，往临安的道路也从这里传来消息。' },
  { id: 'pomin', name: '贫民窟', city: '钱塘', kind: '城内', desc: '你最初落脚之处。老乞丐和流民各有一段不肯轻说的过去。' },
  { id: 'yamen', name: '钱塘衙门街', city: '钱塘', kind: '城内', desc: '铁捕头只认凭据，不凭传闻定罪。街口能听到官府的新告示。' },
  { id: 'linan', name: '临安城', city: '临安', kind: '城内', desc: '府学、档案房与铁匠铺比邻而立。十年前的旧案卷宗仍有副本。' },
  { id: 'ferry', name: '芦苇渡', city: '钱塘', kind: '城外', desc: '老船夫温九认得十年前运过的人与物，但他的船不会永远留在这里。' },
  { id: 'old_estate', name: '玄灯庄遗址', city: '钱塘', kind: '城外', desc: '焚毁的院墙下留着暗格。旧案的物证需亲自核对，而非只听故事。' },
  { id: 'yelin', name: '黑松林', city: '钱塘', kind: '城外', desc: '采药人与猎户走出的小径，能找到回春堂急缺的药草。' },
  { id: 'shuiguan', name: '水关驿道', city: '临安', kind: '城外', desc: '两城之间的旧商路。商贩丁绣正在核对失踪的交接木牌。' },
  { id: 'sword_camp', name: '青竹试剑坪', city: '临安', kind: '城外', desc: '铁剑门弟子在此练剑，讲门槛，也愿意给不仗势的人一次机会。' },
  { id: 'shrine', name: '归云祠', city: '临安', kind: '城外', desc: '玄灯庄故人最后约定的地方。旧案将在这里迎来一个结果。' },
]

// 背景为公开身份；真正的旧案答案通过任务获取，不在人物名册提前泄露。
export const CHAPTER_NPCS: StoryNpc[] = [
  { id: 'zhou_jin', name: '周劲', gender: '男', locationId: 'biaoju', faction: 'shanghui', role: '威远镖局二镖头', background: '十年前押过玄灯庄的一趟夜镖，负伤归来后不再领头走夜路。他把每次交接都记在册中。', goal: '保住仍活着的同行，并弄清那趟镖究竟护了什么。', likes: ['认真做事', '守约'], boundary: '不出卖托付自己的人。', ties: [{ id: 'lao_wang', text: '多年同事，曾替他遮掩伤势' }, { id: 'wen_jiu', text: '夜镖交接时见过的船夫' }] },
  { id: 'lao_wang', name: '老王', gender: '男', locationId: 'biaoju', faction: null, role: '镖局厨工', background: '给镖师们做了二十年饭，腰伤使他挑不动水，却记得每位归来者是否吃得下饭。', goal: '让手下的年轻杂役有饭吃，也保住这份差事。', likes: ['帮忙添柴', '不浪费饭食'], boundary: '不拿灶房的粮食换人情。', ties: [{ id: 'zhou_jin', text: '信任他的人品' }, { id: 'sun_guanshi', text: '常为柴米用度争执' }] },
  { id: 'sun_guanshi', name: '孙管事', gender: '男', locationId: 'biaoju', faction: 'shanghui', role: '镖局管事', background: '从趟子手做到管事，精打细算的背后是一次险些拖垮镖局的赔镖。', goal: '不让旧案再牵连镖局。', likes: ['账目清楚', '准时交差'], boundary: '不能私自翻账。', ties: [{ id: 'liu_wenyuan', text: '要向商会解释每笔用度' }, { id: 'zhou_jin', text: '尊重身手，却不赞成追查' }] },
  { id: 'bai_lu', name: '白露', gender: '女', locationId: 'fangshi', faction: 'shanghui', role: '回春堂掌柜', background: '接过父亲的药铺，也接下许多穷人的赊账。父亲曾为玄灯庄伤者开过药方。', goal: '治病救人，不让旧处方成为栽赃证据。', likes: ['认药仔细', '不欺病弱'], boundary: '药不能拿来试毒。', ties: [{ id: 'lin_zhiyuan', text: '曾替他的母亲看病' }, { id: 'wang_po', text: '会互相转告街坊的难处' }] },
  { id: 'liu_wenyuan', name: '柳文远', gender: '男', locationId: 'fangshi', faction: 'shanghui', role: '钱塘商会会长', background: '靠水陆转运起家，资助过玄灯庄，也在事发后接手过商路。', goal: '守住商会生意，避免旧案掀翻两城信用。', likes: ['有凭有据', '顾全同行'], boundary: '不会接受空口指控。', ties: [{ id: 'ding_xiu', text: '倚重的商路交接人' }, { id: 'tie_butou', text: '合作也互相提防' }] },
  { id: 'tie_butou', name: '铁捕头', gender: '男', locationId: 'yamen', faction: 'guanfu', role: '钱塘捕头', background: '办过玄灯庄案外围的盘查，对当年的仓促结案一直耿耿于怀。', goal: '用能对质的证据重查，避免再牵连无辜。', likes: ['保护证人', '证词一致'], boundary: '私刑得来的口供不能用。', ties: [{ id: 'lin_zhiyuan', text: '能借阅副卷的旧识' }, { id: 'liu_wenyuan', text: '旧案中的重要知情人' }] },
  { id: 'wang_po', name: '王婆', gender: '女', locationId: 'fangshi', faction: null, role: '消息贩子', background: '半辈子替人找工、说亲、传话，知道传闻如何从一句实话变成十句谎言。', goal: '靠消息吃饭，但不愿害死替她作证的人。', likes: ['小额现钱', '尊重消息来源'], boundary: '不免费交出活人的藏身地。', ties: [{ id: 'bai_lu', text: '受过她的照顾' }, { id: 'qin_yueniang', text: '彼此交换消息' }] },
  { id: 'lao_qigai', name: '老乞丐', gender: '男', locationId: 'pomin', faction: null, role: '破庙栖身者', background: '疯癫与清醒交替，认得许多旧门派的手势，却从不肯解释来历。', goal: '看清接近自己的年轻人究竟要什么。', likes: ['分食', '守口如瓶'], boundary: '不能以弱者取乐。', ties: [{ id: 'xuanzhen', text: '偶尔提起的故人' }] },
  { id: 'wen_jiu', name: '温九', gender: '男', locationId: 'ferry', faction: null, role: '芦苇渡船夫', background: '十年前送过一群负伤的夜行人，船上的血迹刷了很久才去掉。', goal: '离开旧案纷争，让家人安稳生活。', likes: ['替人留后路', '说话算数'], boundary: '不拿家人性命冒险。', ties: [{ id: 'zhou_jin', text: '认得当年的押镖人' }, { id: 'he_yidao', text: '曾在渡口受他庇护' }] },
  { id: 'lin_zhiyuan', name: '林知远', gender: '男', locationId: 'linan', faction: 'guanfu', role: '临安档案书吏', background: '习惯把每份移交文书誊成副本，因而保住了几页未被销毁的旧案记录。', goal: '让卷宗经得起核对，又不使家人遭报复。', likes: ['书面引荐', '敬重法度'], boundary: '不能偷改案卷。', ties: [{ id: 'bai_lu', text: '感念救母之恩' }, { id: 'tie_butou', text: '同样不满旧案缺漏' }] },
  { id: 'lu_qiao', name: '鲁桥', gender: '男', locationId: 'linan', faction: null, role: '临安铁匠', background: '从断口、淬色判断兵器来历，曾为玄灯庄修过不带门派印记的刀。', goal: '靠手艺立身，不替人遮掩凶器来源。', likes: ['爱惜兵器', '出力帮工'], boundary: '不做暗器害人。', ties: [{ id: 'he_yidao', text: '替他修过刀' }, { id: 'shen_yan', text: '常来请教剑坯' }] },
  { id: 'ding_xiu', name: '丁绣', gender: '女', locationId: 'shuiguan', faction: 'shanghui', role: '商路交接人', background: '接替亡父走两城商路，能从一枚木牌看出货物经过哪道关。', goal: '找回失落的交接木牌，证明自己没有吞货。', likes: ['核对细节', '公平分账'], boundary: '不替货主背不明的罪。', ties: [{ id: 'liu_wenyuan', text: '出资的东家' }, { id: 'sun_zhanggui', text: '常替她留一间房' }] },
  { id: 'shen_yan', name: '沈砚', gender: '男', locationId: 'sword_camp', faction: 'tiejianmen', role: '铁剑门弟子', background: '天资平常，靠反复练基本功入门，不喜欢以门派名头压人。', goal: '查清师门旧剑印为何出现在案卷里。', likes: ['扎实基本功', '愿意认错'], boundary: '不容冒用师门行事。', ties: [{ id: 'shen_tiexiao', text: '敬畏的掌门' }, { id: 'lu_qiao', text: '请教铸剑的前辈' }] },
  { id: 'shen_tiexiao', name: '沈铁箫', gender: '男', locationId: 'sword_camp', faction: 'tiejianmen', role: '铁剑门掌门', background: '曾派弟子护送案中证人，事后失去两名门人，从此格外看重规矩。', goal: '护住门人名节，不让旧恨变成滥杀。', likes: ['克制', '苦练'], boundary: '不许私仇冒充门规。', ties: [{ id: 'shen_yan', text: '正在考察的弟子' }, { id: 'xuanzhen', text: '对旧案各执一词的故交' }] },
  { id: 'xuanzhen', name: '玄真', gender: '男', locationId: 'shrine', faction: null, role: '归云祠守祠人', background: '离开江湖后守着祠中无名牌位，熟知旧案幸存者的约定。', goal: '让后来者自己决定如何对待真相。', likes: ['诚实', '不强迫他人'], boundary: '不替任何一方伪造证词。', ties: [{ id: 'lao_qigai', text: '多年未见的故人' }, { id: 'shen_tiexiao', text: '共同祭过失踪门人' }] },
  { id: 'lu_zhanpeng', name: '陆展鹏', gender: '男', locationId: 'matou', faction: 'caobang', role: '漕帮堂主', background: '靠义气聚起脚夫，也知道义气有时会成为遮掩错事的借口。', goal: '保住码头兄弟，不替商会无条件顶罪。', likes: ['讲义气', '亲自做事'], boundary: '不弃同伴独逃。', ties: [{ id: 'wen_jiu', text: '曾照拂的老船夫' }, { id: 'liu_wenyuan', text: '生意往来频繁' }] },
  { id: 'qin_yueniang', name: '秦月娘', gender: '女', locationId: 'fangshi', faction: null, role: '醉仙楼歌者', background: '替人唱过庆功曲，也看过席间的人忽然失踪。她记人比记曲更牢。', goal: '让自己和身边人不再成为权势的消遣。', likes: ['认真倾听', '不问伤心事取乐'], boundary: '不会替客人牵线害人。', ties: [{ id: 'wang_po', text: '互相照应的消息来源' }] },
  { id: 'sun_zhanggui', name: '孙掌柜', gender: '男', locationId: 'linan', faction: 'shanghui', role: '悦来客栈掌柜', background: '掌柜做得圆滑，住客欠下的房钱却从不抹去名字，以防有人从此失踪。', goal: '让客栈始终有安全落脚之处。', likes: ['按约付账', '体恤伙计'], boundary: '不出卖客人的房号。', ties: [{ id: 'ding_xiu', text: '常年住客' }, { id: 'lin_zhiyuan', text: '偶尔借书的邻居' }] },
  { id: 'he_yidao', name: '何一刀', gender: '男', locationId: 'old_estate', faction: null, role: '独行刀客', background: '曾追查一个错误的仇人，等知道真相时，已没有机会道歉。', goal: '阻止后来者重走自己的路。', likes: ['直言', '刀下留人'], boundary: '不肯为传闻杀人。', ties: [{ id: 'lu_qiao', text: '信任的修刀人' }, { id: 'wen_jiu', text: '曾救过自己的船夫' }] },
  { id: 'a_zhu', name: '阿竹', gender: '女', locationId: 'yelin', faction: null, role: '采药人', background: '跟猎户长大，辨得清林中药草，也认得巡夜人留下的足迹。', goal: '守住山林生计，不让采药人成为帮派耳目。', likes: ['不滥采', '照顾伤者'], boundary: '不带人追杀落难者。', ties: [{ id: 'bai_lu', text: '收药时从不克扣的掌柜' }, { id: 'he_yidao', text: '在林中见过的负伤人' }] },
]

export const CHAPTER_EVENTS: ChapterEvent[] = [
  { id: 's_letter', title: '旧物上的云雷纹', kind: 'main', locationId: null, npcIds: [], summary: '先决定是否追查与你家人相关的旧案。', requires: [], excludes: ['s_awake'], text: '你整理旧物时发现，旧物夹层的暗纹在侧光下连成了一盏灯。随物留下的纸条只有一句话：“若有人说我们是匪，去问威远镖局的周劲。”纸条末尾标着归云祠的旧约。你可以追查，也可以把它收好，继续自己的日子。', choices: [
    { id: 'trace', label: '追查旧姓，去找周劲', outcome: { flags: ['s_awake'], text: '你把纸条折好。第一步很清楚：去钱塘的威远镖局，找周劲核对那趟旧镖。三日内去问，旧押镖簿还来得及留下。' } },
    { id: 'decline', label: '暂不卷入，把旧物收起', outcome: { flags: ['s_awake', 's_refused'], text: '你决定不主动寻周劲。这不使旧案停止：几日后，镖局与渡口仍会发生变化。你可以只听传闻，也可以日后从别的入口调查。' } },
  ] },
  { id: 's_escort', title: '周劲的夜镖簿', kind: 'main', locationId: 'biaoju', npcIds: ['zhou_jin', 'lao_wang'], summary: '三日内找周劲，保住旧镖簿的证词。', requires: ['s_awake'], excludes: ['s_trail', 's_refused'], deadline: 12,
    expire: { flags: ['s_trail', 's_ledger_burned'], text: '威远镖局清理旧账，一册夜镖簿付之一炬。周劲被调走。街坊传出：旧案最后一次交接在芦苇渡；没参与的人也听到了这条消息。' },
    text: '周劲看清暗纹后，手指停在那页夜镖记录上。“你家人那晚护着的，不是赃货，是一份能救人的账。”孙管事已催他销毁旧簿。他愿意让你抄下交接印记，但希望你先帮老王做完眼前的活，证明你能守约，而非只图一句惊人的故事。', choices: [
      { id: 'help', label: '帮老王完成杂役，再抄交接印', outcome: { money: 2, food: 2, npcs: { zhou_jin: 8, lao_wang: 5 }, flags: ['s_trail', 's_seal_witness'], text: '你挑完水、添足柴，老王给你留了饭和工钱。周劲将交接印拓在纸上：船夫温九，芦苇渡。你有了证词，不必靠猜测寻找下一步。' } },
      { id: 'press', label: '以身手担保，直接索要拓印（武力 7）', req: { attrMin: { atk: 7 } }, outcome: { npcs: { zhou_jin: 3 }, flags: ['s_trail', 's_seal_witness'], text: '你稳稳接住周劲递来的棍势。他认可你能护住拓印，把芦苇渡的交接记录交给了你。' } },
      { id: 'decline', label: '不接这份托付，记住渡口便走', outcome: { flags: ['s_trail', 's_witness_refused'], text: '你没有拿走拓印，也没答应保护证人。周劲仍告诉你渡口的名字，随后合上旧簿。将来揭案时，少了这份证词会有影响。' } },
    ] },
  { id: 's_ferry', title: '温九要离开了', kind: 'main', locationId: 'ferry', npcIds: ['wen_jiu'], summary: '六日内到芦苇渡，核对旧案交接。', requires: ['s_trail'], excludes: ['s_manifest'], deadline: 24,
    expire: { flags: ['s_manifest', 's_boat_gone'], text: '温九带着家人离开芦苇渡。留下的告示说，旧案货物曾在玄灯庄的东墙交接。证人已经走远，遗址却仍可调查。' },
    text: '温九已把家当装船，见到你手里的旧纹便沉下脸。“我可以说那晚发生了什么，但别把我留在风口上。”他能指认交接人，也知道玄灯庄东墙的暗格。你若不愿接下保护证人的责任，仍可自行调查，只是日后不能声称他愿意出面。', choices: [
      { id: 'protect', label: '替他安排离开，留下书面证词（2 两）', req: { money: 2 }, outcome: { money: -2, npcs: { wen_jiu: 10 }, flags: ['s_manifest', 's_witness_saved'], text: '你付清船夫欠的泊船钱，让他与家人离开。温九留下签押证词：所谓“匪徒”其实在护送人证与账册，玄灯庄东墙还有交接暗格。' } },
      { id: 'observe', label: '只核对船上的旧印，自行去查', outcome: { flags: ['s_manifest'], text: '你没有留下他。船印与东墙交接记号相合，足以指路，却不足以代替温九本人作证。下一站是玄灯庄遗址。' } },
      { id: 'decline', label: '不再追问，让他安稳离开', outcome: { flags: ['s_manifest', 's_abandoned'], text: '温九谢你没有逼问，只把玄灯庄东墙的位置画在泥上。你没有增加一个证人，但也没有使他的家人陷入危险。' } },
    ] },
  { id: 's_ruins', title: '玄灯庄的余烬', kind: 'main', locationId: 'old_estate', npcIds: ['he_yidao'], summary: '到庄园东墙寻找物证，能力决定调查方式。', requires: ['s_manifest'], excludes: ['s_house'], after: 8,
    text: '倒塌的东墙下，何一刀拦住你要砸开石匣的手：“先想清楚，你要的是证据，还是一个能恨的人？”暗格中有焦黑账页与两种印泥。一种来自商会，一种是护送人的私印。保住原物比带走一堆碎片更有用。', choices: [
      { id: 'careful', label: '辨认印泥，完整取出账页（智力 6）', req: { attrMin: { int: 6 } }, outcome: { flags: ['s_house', 's_evidence'], npcs: { he_yidao: 5 }, text: '你沿封缝取出账页，辨出“转移人证”被涂改成了“转运赃货”。家人曾参与护送而非劫掠。何一刀提醒，仍需临安的案卷副本与它互证。' } },
      { id: 'lift', label: '移开断梁，保护原物（武力 7）', req: { attrMin: { atk: 7 } }, outcome: { flags: ['s_house', 's_evidence'], text: '你托住断梁，让何一刀取出原账页。没有毁掉的物证能与临安副卷相互核对。' } },
      { id: 'copy', label: '量力而行，记下残页上的名字', outcome: { flags: ['s_house'], text: '你没有冒险毁坏暗格，只抄下还能认出的名字与印记。这是一条可靠的寻人线索，却不能冒充完整原件。去临安档案房仍能追问。' } },
    ] },
  { id: 's_archive', title: '临安副卷', kind: 'main', locationId: 'linan', npcIds: ['lin_zhiyuan'], summary: '十一日内查副卷；白露的引荐或阅卷费能取得正式抄件。', requires: ['s_house'], excludes: ['s_record'], deadline: 44,
    expire: { flags: ['s_record', 's_record_sealed'], text: '临安档案房奉令封存玄灯旧案。公告留下了归云祠的结案会谈日期。没有取得副卷的人，仍可到场听见最终说法。' },
    text: '林知远翻到你指出的名字，没有立刻把卷宗推过来。“证据要有来历，抄件要有签押。我要知道你会不会把一个名字当成杀人的借口。”副卷记着家人受命保护证人的经过，正式抄件可以洗去污名，口头转述则只能让你自己更接近答案。', choices: [
      { id: 'letter', label: '出示回春堂引荐，取得签押副本', requires: ['s_bailu_letter'], outcome: { flags: ['s_record', 's_record_proof'], npcs: { lin_zhiyuan: 8 }, text: '白露的引荐使林知远愿意负责签押。副卷写明：家人被列入匪籍，是因为护送证人的名字被调换。这份副本足以进入正式对质。' } },
      { id: 'pay', label: '依法付抄录费，取得签押副本（5 两）', req: { money: 5 }, outcome: { money: -5, flags: ['s_record', 's_record_proof'], text: '你按规缴费，带走可核验的正式抄件。归云祠的会谈时间已记入目标，请按约定的开放时间与期限前往。' } },
      { id: 'listen', label: '不取副本，只听他说明经过', outcome: { flags: ['s_record'], text: '林知远解释了调换名册的经过，但未交给你可公开使用的抄件。你知道了家人并非匪徒，却还要决定是否在归云祠争取一个公开结果。' } },
    ] },
  { id: 's_meeting', title: '归云祠的灯', kind: 'main', locationId: 'shrine', npcIds: ['xuanzhen', 'tie_butou', 'liu_wenyuan'], summary: '章节开启四日后可赴约，十三日后结束；决定把真相交给谁。', requires: ['s_record'], excludes: ['s_concluded'], after: 16, deadline: 52,
    expire: { flags: ['s_concluded'], ending: '未赴的灯约', text: '归云祠的旧案会谈结束。官府以证据不足维持旧说，幸存者各自散去。你后来听见了这个结果；世界没有等待你，但你仍可带着所知继续生活。' },
    text: '祠中点起三盏灯。铁捕头等着能核验的证据，柳文远想私下补偿，玄真只问你：“知道家人为何受冤之后，你还想替谁把这盏灯留下？”你能够选择的结果取决于真正取得的物证，不取决于一句漂亮的说辞。', choices: [
      { id: 'clear', label: '提交原账与签押副卷，公开洗冤', requires: ['s_evidence', 's_record_proof'], outcome: { rep: 10, npcs: { tie_butou: 15 }, flags: ['s_concluded'], text: '原账与副卷相互印证。铁捕头接下重查，撤回对护送人的匪籍记载。你家人的名字第一次被公开写在保护证人的名册上。这不是全部幕后真相，却已为第一章划下清楚的一笔。' }, ending: '灯照归名' },
      { id: 'witness', label: '交出已有线索，请捕头继续追查', outcome: { rep: 3, npcs: { tie_butou: 5 }, flags: ['s_concluded'], text: '你的线索被登记为重查依据，尚不足以公开改判。铁捕头答应按线索查下去。你得到了真实但不完整的答案，也为旧案留下了一条正式追索的路。' }, ending: '未尽的案卷' },
      { id: 'private', label: '接受私下赔偿，不再公开追查', outcome: { money: 15, npcs: { liu_wenyuan: 5 }, flags: ['s_concluded'], text: '柳文远付了赔偿，家人的清白仍未写入公文。你保住了生活，也承担了放下公开追查的结果。玄真没有评判，只替你熄了一盏灯。' }, ending: '收灯入怀' },
      { id: 'leave', label: '不交出线索，带着答案离开', outcome: { flags: ['s_concluded'], text: '你没有替任何一方背书。外界仍有不同说法，而你带着自己的判断离开归云祠。这是你对旧案的选择，不是故事忘了给出结果。' }, ending: '独行知归' },
    ] },
  { id: 'sq_wang', title: '灶房不该断粮', kind: 'side', locationId: 'biaoju', npcIds: ['lao_wang'], summary: '帮老王交班，获得工钱、饭食与信任。', requires: [], excludes: ['sq_wang_done'], text: '老王的腰又疼起来，柴、水和米都在眼前，却没人把它们送进灶房。他不求你白做，只想有人认真交完这一班。', choices: [
    { id: 'help', label: '挑水添柴，做完交班', outcome: { money: 3, food: 3, npcs: { lao_wang: 8 }, flags: ['sq_wang_done'], text: '灶上有了热饭，你领到三两工钱。老王记住了你的可靠，提起周劲只信亲眼见过的事，不信风声。' } },
    { id: 'decline', label: '说明自己有事，不接这班活', outcome: { flags: ['sq_wang_done'], text: '你没有答应。老王请了另一个杂役，饭照常开，你也没有被算成欠他一份人情。' } },
  ] },
  { id: 'sq_herb', title: '黑松林的药草', kind: 'side', locationId: 'yelin', npcIds: ['a_zhu'], summary: '帮采药人整理药草，再带到回春堂。', requires: [], excludes: ['s_herb'], text: '阿竹把相似的两种草分放在石上，不愿让急着交货的人混装。白露正在等这批伤药。你可以花些工夫帮她认清，也可以只负责整理和搬运。', choices: [
    { id: 'sort', label: '按她指点整理，带药回城', outcome: { food: 1, npcs: { a_zhu: 5 }, flags: ['s_herb'], text: '你耐心分好药草，阿竹把封好的药包交给你，并留下一块干粮。下一步去钱塘坊市找白露，药草不会凭空变成银钱。' } },
  ] },
  { id: 'sq_bailu', title: '回春堂的引荐', kind: 'side', locationId: 'fangshi', npcIds: ['bai_lu'], summary: '送回药包，取得临安档案房的引荐。', requires: ['s_herb'], excludes: ['s_bailu_letter'], text: '白露逐包核对药草，确认阿竹没有把相似的毒草混进来。听说你要核对玄灯旧案，她提起临安的林知远：比起钱，他更相信救过母亲的人写的信。', choices: [
    { id: 'deliver', label: '交药包，坦言想查旧案', outcome: { money: 4, npcs: { bai_lu: 10 }, rep: 2, flags: ['s_bailu_letter'], text: '白露付清四两跑腿钱，写下一封引荐。你可以凭它在临安取得正式副卷，无需另付五两抄录费。' } },
  ] },
  { id: 'sq_smith', title: '鲁桥的断刀', kind: 'side', locationId: 'linan', npcIds: ['lu_qiao'], summary: '帮铁匠整理刀坯，获得钱粮与识器经验。', requires: [], excludes: ['sq_smith_done'], text: '鲁桥要把一批卷刃刀坯重新分类。刀上的印记与伤痕比传闻可靠，他愿意让肯出力的人亲自看。', choices: [
    { id: 'work', label: '做完刀坯整理，请教断口', outcome: { money: 3, food: 2, attrs: { def: 1 }, npcs: { lu_qiao: 6 }, flags: ['sq_smith_done'], text: '你领了工钱和饭食，也学会用布护住刀口。鲁桥提醒，门派印记能被仿造，只有来源与实物互证才可信。' } },
  ] },
  { id: 'sq_trade', title: '丁绣的交接木牌', kind: 'side', locationId: 'shuiguan', npcIds: ['ding_xiu'], summary: '核对商路账目，获得声望与盘缠。', requires: [], excludes: ['sq_trade_done'], text: '丁绣把两城货单摆开，缺的不是整车货，而是一枚被错记日期的交接木牌。替她理顺此事，会有人记得你不轻易认定同行是贼。', choices: [
    { id: 'check', label: '逐项核对，指出交接日期错误', outcome: { money: 4, rep: 2, npcs: { ding_xiu: 8 }, flags: ['sq_trade_done'], text: '木牌归到正确的货单，丁绣洗清吞货嫌疑。她付你四两盘缠，并把你记作往后能托付交接的人。' } },
  ] },
  { id: 'sq_sword', title: '沈砚的试剑', kind: 'side', locationId: 'sword_camp', npcIds: ['shen_yan', 'shen_tiexiao'], summary: '武力 7 或智力 6 时可获基础剑法；也能先做准备。', requires: [], excludes: ['sq_sword_done'], text: '沈砚不用名头压你，只问肯不肯扎实练完基本步。掌门在远处看着，不插手，也不会凭一句奉承就收人入门。', choices: [
    { id: 'practice', label: '以基本功过招（武力 7）', req: { attrMin: { atk: 7 } }, outcome: { learn: { id: 'qingzhu_jian' }, npcs: { shen_yan: 8 }, flags: ['sq_sword_done'], text: '沈砚认可你的基本功，把青竹剑的入门式拆给你看。你学到一门剑法，并没有因此自动成为门派亲传。' } },
    { id: 'study', label: '辨认步法的变化（智力 6）', req: { attrMin: { int: 6 } }, outcome: { learn: { id: 'qingzhu_jian' }, npcs: { shen_yan: 8 }, flags: ['sq_sword_done'], text: '你说清步法转折，沈砚愿意传授入门式，并约你练稳后再来。' } },
    { id: 'wait', label: '今日不试，准备好再来', outcome: { text: '你没有勉强。试剑机会仍在，可先练武或读书，再按门槛回来。' } },
  ] },
]
