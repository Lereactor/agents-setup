import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentRun } from './types'

export const REPLAY_PERIODS = [
  { days: 1, label: 'сутки' },
  { days: 7, label: 'неделя' },
  { days: 30, label: 'месяц' },
] as const

const REPLAY_MS = 30000
const TICK_MS = 50

export interface ReplayState {
  playing: boolean
  progress: number
  virtualTime: number | null
}

/** Таймлапс: запуски за период проигрываются за ~30 с в реальном порядке.
 *  `onRun` вызывается для каждого запуска, когда виртуальное время до него дошло. */
export function useReplay(runs: AgentRun[], onRun: (run: AgentRun) => void) {
  const [state, setState] = useState<ReplayState>({ playing: false, progress: 0, virtualTime: null })
  const timer = useRef<number | undefined>()
  const onRunRef = useRef(onRun)
  onRunRef.current = onRun

  const stop = useCallback(() => {
    window.clearInterval(timer.current)
    timer.current = undefined
    setState({ playing: false, progress: 0, virtualTime: null })
  }, [])

  const start = useCallback(
    (days: number) => {
      window.clearInterval(timer.current)
      const to = Date.now()
      const from = to - days * 86400000
      const queue = runs
        .filter((r) => Date.parse(r.started_at) >= from)
        .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
      let index = 0
      const startedAt = performance.now()

      timer.current = window.setInterval(() => {
        const progress = Math.min(1, (performance.now() - startedAt) / REPLAY_MS)
        const virtualTime = from + progress * (to - from)
        while (index < queue.length && Date.parse(queue[index].started_at) <= virtualTime) {
          onRunRef.current(queue[index])
          index += 1
        }
        if (progress >= 1) {
          window.clearInterval(timer.current)
          timer.current = undefined
          setState({ playing: false, progress: 1, virtualTime: null })
        } else {
          setState({ playing: true, progress, virtualTime })
        }
      }, TICK_MS)
      setState({ playing: true, progress: 0, virtualTime: from })
    },
    [runs],
  )

  useEffect(() => () => window.clearInterval(timer.current), [])

  return { ...state, start, stop }
}
