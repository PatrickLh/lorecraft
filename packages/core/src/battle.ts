/**
 * 战斗引擎（requirement §4，代码权威）：纯函数结算，LLM 只演绎 facts。
 * 顺序：敏捷高者先手（同值玩家先）；每回合先回气，再结算双方动作。
 */
import {
  CRIT_MULT,
  CRIT_RATE_BASE,
  CRIT_RATE_MAX,
  CRIT_RATE_PER_AGI,
  DEFEND_DMG_MULT,
  DEFEND_MP_BONUS,
  DODGE_MAX,
  DODGE_MIN,
  DODGE_PER_AGI_DIFF,
  FLEE_BASE,
  FLEE_MAX,
  FLEE_MIN,
  FLEE_PER_AGI,
  MARTIAL_LEVEL_COEFF,
  MIN_DMG,
  MP_REGEN_BASE,
  QINGGONG_DODGE_PER_LEVEL,
  QINGGONG_FLEE_PER_LEVEL,
} from './constants.js'
import type {
  BattleCommand,
  BattleState,
  EnemyDef,
  EnemyInstance,
  EnemyTendency,
  LifeState,
  MartialDef,
  RoundLog,
} from './types.js'

export type Rng = () => number

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function ownedMartial(life: LifeState, id: string): { id: string; level: 0 | 1 | 2 } | undefined {
  return life.martials.find((m) => m.id === id)
}

/** 已学的某类武学最高等级（内功/轻功加成用） */
export function maxCategoryLevel(life: LifeState, defs: Map<string, MartialDef>, category: string): number {
  let lvl = -1
  for (const m of life.martials) {
    const def = defs.get(m.id)
    if (def?.category === category) lvl = Math.max(lvl, m.level)
  }
  return lvl // -1 = 未学
}

function neigongLevel(life: LifeState, defs: Map<string, MartialDef>): number {
  const l = maxCategoryLevel(life, defs, 'neigong')
  return l < 0 ? 0 : l
}

function qinggongLevel(life: LifeState, defs: Map<string, MartialDef>): number {
  const l = maxCategoryLevel(life, defs, 'qinggong')
  return Math.max(0, l)
}

export function startBattle(
  enemyDef: EnemyDef,
  context?: { onWinFlags?: string[]; onLoseFlags?: string[] }
): BattleState {
  const enemy: EnemyInstance = {
    defId: enemyDef.id,
    name: enemyDef.name,
    hp: enemyDef.hp,
    maxHp: enemyDef.hp,
    atk: enemyDef.atk,
    def: enemyDef.def,
    agi: enemyDef.agi,
    tendency: enemyDef.tendency,
    lethal: enemyDef.lethal,
  }
  return {
    enemy,
    turn: 0,
    playerFirst: true, // 由调用方按敏捷覆盖
    finished: false,
    result: null,
    rounds: [],
    context,
  }
}

/** 依据双方敏捷决定先手（同值玩家先） */
export function resolvePlayerFirst(life: LifeState, battle: BattleState): BattleState {
  return { ...battle, playerFirst: life.attrs.agi >= battle.enemy.agi }
}

function dodgeChance(defenderAgi: number, attackerAgi: number, qLevel: number): number {
  return clamp(
    DODGE_MIN + (defenderAgi - attackerAgi) * DODGE_PER_AGI_DIFF + qLevel * QINGGONG_DODGE_PER_LEVEL,
    0,
    DODGE_MAX
  )
}

function critChance(attackerAgi: number, defenderAgi: number): number {
  return clamp(CRIT_RATE_BASE + (attackerAgi - defenderAgi) * CRIT_RATE_PER_AGI, CRIT_RATE_BASE, CRIT_RATE_MAX)
}

function rawDamage(atk: number, mul: number, levelCoeff: number, def: number, breakDef: boolean): number {
  const effDef = breakDef ? def * 0.2 : def
  return Math.max(MIN_DMG, Math.round(atk * mul * levelCoeff - effDef))
}

