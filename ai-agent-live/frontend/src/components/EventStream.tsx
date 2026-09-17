import { useEffect, useRef } from 'react'
import type { AgentEvent } from '../events/types'

interface Props {
  events: AgentEvent[]
}

function formatTime(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toISOString().slice(11, 23)
}

function describeEvent(event: AgentEvent): string {
  const node = event.node_id.toUpperCase()
  switch (event.type) {
    case 'RUN_STARTED':
      return 'RUN STARTED'
    case 'NODE_STARTED':
      return event.parent_node_id
        ? `${event.parent_node_id.toUpperCase()} → ${node}`
        : `${node} STARTED`
    case 'NODE_THINKING':
      return `${node} … ${event.summary ?? ''}`
    case 'TOOL_CALL':
      return `${node} → ${(event.tool ?? '').replace('_', ' ').toUpperCase()}`
    case 'TOOL_RESULT':
      return `${(event.tool ?? '').replace('_', ' ').toUpperCase()} → ${event.summary ?? 'done'}`
    case 'NODE_COMPLETED':
      return `${node} completed (${event.duration_ms ?? '?'} ms)`
    case 'NODE_ERROR':
      return `${node} ERROR: ${event.summary ?? ''}`
    case 'EDGE_ACTIVE':
      return `${event.parent_node_id ?? '?'} ⇢ ${node}`
    case 'RUN_COMPLETED':
      return `RUN COMPLETED — ${event.summary ?? ''}`
    default:
      return `${event.type} ${node}`
  }
}

export default function EventStream({ events }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [events.length])

  return (
    <div className="events">
      <div className="events__list">
        {events.map((event) => (
          <div key={event.event_id} className={`events__row events__row--${event.type.toLowerCase()}`}>
            <span className="events__time">[{formatTime(event.timestamp)}]</span>
            <span>{describeEvent(event)}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
