export type EventType =
  | 'RUN_STARTED'
  | 'NODE_STARTED'
  | 'NODE_THINKING'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'NODE_COMPLETED'
  | 'NODE_ERROR'
  | 'EDGE_ACTIVE'
  | 'RUN_COMPLETED'

export type NodeRunStatus = 'pending' | 'running' | 'completed' | 'error'

export interface AgentEvent {
  event_id: string
  run_id: string
  timestamp: string
  type: EventType
  node_id: string
  node_type?: string | null
  status?: NodeRunStatus | null
  parent_node_id?: string | null
  tool?: string | null
  summary?: string | null
  duration_ms?: number | null
  metadata?: Record<string, unknown> | null
}