export interface BattleTurnResult {
  life: LifeState
  battle: BattleState
  round: RoundLog
  /** 本回合玩家指令非法（真气不足等），未消耗回合 */
  invalid?: string
}

/**
 * 结算一个战斗回合。返回新 life/battle；胜负由 finished/result 表达，
 * 后果（战利品/重伤/死亡）由上层 applyBattleConsequences 处理。
 */
export function battleTurn(
  life: LifeState,
  battle: BattleState,
  cmd: BattleCommand,
  martialDefs: Map<string, MartialDef>,
  rng: Rng
): BattleTurnResult {
  if (battle.finished) return { life, battle, round: emptyRound(battle) , invalid: '战斗已结束' }
  const facts: string[] = []
  let playerHp = life.attrs.hp
  let playerMp = life.attrs.mp
  const enemy = { ...battle.enemy }
  const nLevel = neigongLevel(life, martialDefs)
  const qLevel = qinggongLevel(life, martialDefs)

  // ---- 回气 ----
  const regen = MP_REGEN_BASE + nLevel
  playerMp = Math.min(life.attrs.maxMp, playerMp + regen)
  facts.push(`你调匀呼吸，真气恢复 ${regen} 点（${playerMp}/${life.attrs.maxMp}）`)

  // ---- 玩家动作 ----
  let defending = false
  if (cmd.kind === 'skill') {
    const def = martialDefs.get(cmd.martialId)
    const entry = ownedMartial(life, cmd.martialId)
    if (!def || !entry) {
      return { life, battle, round: emptyRound(battle), invalid: '你尚未习得这门武学' }
    }
    if (def.mpCost > playerMp) {
      return {
        life,
        battle,
        round: emptyRound(battle),
        invalid: `真气不足（需 ${def.mpCost}，现有 ${playerMp}）`,
      }
    }
    playerMp -= def.mpCost
    facts.push(`你使出「${def.name}」，耗真气 ${def.mpCost} 点`)
    resolveStrike({
      facts,
      rng,
      attacker: 'player',
      atk: life.attrs.atk,
      defenderAgi: enemy.agi,
      def: enemy.def,
      mul: def.powerMul,
      levelCoeff: MARTIAL_LEVEL_COEFF[entry.level] ?? 1,
      effect: def.effect,
      enemyRef: enemy,
      qLevel: 0,
    })
  } else if (cmd.kind === 'attack') {
    facts.push('你抢步出招，一记普通攻击')
    resolveStrike({
      facts,
      rng,
      attacker: 'player',
      atk: life.attrs.atk,
      defenderAgi: enemy.agi,
      def: enemy.def,
      mul: 1,
      levelCoeff: 1,
      effect: undefined,
      enemyRef: enemy,
      qLevel: 0,
    })
  } else if (cmd.kind === 'defend') {
    defending = true
    playerMp = Math.min(life.attrs.maxMp, playerMp + DEFEND_MP_BONUS)
    facts.push(`你摆出门户严守的架势（本回合受伤减半，真气额外恢复 ${DEFEND_MP_BONUS} 点）`)
  } else {
    // flee
    const chance = clamp(
      FLEE_BASE + (life.attrs.agi - enemy.agi) * FLEE_PER_AGI + qLevel * QINGGONG_FLEE_PER_LEVEL,
      FLEE_MIN,
      FLEE_MAX
    )
    if (rng() < chance) {
      facts.push('你虚晃一招，趁着空隙脱身而去')
      return finishBattle(life, playerMp, { ...battle, finished: true, result: 'fled' }, facts, playerHp)
    }
    facts.push('你想要脱身，却被对方缠住，脱身失败')
  }

  // ---- 敌方动作（若未倒下） ----
  if (enemy.hp > 0) {
    const acts = enemyActs(enemy.tendency, rng)
    if (acts === 'rest') {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + 2)
      facts.push(`${enemy.name}缓了口气，恢复 2 点生命（${enemy.hp}/${enemy.maxHp}）`)
    } else if (acts === 'defend') {
      facts.push(`${enemy.name}收缩门户，转为守势`)
      resolveStrike({
        facts,
        rng,
        attacker: 'enemy',
        atk: enemy.atk,
        defenderAgi: life.attrs.agi,
        def: life.attrs.def,
        mul: 1,
        levelCoeff: 1,
        effect: undefined,
        enemyRef: null,
        qLevel,
        onPlayerHp: (dmg) => {
          const taken = Math.max(1, Math.round(dmg * (defending ? DEFEND_DMG_MULT : 1)))
          playerHp -= taken
          return taken
        },
        defending,
      })
    } else {
      resolveStrike({
        facts,
        rng,
        attacker: 'enemy',
        atk: enemy.atk,
        defenderAgi: life.attrs.agi,
        def: life.attrs.def,
        mul: 1,
        levelCoeff: 1,
        effect: undefined,
        enemyRef: null,
        qLevel,
        onPlayerHp: (dmg) => {
          const taken = Math.max(1, Math.round(dmg * (defending ? DEFEND_DMG_MULT : 1)))
          playerHp -= taken
          return taken
        },
        defending,
      })
    }
  }

  // ---- 回合收束 ----
  const nextLife: LifeState = { ...life, attrs: { ...life.attrs, hp: Math.max(0, playerHp), mp: playerMp } }
  let result: BattleState['result'] = null
  let finished = false
  if (enemy.hp <= 0) {
    finished = true
    result = 'win'
    facts.push(`${enemy.name}力竭倒地，你胜了`)
  } else if (playerHp <= 0) {
    finished = true
    result = 'lose'
    facts.push('你眼前一黑，倒了下来')
  }

  const round: RoundLog = {
    turn: battle.turn + 1,
    facts,
    playerHp: Math.max(0, playerHp),
    enemyHp: Math.max(0, enemy.hp),
  }
  const nextBattle: BattleState = {
    ...battle,
    enemy,
    turn: battle.turn + 1,
    finished,
    result,
    rounds: [...battle.rounds, round],
  }
  return { life: nextLife, battle: nextBattle, round }
}

