import { useEffect, useState } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { AGENTS, STATUS_LABEL } from './agents'
import GroceryArt from './art/GroceryArt'
import NewsArt from './art/NewsArt'
import ShoppingArt from './art/ShoppingArt'
import BookingArt from './art/BookingArt'
import TravelArt from './art/TravelArt'
import WatchdogArt from './art/WatchdogArt'
import ReplyBubble from './ReplyBubble'
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
  /** Свежий ответ в Telegram — на несколько секунд всплывает пузырём над карточкой. */
  replyPop: { text: string; at: string | null; key: number } | null
  /** Во время проигрывания истории — виртуальное «сейчас» (для таймера и «N мин назад»). */
  clock?: number | null
}

const ART: Record<AgentId, (p: { active: boolean }) => JSX.Element> = {
  shopping: ShoppingArt,
  grocery: GroceryArt,
  travel: TravelArt,
  booking: BookingArt,
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
  const realNow = useTicker(live === 'running')
  const now = data.clock ?? realNow

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
      {data.replyPop ? (
        <div key={data.replyPop.key} className="agent-card__reply-pop">
          <div className="agent-card__reply-label">✉ отправлено в Telegram</div>
          <ReplyBubble text={data.replyPop.text} at={data.replyPop.at} collapsible={false} />
        </div>
      ) : (
        live !== 'running' &&
        shown?.reply && (
          // при наведении на карточку — последний ответ агента в чат
          <div className="agent-card__reply-hover">
            <div className="agent-card__reply-label">✉ последний ответ в Telegram</div>
            <ReplyBubble text={shown.reply} at={shown.finished_at} collapsible={false} />
          </div>
        )
      )}
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
        {meta.schedule && <div className="agent-card__schedule">{meta.schedule}</div>}

        {live === 'running' && data.current && data.current.steps.length > 0 ? (
          // идёт работа — показываем текущий шаг агента, запрос остаётся в подсказке
          <div className="agent-card__detail" title={data.current.detail || undefined}>
            <span key={data.current.steps.length} className="agent-card__step">
              {data.current.steps[data.current.steps.length - 1].text}
              <i className="typing-dots">
                <b />
                <b />
                <b />
              </i>
            </span>
            <span className="agent-card__step-n">шаг {data.current.steps.length}</span>
          </div>
        ) : (
          <div className="agent-card__detail" title={shown?.detail || undefined}>
            {shown?.detail ? `«${shown.detail}»` : <span className="dim">{meta.schedule ? meta.description : meta.trigger}</span>}
          </div>
        )}

        <div className="agent-card__foot">
          {live === 'running' && elapsed !== null ? (
            <span className="agent-card__timer">⏳ {formatDuration(elapsed)}</span>
          ) : shown ? (
            <span className="dim">{formatAgo(shown.finished_at ?? shown.started_at, now)}</span>
          ) : (
            <span className="dim">ещё не запускался</span>
          )}
          {live !== 'running' && shown?.reply && (
            <span className="agent-card__has-reply" title="Агент ответил в чат — нажмите на карточку, чтобы прочитать">
              ✉ ответ
            </span>
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
