import { Handle, Position, type NodeProps } from 'reactflow'
import type { FlowNodeData } from './layout'

const STATUS_LABEL: Record<string, string> = {
  pending: 'ожидание',
  running: 'выполняется',
  completed: 'готово',
  error: 'ошибка',
}

export default function CustomNode({ data }: NodeProps<FlowNodeData>) {
  const status = data.status ?? 'pending'
  return (
    <div className={`flow-node flow-node--${data.kind} flow-node--${status}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flow-node__header">
        <span className={`flow-node__dot flow-node__dot--${status}`} />
        <span className="flow-node__label">{data.label}</span>
      </div>
      <div className="flow-node__meta">
        <span>{STATUS_LABEL[status]}</span>
        {typeof data.durationMs === 'number' && <span>{Math.round(data.durationMs)} ms</span>}
        {data.kind !== 'tool' && !!data.toolCalls && (
          <span>
            {data.toolCalls} tool call{data.toolCalls > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