function finishBattle(
  life: LifeState,
  mp: number,
  battle: BattleState,
  facts: string[],
  playerHp: number
): BattleTurnResult {
  const round: RoundLog = { turn: battle.turn + 1, facts, playerHp, enemyHp: battle.enemy.hp }
  return {
    life: { ...life, attrs: { ...life.attrs, hp: playerHp, mp } },
    battle: { ...battle, turn: battle.turn + 1, rounds: [...battle.rounds, round] },
    round,
  }
}

interface StrikeArgs {
  facts: string[]
  rng: Rng
  attacker: 'player' | 'enemy'
  atk: number
  defenderAgi: number
  def: number
  mul: number
  levelCoeff: number
  effect: 'break_def' | 'combo' | 'lifesteal' | 'counter' | undefined
  /** 玩家攻击时指向敌人实例；敌方攻击时为 null */
  enemyRef: EnemyInstance | null
  qLevel: number
  onPlayerHp?: (rawDmg: number) => number
  defending?: boolean
}

function resolveStrike(a: StrikeArgs): void {
  const dodge = dodgeChance(a.defenderAgi, a.atk, a.attacker === 'enemy' ? a.qLevel : 0)
  if (a.rng() < dodge) {
    a.facts.push(a.attacker === 'player' ? '对方侧身闪过了这一招' : '你身形一晃，避开了这记攻击')
    return
  }
  const crit = a.rng() < critChance(a.atk, a.defenderAgi)
  let dmg = rawDamage(a.atk, a.mul, a.levelCoeff, a.def, a.effect === 'break_def')
  if (crit) dmg = Math.max(MIN_DMG, Math.round(dmg * CRIT_MULT))
  if (a.effect === 'combo') dmg += 1 // 连击追加一记轻击

  if (a.attacker === 'player' && a.enemyRef) {
    a.enemyRef.hp = Math.max(0, a.enemyRef.hp - dmg)
    a.facts.push(
      `${crit ? '正中要害（暴击）！' : ''}这一击造成 ${dmg} 点伤害（敌方生命 → ${a.enemyRef.hp}/${a.enemyRef.maxHp}）`
    )
  } else {
    const taken = a.onPlayerHp ? a.onPlayerHp(dmg) : dmg
    a.facts.push(
      `对方${crit ? '招式狠辣（暴击）' : '一击'}造成 ${taken} 点伤害${a.defending ? '（防御姿态卸去大半）' : ''}`
    )
  }
}

