import { Handle, Position, type NodeProps } from 'reactflow'
import type { SourceNodeData } from './layout'

const hidden = { opacity: 0 }

/** Компактный узел-источник: Telegram, слушатель-Worker, расписания. */
export default function SourceNode({ data }: NodeProps<SourceNodeData & { active?: boolean }>) {
  return (
    <div className={`source-node ${data.active ? 'source-node--active' : ''}`}>
      <Handle id="in-t" type="target" position={Position.Top} style={hidden} />
      <Handle id="out-b" type="source" position={Position.Bottom} style={hidden} />
      <Handle id="out-r" type="source" position={Position.Right} style={hidden} />
      <Handle id="out-l" type="source" position={Position.Left} style={hidden} />
      <span className="source-node__icon">{data.icon}</span>
      <span className="source-node__text">
        <b>{data.label}</b>
        <small>{data.sub}</small>
      </span>
    </div>
  )
}
