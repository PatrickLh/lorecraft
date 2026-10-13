/** 日历工具（plan §2 时间粒度）：时段→日→季→年→年龄 的纯推导。 */
import {
  DAYS_PER_YEAR,
  SEASONS_PER_YEAR,
  DAYS_PER_SEASON,
  SLOTS_PER_DAY,
  SLOT_NAMES,
  SEASON_NAMES,
  START_AGE,
} from './constants.js'
import type { LifeState } from './types.js'

export function ageOf(day: number): number {
  return START_AGE + Math.floor(day / DAYS_PER_YEAR)
}

/** 第几年（1-based） */
export function yearOf(day: number): number {
  return Math.floor(day / DAYS_PER_YEAR) + 1
}

export function seasonIndex(day: number): number {
  return Math.floor((day % DAYS_PER_YEAR) / DAYS_PER_SEASON)
}

export function seasonName(day: number): string {
  return SEASON_NAMES[seasonIndex(day)] ?? '春'
}

export function dayOfSeason(day: number): number {
  return (day % DAYS_PER_YEAR) % DAYS_PER_SEASON
}

export function slotName(slot: number): string {
  return SLOT_NAMES[slot] ?? '晨'
}

/** 「第一年 春 三日 · 晨」 */
export function formatDate(day: number, slot: number): string {
  return `第${chineseNum(yearOf(day))}年 ${seasonName(day)}月${chineseNum(dayOfSeason(day) + 1)}日 · ${slotName(slot)}`
}

export function chineseNum(n: number): string {
  if (n <= 10) return ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][n] ?? String(n)
  if (n < 20) return `十${n % 10 === 0 ? '' : chineseNum(n % 10)}`
  if (n % 10 === 0) return `${chineseNum(Math.floor(n / 10))}十`
  return `${chineseNum(Math.floor(n / 10))}十${chineseNum(n % 10)}`
}

/** 当前日期时间信息包（注入 prompt） */
export function clockInfo(life: Pick<LifeState, 'day' | 'slot'>): {
  day: number
  slot: number
  year: number
  season: string
  dayOfSeason: number
  age: number
  text: string
} {
  return {
    day: life.day,
    slot: life.slot,
    year: yearOf(life.day),
    season: seasonName(life.day),
    dayOfSeason: dayOfSeason(life.day) + 1,
    age: ageOf(life.day),
    text: `${formatDate(life.day, life.slot)}（年方${ageOf(life.day)}）`,
  }
}

export const __calendarMeta = { SLOTS_PER_DAY, SEASONS_PER_YEAR }
