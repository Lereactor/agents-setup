import { useMemo, useState } from 'react'
import { AGENT_ORDER, AGENTS, STATUS_LABEL, isAgentId } from './agents'
import ReplyBubble from './ReplyBubble'
import { formatDuration, formatTime, runDayKey } from './stats'
import type { AgentId, AgentRun, RunStatus } from './types'

interface Props {
  runs: AgentRun[]
  day: string | null
  agentFilter: AgentId | null
  onAgentFilter: (agent: AgentId | null) => void
}

const STATUS_FILTERS: (RunStatus | 'all')[] = ['all', 'running', 'success', 'error', 'skipped']
const LIMIT = 200

/** Лента запусков, новые сверху: фильтры по агенту/статусу, поиск по подробностям. */
export default function HistoryFeed({ runs, day, agentFilter, onAgentFilter }: Props) {
  const [status, setStatus] = useState<RunStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  // Подсказка с ответом при наведении: position: fixed, чтобы её не обрезал скролл ленты.
  const [hover, setHover] = useState<{ run: AgentRun; left: number; top: number } | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...runs]
      .reverse()
      .filter((r) => !agentFilter || r.agent === agentFilter)
      .filter((r) => status === 'all' || r.status === status || (status === 'running' && r.status === 'stale'))
      .filter((r) => !day || runDayKey(r) === day)
      .filter((r) => !q || r.detail.toLowerCase().includes(q) || r.reply.toLowerCase().includes(q) || r.agent.includes(q))
  }, [runs, agentFilter, status, day, query])

  return (
    <div className="feed">
      <div className="feed__filters">
        <span className="panel-title">История</span>
        <button className={`chip ${!agentFilter ? 'is-active' : ''}`} onClick={() => onAgentFilter(null)}>
          все
        </button>
        {AGENT_ORDER.map((a) => (
          <button
            key={a}
            className={`chip ${agentFilter === a ? 'is-active' : ''}`}
            style={{ ['--agent-color' as string]: AGENTS[a].color }}
            onClick={() => onAgentFilter(agentFilter === a ? null : a)}
          >
            {AGENTS[a].emoji}
          </button>
        ))}
        <select value={status} onChange={(e) => setStatus(e.target.value as RunStatus | 'all')}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'любой статус' : STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input placeholder="поиск по запросу и ответу…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="dim feed__count">{filtered.length}</span>
      </div>
      <ul className="feed__list">
        {filtered.slice(0, LIMIT).map((run) => {
          const meta = isAgentId(run.agent) ? AGENTS[run.agent] : null
          const open = expanded === run.run_id && !!run.reply
          return (
            <li
              key={run.run_id}
              className={`feed__item feed__item--${run.status} ${run.reply ? 'feed__item--has-reply' : ''}`}
              style={{ ['--agent-color' as string]: meta?.color ?? '#888' }}
              onClick={() => {
                if (!run.reply) return
                setExpanded(open ? null : run.run_id)
                setHover(null)
              }}
              onMouseEnter={(e) => {
                if (!run.reply || open) return
                const rect = e.currentTarget.getBoundingClientRect()
                setHover({ run, left: rect.left + 120, top: rect.top })
              }}
              onMouseLeave={() => setHover(null)}
              title={run.reply ? 'Показать ответ в чат' : undefined}
            >
              <span className="feed__time">{formatTime(run.started_at)}</span>
              <span className="feed__agent">
                {meta?.emoji ?? '🤖'} {meta?.title ?? run.agent}
              </span>
              <span className={`status-badge status-badge--${run.status}`}>{STATUS_LABEL[run.status]}</span>
              <span className="feed__dur">{run.duration_s !== null ? formatDuration(run.duration_s) : ''}</span>
              <span className="feed__detail">
                {run.reply && <span className="feed__reply-icon">{open ? '▾' : '✉'}</span>}
                {run.detail || <span className="dim">подробности не записывались</span>}
              </span>
              {open && (
                <div className="feed__reply">
                  <ReplyBubble text={run.reply} at={run.finished_at} />
                </div>
              )}
            </li>
          )
        })}
        {!filtered.length && <li className="feed__empty dim">ничего не найдено</li>}
      </ul>
      {hover && (
        <div className="feed__hover" style={{ left: hover.left, top: hover.top }}>
          <div className="agent-card__reply-label">✉ ответ в Telegram · нажмите, чтобы закрепить</div>
          <ReplyBubble text={hover.run.reply} at={hover.run.finished_at} collapsible={false} />
        </div>
      )}
    </div>
  )
}
