import type { AgentRun } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Ключ локального дня (у пользователя локальное время = МСК) — 'YYYY-MM-DD'. */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function runDayKey(run: AgentRun): string {
  return dayKey(new Date(run.started_at))
}

/** Последние `days` локальных дней, от старого к новому. */
export function lastDays(days: number, now = new Date()): Date[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Array.from({ length: days }, (_, i) => new Date(today.getTime() - (days - 1 - i) * DAY_MS))
}

export interface DayCell {
  key: string
  date: Date
  total: number
  errors: number
}

export function runsByDay(runs: AgentRun[], days: number, now = new Date()): DayCell[] {
  const counts = new Map<string, { total: number; errors: number }>()
  for (const run of runs) {
    const key = runDayKey(run)
    const cell = counts.get(key) ?? { total: 0, errors: 0 }
    cell.total += 1
    if (run.status === 'error' || run.status === 'stale') cell.errors += 1
    counts.set(key, cell)
  }
  return lastDays(days, now).map((date) => {
    const key = dayKey(date)
    return { key, date, ...(counts.get(key) ?? { total: 0, errors: 0 }) }
  })
}

export function successRate(runs: AgentRun[]): number | null {
  const finished = runs.filter((r) => r.status === 'success' || r.status === 'error')
  if (!finished.length) return null
  return finished.filter((r) => r.status === 'success').length / finished.length
}

export function avgDuration(runs: AgentRun[]): number | null {
  const durations = runs.map((r) => r.duration_s).filter((d): d is number => d !== null)
  if (!durations.length) return null
  return durations.reduce((a, b) => a + b, 0) / durations.length
}

export function todayCounts(runs: AgentRun[], now = new Date()) {
  const today = dayKey(now)
  const todays = runs.filter((r) => runDayKey(r) === today)
  return {
    ok: todays.filter((r) => r.status === 'success').length,
    err: todays.filter((r) => r.status === 'error' || r.status === 'stale').length,
    total: todays.length,
  }
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${Math.round(seconds)} с`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m} мин ${s.toString().padStart(2, '0')} с`
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatAgo(iso: string, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (sec < 60) return `${sec} с назад`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} мин назад`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} ч назад`
  return `${Math.round(h / 24)} дн назад`
}
