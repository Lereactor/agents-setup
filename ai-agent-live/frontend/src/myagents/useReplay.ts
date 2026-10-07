import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentRun } from './types'

export const REPLAY_PERIODS = [
  { days: 1, label: 'сутки' },
  { days: 7, label: 'неделя' },
  { days: 30, label: 'месяц' },
] as const

const TICK_MS = 50
/** Сколько реального времени уходит на все «пустые» промежутки периода. */
const IDLE_BUDGET_MS = 12000
/** Сколько реального времени уходит на все моменты работы агентов (не меньше MIN_ACTIVE_SPEED). */
const ACTIVE_BUDGET_MS = 60000
/** Медленнее этого не играем: минута работы агента ≈ 3 с на экране. */
const MIN_ACTIVE_SPEED = 20
/** Запас вокруг запуска, чтобы замедление начиналось чуть раньше и кончалось чуть позже. */
const MARGIN_MS = 20000
/** Запуск без времени окончания (или мгновенный) показываем хотя бы столько виртуального времени. */
const MIN_RUN_MS = 45000

export interface ReplayState {
  playing: boolean
  progress: number
  virtualTime: number | null
  /** true — сейчас кто-то работает и время идёт медленно. */
  slow: boolean
}

interface Item {
  run: AgentRun
  start: number
  end: number
}

function runEnd(run: AgentRun, start: number): number {
  const finished = run.finished_at ? Date.parse(run.finished_at) : NaN
  const end = Number.isFinite(finished) ? finished : run.duration_s ? start + run.duration_s * 1000 : start
  return Math.max(end, start + MIN_RUN_MS)
}

/** Объединение интервалов [start - запас, end + запас] — «моменты работы». */
function activeSpans(items: Item[]): [number, number][] {
  const spans: [number, number][] = []
  for (const { start, end } of items) {
    const a = start - MARGIN_MS
    const b = end + MARGIN_MS
    const last = spans[spans.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else spans.push([a, b])
  }
  return spans
}

/** Таймлапс с переменной скоростью: пустые промежутки пролетают быстро, моменты работы —
 *  медленно. `onFinish` вызывается, когда виртуальное время дошло до конца запуска;
 *  `activeRuns(t)` — что идёт в момент t (для карточек «работает» и шагов). */
export function useReplay(runs: AgentRun[], onFinish: (run: AgentRun) => void) {
  const [state, setState] = useState<ReplayState>({ playing: false, progress: 0, virtualTime: null, slow: false })
  const timer = useRef<number | undefined>()
  const items = useRef<Item[]>([])
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  const stop = useCallback(() => {
    window.clearInterval(timer.current)
    timer.current = undefined
    items.current = []
    setState({ playing: false, progress: 0, virtualTime: null, slow: false })
  }, [])

  const start = useCallback(
    (days: number) => {
      window.clearInterval(timer.current)
      const to = Date.now()
      const from = to - days * 86400000
      const queue: Item[] = runs
        .map((run) => ({ run, start: Date.parse(run.started_at) }))
        .filter((x) => Number.isFinite(x.start) && x.start >= from)
        .sort((a, b) => a.start - b.start)
        .map(({ run, start }) => ({ run, start, end: runEnd(run, start) }))
      items.current = queue

      const spans = activeSpans(queue).map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as [number, number])
      const activeTotal = spans.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0)
      const idleTotal = Math.max(1, to - from - activeTotal)
      const idleSpeed = idleTotal / IDLE_BUDGET_MS
      const activeSpeed = Math.max(MIN_ACTIVE_SPEED, activeTotal / ACTIVE_BUDGET_MS)

      let t = from
      let finishedIdx = 0
      const byEnd = [...queue].sort((a, b) => a.end - b.end)
      let last = performance.now()

      timer.current = window.setInterval(() => {
        const nowMs = performance.now()
        let budget = nowMs - last // реальные мс, которые нужно «прожить»
        last = nowMs
        // Двигаем время кусками: внутри «момента работы» — медленно, между ними — быстро,
        // но никогда не перепрыгиваем начало следующего момента.
        while (budget > 0 && t < to) {
          const span = spans.find(([a, b]) => t >= a && t < b)
          if (span) {
            const step = Math.min(budget * activeSpeed, span[1] - t)
            t += step
            budget -= step / activeSpeed
          } else {
            const next = spans.find(([a]) => a > t)
            const limit = next ? next[0] : to
            const step = Math.min(budget * idleSpeed, limit - t)
            t += step
            budget -= step / idleSpeed
          }
          if (budget < 0.01) break
        }
        t = Math.min(t, to)
        while (finishedIdx < byEnd.length && byEnd[finishedIdx].end <= t) {
          onFinishRef.current(byEnd[finishedIdx].run)
          finishedIdx += 1
        }
        const slow = spans.some(([a, b]) => t >= a && t < b)
        if (t >= to) {
          window.clearInterval(timer.current)
          timer.current = undefined
          items.current = []
          setState({ playing: false, progress: 0, virtualTime: null, slow: false })
        } else {
          setState({ playing: true, progress: (t - from) / (to - from), virtualTime: t, slow })
        }
      }, TICK_MS)
      setState({ playing: true, progress: 0, virtualTime: from, slow: false })
    },
    [runs],
  )

  /** Запуски, идущие в виртуальный момент t, с шагами, которые к этому моменту уже были. */
  const activeRuns = useCallback((t: number | null): AgentRun[] => {
    if (t === null) return []
    return items.current
      .filter((x) => x.start <= t && t < x.end)
      .map(({ run, start, end }) => {
        const timed = run.steps.filter((s) => Number.isFinite(Date.parse(s.at)))
        // У старых записей шаги без времени — раскладываем их равномерно по длительности.
        const steps =
          timed.length === run.steps.length
            ? run.steps.filter((s) => Date.parse(s.at) <= t)
            : run.steps.slice(0, Math.floor(((t - start) / (end - start)) * (run.steps.length + 1)))
        return { ...run, status: 'running' as const, finished_at: null, steps }
      })
  }, [])

  useEffect(() => () => window.clearInterval(timer.current), [])

  return { ...state, start, stop, activeRuns }
}
