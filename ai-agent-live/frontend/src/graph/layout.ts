import type { Edge, Node } from 'reactflow'
import { MarkerType } from 'reactflow'
import type { NodeRunStatus } from '../events/types'

export type NodeKind = 'supervisor' | 'agent' | 'tool'

export interface FlowNodeData {
  label: string
  kind: NodeKind
  status?: NodeRunStatus
  durationMs?: number
  toolCalls?: number
  summary?: string
}

/** Фиксированный граф из docx: Supervisor → (Researcher ∥ Analyst) → Reviewer → Writer,
 * плюс инструменты как отдельные узлы под своим агентом. Backend всегда шлёт события
 * ровно с этими node_id — граф статичный, меняется только визуальный статус узлов/рёбер. */
export const initialNodes: Node<FlowNodeData>[] = [
  { id: 'supervisor', position: { x: 400, y: 0 }, data: { label: 'Supervisor', kind: 'supervisor' }, type: 'agentNode' },
  { id: 'researcher', position: { x: 150, y: 160 }, data: { label: 'Researcher', kind: 'agent' }, type: 'agentNode' },
  { id: 'analyst', position: { x: 650, y: 160 }, data: { label: 'Analyst', kind: 'agent' }, type: 'agentNode' },
  { id: 'web_search', position: { x: 0, y: 320 }, data: { label: 'Web Search', kind: 'tool' }, type: 'agentNode' },
  { id: 'document_search', position: { x: 260, y: 320 }, data: { label: 'Document Search', kind: 'tool' }, type: 'agentNode' },
  { id: 'data_analysis', position: { x: 540, y: 320 }, data: { label: 'Data Analysis', kind: 'tool' }, type: 'agentNode' },
  { id: 'calculator', position: { x: 780, y: 320 }, data: { label: 'Calculator', kind: 'tool' }, type: 'agentNode' },
  { id: 'reviewer', position: { x: 400, y: 470 }, data: { label: 'Reviewer', kind: 'agent' }, type: 'agentNode' },
  { id: 'writer', position: { x: 400, y: 620 }, data: { label: 'Writer', kind: 'agent' }, type: 'agentNode' },
]

export const initialEdges: Edge[] = [
  { id: 'e-supervisor-researcher', source: 'supervisor', target: 'researcher' },
  { id: 'e-supervisor-analyst', source: 'supervisor', target: 'analyst' },
  { id: 'e-researcher-web_search', source: 'researcher', target: 'web_search' },
  { id: 'e-researcher-document_search', source: 'researcher', target: 'document_search' },
  { id: 'e-analyst-data_analysis', source: 'analyst', target: 'data_analysis' },
  { id: 'e-analyst-calculator', source: 'analyst', target: 'calculator' },
  { id: 'e-researcher-reviewer', source: 'researcher', target: 'reviewer' },
  { id: 'e-analyst-reviewer', source: 'analyst', target: 'reviewer' },
  { id: 'e-reviewer-writer', source: 'reviewer', target: 'writer' },
].map((e) => ({ ...e, markerEnd: { type: MarkerType.ArrowClosed } }))