function enemyActs(tendency: EnemyTendency, rng: Rng): 'attack' | 'defend' | 'rest' {
  const roll = rng()
  if (tendency === 'aggressive') return 'attack'
  if (tendency === 'defensive') return roll < 0.55 ? 'attack' : roll < 0.85 ? 'defend' : 'rest'
  return roll < 0.75 ? 'attack' : roll < 0.9 ? 'defend' : 'rest'
}

function emptyRound(battle: BattleState): RoundLog {
  return { turn: battle.turn, facts: [], playerHp: 0, enemyHp: battle.enemy.hp }
}

export interface BattleConsequences {
  life: LifeState
  /** 战败且 lethal → 死亡 */
  died: boolean
  /** 战败且非 lethal → 重伤 */
  injured: boolean
  facts: string[]
}

/** 战斗结束后的后果（战利品/声望/恩怨/重伤），死亡由上层标记 */
export function applyBattleConsequences(
  life: LifeState,
  battle: BattleState,
  enemyDef: EnemyDef,
  rng: Rng
): BattleConsequences {
  const facts: string[] = []
  let next: LifeState = { ...life, pendingBattle: null }
  if (battle.result === 'win') {
    const loot = enemyDef.loot
    const money = loot ? loot[0] + Math.floor(rng() * ((loot[1] ?? loot[0]) - (loot[0] ?? 0) + 1)) : 0
    next = {
      ...next,
      money: next.money + money,
      rep: clampRep(next.rep + 2),
    }
    facts.push(`你从对方身上搜出 ${money} 两银子，声望 +2`)
    if (enemyDef.npcId) {
      next = { ...next, npcs: bump(next.npcs, enemyDef.npcId, -10) }
      facts.push(`${enemyDef.npcId} 与你的恩怨更深了（关系 -10）`)
    }
    return { life: next, died: false, injured: false, facts }
  }
  if (battle.result === 'lose') {
    if (enemyDef.lethal) {
      facts.push('对方下手狠辣，没有留手——')
      return { life: next, died: true, injured: false, facts }
    }
    next = {
      ...next,
      attrs: { ...next.attrs, hp: 1 },
      injured: true,
      money: Math.max(0, next.money - Math.ceil(next.money * 0.2)),
    }
    facts.push('对方存心教训你，没有下死手。你重伤倒地，被搜走了两成银两（生命上限临时受损，需医治）')
    if (enemyDef.npcId) {
      next = { ...next, npcs: bump(next.npcs, enemyDef.npcId, -15) }
    }
    return { life: next, died: false, injured: true, facts }
  }
  // fled
  facts.push('你逃出了这一场是非')
  return { life: next, died: false, injured: false, facts }
}

function bump(map: Record<string, number>, key: string, delta: number): Record<string, number> {
  return { ...map, [key]: Math.max(-100, Math.min(100, (map[key] ?? 0) + delta)) }
}

function clampRep(v: number): number {
  return Math.max(-100, Math.min(100, v))
}
