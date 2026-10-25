/** 每日预生成：首个选择确定路线，余下时辰沿路线推进。数值由引擎结算。 */
export type DailyActivity = 'work' | 'meal' | 'train' | 'rest' | 'investigate'
export interface DailyChoice {
  label: string
  activity: DailyActivity
  result: string
  followUp?: string
}
export interface DailyScene {
  title: string
  text: string
  choices: DailyChoice[]
}
export interface DailyContent {
  title: string
  text: string
  routes: {
    locationId: string
    entry: DailyChoice
    stages: DailyScene[]
  }[]
}
export interface DailyPlan extends DailyContent {
  id: string
  day: number
  startSlot: number
  selectedRoute: number | null
  source: 'llm' | 'fallback'
  generationError?: string
}

export function currentDailyScene(life: { dailyPlan?: DailyPlan | null; day: number; slot: number }) {
  const plan = life.dailyPlan
  if (!plan || plan.day !== life.day) return null
  const offset = life.slot - plan.startSlot
  if (offset === 0) return { title: plan.title, text: plan.text, choices: plan.routes.map(r => r.entry) }
  return plan.routes[plan.selectedRoute ?? -1]?.stages[offset - 1] ?? null
}

/** 服务不可用时仍可谋生/休息，不重复向模型请求。 */
export function fallbackDaily(locationId: string, locationName: string, day = 0): DailyContent {
  const stories = [
    { title: '纸包上的旧印', opening: '街边铺子清点货物时，多出一只没有落款的纸包。掌柜当众拆开，里面不是银钱，而是一角印着旧商号的封皮。一个挑担人看清印记后立刻转身，你恰好站在门边，看见他的衣袖沾着与封皮相同的蓝墨。', beats: ['挑担人留下的地址', '墨迹藏住的字', '旧商号的真正来路'], clues: ['挑担人交代，纸包是替旧商号传递的收货凭据', '蓝墨下面另写着一个仓库的旧称', '纸包并非失物，而是一位老伙计留下的求证线索'] },
    { title: '井台下的回声', opening: '有人打水时听见井台下传来金属碰响。邻居抬起松动的石板，取出一枚锈锁和半张发潮的货单。货单上还认得出本地铺子的记号，可问起掌柜，他却坚持那批货从未入库，围观的人开始争执。', beats: ['货单上的记号', '锁扣磨损的方向', '失落的一笔旧账'], clues: ['货单是旧账抄件，并非新近丢失的货物', '锈锁曾被人从内侧反复开启，藏物并非偶然', '旧账确有遗漏，补齐凭据的人可能还在附近'] },
    { title: '被退回的旧信', opening: '一个送信人拿着退回的信封挨户问路。信上地名早已更改，收信人的姓氏却与你昨日听过的名字相近。有人认出信封的折角，说这是旧时同行传递消息的习惯，送信人因此请你帮忙辨认真伪。', beats: ['旧地名的新住户', '折角背后的规矩', '信件终于有了去向'], clues: ['旧地址如今换了住户，原主留下了转交口信', '折角是怕弄错收信人的标识，不是秘密暗号', '信件找到转交人，信主留下的一处旧约值得再问'] },
    { title: '石阶上的半枚脚印', opening: '路边石阶上留着一串深浅不一的泥印，旁边落下一截断绳。一个背篓老人指认有人夜里搬走了他的货，却说不清丢了什么。隔壁伙计拿来一只相似的篓子，两人各执一词，你看出他们记错的可能不只是时间。', beats: ['断绳的另一头', '货篓里的泥沙', '一场误会的缘由'], clues: ['断绳来自搬运用的旧架子，货物未必被偷', '泥沙与近处修路的料堆相同，货篓曾被临时挪走', '老人找回寄放的货物，但谁替他搬过仍有疑问'] },
    { title: '两本不同的账', opening: '掌柜与伙计为了两本账册争得面红耳赤：同一批货，数目却差了一行。围观的人劝他们报官，老伙计则坚持先把交接木牌找齐。你在桌沿发现一处被墨水盖住的改字痕迹，这件事似乎还有另一种解释。', beats: ['漏掉的交接木牌', '被改写的一行字', '账目之外的人情'], clues: ['两本账记录的交接时点不同，不能直接对照', '改字是补录退货，并非凭空多记一笔', '退货的人替同行垫过钱，账目背后还牵着一份人情'] },
    { title: '归客带来的口信', opening: '一个归客在路旁卸下行囊，替同行带来一段口信。听口信的两个人反应截然不同，一人急着走，一人执意留下。归客说他们当年同走过一条路，如今却连约定的地点都说不拢，想请旁人帮着理一理。', beats: ['口信里的遗漏', '旧路换过的名字', '约定有了新的解释'], clues: ['口信中漏了一句托付，两人其实各听到半句话', '他们争执的两个地名指向同一条旧路', '约定可以重新接上，但那位托信人为何迟归尚未说明'] },
  ]
  const story = stories[((day % stories.length) + stories.length) % stories.length]!
  const work: DailyChoice = { label: '帮工换取工钱和饭食', activity: 'work', result: '你接下附近的杂役，做完后领到工钱和饭食。歇脚时，你也听见众人谈论那件新近发生的事。', followUp: story.clues[0] }
  const investigate: DailyChoice = { label: '核对来龙去脉，先查清疑点', activity: 'investigate', result: `你把各人的说法按先后对照，发现争执中漏掉了一件要紧事：${story.clues[0]}。`, followUp: story.clues[0] }
  const rest: DailyChoice = { label: '先歇息，听听旁人的不同说法', activity: 'rest', result: '你在安稳处歇下，没有急着作判断。众人的说法虽然不同，却让你记住了几个可核对的细节。' }
  return {
    title: story.title, text: `你身在${locationName}。${story.opening}`,
    routes: [work, investigate, rest].map((entry, route) => ({
      locationId, entry: { ...entry, label: `留在${locationName}，${entry.label}` },
      stages: story.beats.map((title, stage) => ({
        title, text: `事情没有停在原处。${story.clues[stage]}。${route === 0 ? '做工的人拿来新的物证，请你顺手核对。' : route === 1 ? '先前问过的人补充了自己的见闻，原本含混的说法逐渐清楚。' : '你歇息时听到争执有了下文，有人愿意重新说明经过。'}眼下你可以从旁帮忙，也可以亲自查证，或先养足精神。`,
        choices: [
          { label: `帮忙整理${['凭据', '旧物', '收尾杂务'][stage]}，领取工钱和饭食`, activity: 'work' as const, result: `你帮忙做完手边的活，领到工钱和饭食，也把${title}的经过记清了。${story.clues[stage]}。`, followUp: story.clues[stage] },
          { label: `查证${title}`, activity: 'investigate' as const, result: `你逐一核实说法，终于确定：${story.clues[stage]}。${stage === 2 ? '这件小事已有了阶段性的答案，你记下尚可追问的去向。' : '你把证据和猜测分开记下，不再轻信最初的传闻。'}`, followUp: story.clues[stage] },
          { label: ['歇脚养神，不卷入争执', '练一趟拳，等心绪平稳', '收拾行装，休息恢复'][stage]!, activity: stage === 1 ? 'train' as const : 'rest' as const, result: stage === 1 ? '你找了一处空地练拳，将杂念暂且放下。街边争执渐渐平息，你没有承诺继续插手。' : '你在安稳处休养精神，先照顾自己的身体。这件事暂且交还当事人处理。' },
        ],
      })),
    })),
  }
}
