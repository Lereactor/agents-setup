import type { AgentEvent } from '../events/types'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://127.0.0.1:8000'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

export interface StartRunResponse {
  run_id: string
  prompt: string
}

export interface RunSummary {
  run_id: string
  prompt: string
  started_at: string
  completed: boolean
  event_count: number
}

export async function startRun(prompt: string): Promise<StartRunResponse> {
  const res = await fetch(`${API_BASE}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) throw new Error(`start_run failed: ${res.status}`)
  return res.json() as Promise<StartRunResponse>
}

export async function listRuns(): Promise<RunSummary[]> {
  const res = await fetch(`${API_BASE}/runs`)
  if (!res.ok) throw new Error(`list_runs failed: ${res.status}`)
  return res.json() as Promise<RunSummary[]>
}

export async function fetchRunEvents(runId: string): Promise<AgentEvent[]> {
  const res = await fetch(`${API_BASE}/runs/${runId}/events`)
  if (!res.ok) throw new Error(`fetch_run_events failed: ${res.status}`)
  return res.json() as Promise<AgentEvent[]>
}

/** Открывает WS на конкретный run_id. Возвращает функцию отключения. */
export function connectRunSocket(
  runId: string,
  onEvent: (event: AgentEvent) => void,
  onClose: () => void,
): () => void {
  const ws = new WebSocket(`${WS_BASE}/ws/${runId}`)
  ws.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data as string) as AgentEvent
      onEvent(event)
    } catch {
      // некорректный фрейм — молча игнорируем, не роняем UI
    }
  }
  ws.onclose = () => onClose()
  return () => ws.close()
}
