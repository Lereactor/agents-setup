import type { FlowNodeData } from '../graph/layout'

interface Props {
  nodeId: string | null
  data: FlowNodeData | null
}

const KIND_LABEL: Record<string, string> = {
  supervisor: 'Supervisor',
  agent: 'Agent',
  tool: 'Tool',
}

export default function Sidebar({ nodeId, data }: Props) {
  if (!nodeId || !data) {
    return (
      <div className="sidebar sidebar--empty">
        <p>Выберите узел на графе, чтобы увидеть детали выполнения.</p>
      </div>
    )
  }

  return (
    <div className="sidebar">
      <h3>{data.label}</h3>
      <div className="sidebar__row">
        <span className="sidebar__key">Тип</span>
        <span>{KIND_LABEL[data.kind] ?? data.kind}</span>
      </div>
      <div className="sidebar__row">
        <span className="sidebar__key">Статус</span>
        <span>{data.status ?? 'pending'}</span>
      </div>
      {typeof data.durationMs === 'number' && (
        <div className="sidebar__row">
          <span className="sidebar__key">Duration</span>
          <span>{Math.round(data.durationMs)} ms</span>
        </div>
      )}
      {typeof data.toolCalls === 'number' && data.toolCalls > 0 && (
        <div className="sidebar__row">
          <span className="sidebar__key">Tool calls</span>
          <span>{data.toolCalls}</span>
        </div>
      )}
      {data.summary && (
        <div className="sidebar__summary">
          <span className="sidebar__key">Summary</span>
          <p>{data.summary}</p>
        </div>
      )}
    </div>
  )
}
