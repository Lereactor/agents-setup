import { useEffect, useState } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { AGENTS, STATUS_LABEL } from './agents'
import GroceryArt from './art/GroceryArt'
import NewsArt from './art/NewsArt'
import ShoppingArt from './art/ShoppingArt'
import WatchdogArt from './art/WatchdogArt'
import { formatAgo, formatDuration } from './stats'
import type { AgentId, AgentRun, RunStatus } from './types'

export interface AgentCardData {
  agent: AgentId
  /** Текущий незавершённый запуск (running/stale), если есть. */
  current: AgentRun | null
  /** Последний завершённый запуск. */
  last: AgentRun | null
  /** Вспышка цветом итога — key меняется на каждое новое событие, чтобы перезапустить анимацию. */
  flash: { status: RunStatus; key: number } | null
  today: { ok: number; err: number; total: number }
  selected: boolean
}

const ART: Record<AgentId, (p: { active: boolean }) => JSX.Element> = {
  shopping: ShoppingArt,
  grocery: GroceryArt,
  'news-digest': NewsArt,
  watchdog: WatchdogArt,
}

function useTicker(enabled: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [enabled])
  return now
}

const hidden = { opacity: 0 }

export default function AgentCardNode({ data }: NodeProps<AgentCardData>) {
  const meta = AGENTS[data.agent]
  const Art = ART[data.agent]
  const live = data.current?.status
  const active = live === 'running' || data.flash !== null
  const now = useTicker(live === 'running')

  const shown = data.current ?? data.last
  const badge: RunStatus | null = live ?? data.last?.status ?? null
  const elapsed = data.current ? Math.max(0, (now - Date.parse(data.current.started_at)) / 1000) : null

  return (
    <div
      className={[
        'agent-card',
        `agent-card--${data.agent}`,
        live ? `agent-card--${live}` : '',
        data.selected ? 'agent-card--selected' : '',
      ].join(' ')}
      style={{ ['--agent-color' as string]: meta.color }}
    >
      {data.flash && <div key={data.flash.key} className={`agent-card__flash agent-card__flash--${data.flash.status}`} />}
      <Handle id="in-l" type="target" position={Position.Left} style={hidden} />
      <Handle id="in-r" type="target" position={Position.Right} style={hidden} />
      <Handle id="in-b" type="target" position={Position.Bottom} style={hidden} />
      <Handle id="out-l" type="source" position={Position.Left} style={hidden} />
      <Handle id="out-t" type="source" position={Position.Top} style={hidden} />

      <div className="agent-card__art">
        <Art active={active} />
      </div>

      <div className="agent-card__body">
        <div className="agent-card__head">
          <span className="agent-card__title">
            {meta.emoji} {meta.title}
          </span>
          {badge && <span className={`status-badge status-badge--${badge}`}>{STATUS_LABEL[badge]}</span>}
        </div>

        <div className="agent-card__detail" title={shown?.detail || undefined}>
          {shown?.detail ? `«${shown.detail}»` : <span className="dim">{meta.trigger}</span>}
        </div>

        <div className="agent-card__foot">
          {live === 'running' && elapsed !== null ? (
            <span className="agent-card__timer">⏳ {formatDuration(elapsed)}</span>
          ) : shown ? (
            <span className="dim">{formatAgo(shown.finished_at ?? shown.started_at, now)}</span>
          ) : (
            <span className="dim">ещё не запускался</span>
          )}
          <span className="agent-card__today" title="Запуски за сегодня">
            сегодня <b className="ok">✓{data.today.ok}</b>
            {data.today.err > 0 && <b className="err"> ✗{data.today.err}</b>}
          </span>
        </div>
      </div>
    </div>
  )
}
