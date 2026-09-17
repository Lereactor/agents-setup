import ReactFlow, { Background, Controls as ZoomControls, type Edge, type Node } from 'reactflow'
import 'reactflow/dist/style.css'
import CustomNode from './CustomNode'
import type { FlowNodeData } from './layout'

const nodeTypes = { agentNode: CustomNode }

interface Props {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
  onNodeClick: (nodeId: string) => void
}

export default function GraphCanvas({ nodes, edges, onNodeClick }: Props) {
  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} color="#232733" />
        <ZoomControls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
