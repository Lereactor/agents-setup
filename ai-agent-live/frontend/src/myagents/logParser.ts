import type { AgentRun, AgentStep, RunStatus } from './types'

/** Порт backend/app/my_agents/log_parser.py для публичного сайта (GitHub Pages), где
 *  нет Python-backend и браузер читает Google Sheets-лог напрямую. Логика должна
 *  совпадать с Python-версией — при изменении править обе. */

const STALE_AFTER_MS = 30 * 60 * 1000
const LEGACY_DUPLICATE_WINDOW_MS = 30 * 1000

type Entry = { ts: number; status: string; detail: string; reply: string }

function parseTs(value: unknown): number | null {
  const s = String(value ?? '').trim()
  // только полноценные ISO-метки с часовым поясом, как в Python-версии
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

function fmt(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function cell(row: unknown[], i: number): string {
  const v = row[i]
  return v === undefined || v === null ? '' : String(v).trim()
}

export function parseRows(rows: unknown[][], now: number = Date.now()): AgentRun[] {
  const groups = new Map<string, { agent: string; started: Entry | null; final: Entry | null; steps: AgentStep[] }>()
  const lastLegacy = new Map<string, number>()
  const openLegacyStart = new Map<string, string>()

  rows.forEach((row, index) => {
    const ts = parseTs(row[0])
    const agent = cell(row, 1)
    const status = cell(row, 2).toLowerCase()
    if (ts === null || !agent || !status) return // шапка, пустые и битые строки
    let runId = cell(row, 4)
    if (!runId) {
      if (status === 'progress') return // шаг без run_id не к чему привязать
      // старые агенты слали лог через `curl -X POST` и повторяли запрос — дубли
      const key = `${agent}\u0000${status}`
      const previous = lastLegacy.get(key)
      lastLegacy.set(key, ts)
      if (previous !== undefined && ts - previous <= LEGACY_DUPLICATE_WINDOW_MS) return
      if (status === 'started') {
        runId = `legacy-${index}`
        openLegacyStart.set(agent, runId)
      } else {
        runId = openLegacyStart.get(agent) ?? `legacy-${index}`
        openLegacyStart.delete(agent)
      }
    }
    let group = groups.get(runId)
    if (!group) {
      group = { agent, started: null, final: null, steps: [] }
      groups.set(runId, group)
    }
    const entry: Entry = { ts, status, detail: cell(row, 3), reply: cell(row, 5) }
    if (status === 'started') group.started = entry
    else if (status === 'progress') group.steps.push({ at: fmt(ts)!, text: entry.detail })
    else group.final = entry
  })

  const runs: AgentRun[] = []
  for (const [runId, g] of groups) {
    let { started } = g
    const { final, steps } = g
    if (!started && !final) started = { ts: Date.parse(steps[0].at), status: 'started', detail: '', reply: '' }
    const startedAt = started ? started.ts : final!.ts
    let status: RunStatus
    let finishedAt: number | null
    let detail: string
    if (final) {
      finishedAt = final.ts
      status = final.status as RunStatus
      detail = final.detail || (started ? started.detail : '')
    } else {
      finishedAt = null
      status = now - startedAt > STALE_AFTER_MS ? 'stale' : 'running'
      detail = started!.detail
    }
    runs.push({
      run_id: runId,
      agent: g.agent,
      status,
      started_at: fmt(startedAt)!,
      finished_at: fmt(finishedAt),
      duration_s: started && final ? Math.trunc((final.ts - started.ts) / 1000) : null,
      detail,
      reply: final ? final.reply : '',
      steps,
    })
  }
  runs.sort((a, b) => (a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0))
  return runs
}
