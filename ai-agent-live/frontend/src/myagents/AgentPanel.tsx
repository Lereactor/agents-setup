import { useMemo } from 'react'
import { AGENT_ORDER, AGENTS, STATUS_LABEL } from './agents'
import ReplyBubble from './ReplyBubble'
import Sparkline from './Sparkline'
import StepsTimeline from './StepsTimeline'
import { avgDuration, formatDuration, formatTime, runsByDay, successRate, todayCounts } from './stats'
import type { AgentId, AgentRun } from './types'

interface Props {
  agent: AgentId | null
  runs: AgentRun[]
  onSelect: (agent: AgentId | null) => void
}

function pct(value: number | null) {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

/** Правая панель: сводка по системе или подробности выбранного агента. */
export default function AgentPanel({ agent, runs, onSelect }: Props) {
  const own = useMemo(() => (agent ? runs.filter((r) => r.agent === agent) : runs), [agent, runs])

  if (!agent) {
    const today = todayCounts(runs)
    return (
      <aside className="agent-panel">
        <div className="panel-title">Пульс системы</div>
        <div className="kpis">
          <div className="kpi">
            <b>{runs.length}</b>
            <span>запусков всего</span>
          </div>
          <div className="kpi">
            <b>{today.total}</b>
            <span>сегодня</span>
          </div>
          <div className="kpi">
            <b>{pct(successRate(runs))}</b>
            <span>успешных</span>
          </div>
        </div>
        <ul className="agent-panel__list">
          {AGENT_ORDER.map((a) => {
            const mine = runs.filter((r) => r.agent === a)
            const last = mine[mine.length - 1]
            return (
              <li key={a} onClick={() => onSelect(a)} style={{ ['--agent-color' as string]: AGENTS[a].color }}>
                <span className="agent-panel__dot" />
                <span className="agent-panel__name">
                  {AGENTS[a].emoji} {AGENTS[a].title}
                </span>
                <span className="dim">{mine.length} · {pct(successRate(mine))}</span>
                <span className="dim agent-panel__last">{last ? formatTime(last.started_at) : 'нет запусков'}</span>
              </li>
            )
          })}
        </ul>
        <p className="dim agent-panel__hint">Нажмите на карточку агента, чтобы увидеть подробности.</p>
      </aside>
    )
  }

  const meta = AGENTS[agent]
  const recent = [...own].reverse().slice(0, 10)
  return (
    <aside className="agent-panel" style={{ ['--agent-color' as string]: meta.color }}>
      <div className="agent-panel__head">
        <span className="agent-panel__big">{meta.emoji}</span>
        <div>
          <div className="agent-panel__title">{meta.title}</div>
          <div className="dim">{meta.description}</div>
          <div className="dim">⚙ {meta.trigger}</div>
        </div>
        <button className="chip chip--clear" onClick={() => onSelect(null)} title="Закрыть">
          ×
        </button>
      </div>
      <div className="kpis">
        <div className="kpi">
          <b>{own.length}</b>
          <span>запусков</span>
        </div>
        <div className="kpi">
          <b>{pct(successRate(own))}</b>
          <span>успешных</span>
        </div>
        <div className="kpi">
          <b>{formatDuration(avgDuration(own))}</b>
          <span>в среднем</span>
        </div>
      </div>
      <div className="panel-subtitle">Запуски по дням (30 дн)</div>
      <Sparkline cells={runsByDay(own, 30)} color={meta.color} />
      <div className="panel-subtitle">Последние запуски</div>
      <ul className="agent-panel__runs">
        {recent.map((r) => (
          <li key={r.run_id}>
            <div>
              <span className={`status-badge status-badge--${r.status}`}>{STATUS_LABEL[r.status]}</span>
              <span className="dim"> {formatTime(r.started_at)}</span>
              {r.duration_s !== null && <span className="dim"> · {formatDuration(r.duration_s)}</span>}
            </div>
            {r.detail && <div className="agent-panel__detail">{r.detail}</div>}
            <StepsTimeline steps={r.steps} live={r.status === 'running'} />
            {r.reply && <ReplyBubble text={r.reply} at={r.finished_at} />}
          </li>
        ))}
        {!recent.length && <li className="dim">запусков пока не было</li>}
      </ul>
    </aside>
  )
}
