/** Зеркало ответа backend GET /my-agents/log (backend/app/my_agents/log_parser.py). */

export type AgentId = 'news-digest' | 'watchdog' | 'shopping' | 'grocery' | 'travel' | 'booking'

export type RunStatus = 'running' | 'stale' | 'success' | 'error' | 'skipped'

export interface AgentRun {
  run_id: string
  agent: string
  status: RunStatus
  started_at: string
  finished_at: string | null
  duration_s: number | null
  detail: string
  /** Текст ответа, который агент отправил в Telegram (пусто, если не отправлял или до 04.10). */
  reply: string
  /** Промежуточные шаги агента по ходу запуска («🔎 ищу…», «🧺 собираю корзину»). */
  steps: AgentStep[]
}

export interface AgentStep {
  at: string
  text: string
}

export interface LogOk {
  runs: AgentRun[]
  fetched_at: string
  stale_data: boolean
}

export interface LogError {
  error: 'not_configured' | 'unavailable' | 'network'
}

export type LogResponse = LogOk | LogError

export function isLogError(response: LogResponse): response is LogError {
  return 'error' in response
}
