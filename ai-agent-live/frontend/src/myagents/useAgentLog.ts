import { useEffect, useRef, useState } from 'react'
import { fetchMyAgentsLog } from '../api/client'
import { isMockMode, MockSource } from './mock'
import { isLogError, type AgentRun, type LogError } from './types'

// 10 с: запуск агента бывает короче 15 с; чаще нельзя — у Apps Script на личном
// аккаунте дневной лимит суммарного времени выполнения.
const POLL_MS = 10000
const MOCK_POLL_MS = 1000

export interface AgentChange {
  run: AgentRun
  /** Статус на прошлом опросе; undefined — этот запуск сайт видит впервые. */
  prev: string | undefined
}

export interface AgentLogState {
  runs: AgentRun[]
  fetchedAt: string | null
  staleData: boolean
  error: LogError['error'] | null
  loading: boolean
  mock: boolean
}

/** Опрашивает лог агентов. `onChanges` вызывается с запусками, которые появились или
 *  сменили статус с прошлого опроса (на самом первом снимке не вызывается — не анимируем
 *  всю историю при открытии вкладки). */
export function useAgentLog(onChanges: (changes: AgentChange[]) => void): AgentLogState {
  const mock = useRef(isMockMode()).current
  const [state, setState] = useState<AgentLogState>({
    runs: [],
    fetchedAt: null,
    staleData: false,
    error: null,
    loading: true,
    mock,
  })
  const prevStatus = useRef<Map<string, string> | null>(null)
  const onChangesRef = useRef(onChanges)
  onChangesRef.current = onChanges

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const mockSource = mock ? new MockSource() : null

    const apply = (runs: AgentRun[], fetchedAt: string, staleData: boolean) => {
      const prev = prevStatus.current
      if (prev) {
        const changes = runs
          .filter((r) => prev.get(r.run_id) !== r.status)
          .map((run) => ({ run, prev: prev.get(run.run_id) }))
        if (changes.length) onChangesRef.current(changes)
      }
      prevStatus.current = new Map(runs.map((r) => [r.run_id, r.status]))
      setState({ runs, fetchedAt, staleData, error: null, loading: false, mock })
    }

    const tick = async () => {
      if (mockSource) {
        const snap = mockSource.snapshot()
        apply(snap.runs, snap.fetched_at, false)
      } else {
        const response = await fetchMyAgentsLog()
        if (cancelled) return
        if (isLogError(response)) {
          setState((s) => ({ ...s, error: response.error, loading: false }))
        } else {
          apply(response.runs, response.fetched_at, response.stale_data)
        }
      }
      if (!cancelled) timer = window.setTimeout(tick, mockSource ? MOCK_POLL_MS : POLL_MS)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer)
        void tick()
      }
    }

    ;(async () => {
      if (mockSource) await mockSource.start()
      if (!cancelled) void tick()
    })()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      mockSource?.stop()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [mock])

  return state
}
