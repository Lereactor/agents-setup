import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Edge, Node } from 'reactflow'
import { connectRunSocket, fetchRunEvents, listRuns, startRun, type RunSummary } from './api/client'
import type { AgentEvent, NodeRunStatus } from './events/types'
import GraphCanvas from './graph/GraphCanvas'
import { initialEdges, initialNodes, type FlowNodeData } from './graph/layout'
import Sidebar from './components/Sidebar'
import EventStream from './components/EventStream'
import Toolbar, { SAMPLE_PROMPTS } from './components/Toolbar'
import TopBar, { type RunStatus } from './components/TopBar'

type EdgeState = 'idle' | 'active' | 'done'
type NodeRuntime = Partial<Pick<FlowNodeData, 'status' | 'durationMs' | 'toolCalls' | 'summary'>>
type Mode = 'idle' | 'live' | 'replay'

const AGENT_NODE_IDS = initialNodes.filter((n) => n.data.kind !== 'tool').map((n) => n.id)

function emptyRuntime(): Record<string, NodeRuntime> {
  const acc: Record<string, NodeRuntime> = {}
  for (const node of initialNodes) acc[node.id] = { status: 'pending' }
  return acc
}

function emptyEdgeState(): Record<string, EdgeState> {
  const acc: Record<string, EdgeState> = {}
  for (const edge of initialEdges) acc[edge.id] = 'idle'
  return acc
}

function replayDelayMs(prevTs: string | null, ts: string, speed: number): number {
  if (!prevTs) return 0
  const delta = Date.parse(ts) - Date.parse(prevTs)
  const clamped = Math.min(Math.max(delta, 60), 1800)
  return clamped / speed
}

export default function App() {
  const [promptValue, setPromptValue] = useState('')
  const [mode, setMode] = useState<Mode>('idle')
  const [runId, setRunId] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [nodesRuntime, setNodesRuntime] = useState<Record<string, NodeRuntime>>(emptyRuntime)
  const [edgesState, setEdgesState] = useState<Record<string, EdgeState>>(emptyEdgeState)
  const [eventLog, setEventLog] = useState<AgentEvent[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [savedRuns, setSavedRuns] = useState<RunSummary[]>([])
  const [replaySpeed, setReplaySpeed] = useState(1)
  const [finalReport, setFinalReport] = useState<string | null>(null)

  const disconnectRef = useRef<(() => void) | null>(null)
  const replayCancelledRef = useRef(false)

  const incomingEdges = useMemo(() => {
    const acc: Record<string, Edge[]> = {}
    for (const edge of initialEdges) {
      acc[edge.target] = [...(acc[edge.target] ?? []), edge]
    }
    return acc
  }, [])

  const refreshSavedRuns = useCallback(() => {
    listRuns()
      .then(setSavedRuns)
      .catch(() => setSavedRuns([]))
  }, [])

  useEffect(() => {
    refreshSavedRuns()
  }, [refreshSavedRuns])

  useEffect(() => {
    if (runStatus !== 'running' || runStartedAt === null) return
    const id = window.setInterval(() => setElapsedMs(Date.now() - runStartedAt), 250)
    return () => window.clearInterval(id)
  }, [runStatus, runStartedAt])

  const startNode = useCallback(
    (nodeId: string, patch: NodeRuntime = {}) => {
      setNodesRuntime((prev) => ({ ...prev, [nodeId]: { ...prev[nodeId], status: 'running', ...patch } }))
      setEdgesState((prev) => {
        const next = { ...prev }
        for (const edge of incomingEdges[nodeId] ?? []) next[edge.id] = 'active'
        return next
      })
    },
    [incomingEdges],
  )

  const completeNode = useCallback(
    (nodeId: string, patch: NodeRuntime = {}, status: NodeRunStatus = 'completed') => {
      setNodesRuntime((prev) => ({ ...prev, [nodeId]: { ...prev[nodeId], ...patch, status } }))
      setEdgesState((prev) => {
        const next = { ...prev }
        for (const edge of incomingEdges[nodeId] ?? []) next[edge.id] = 'done'
        return next
      })
    },
    [incomingEdges],
  )

  const applyEvent = useCallback(
    (event: AgentEvent) => {
      setEventLog((log) => [...log, event])

      switch (event.type) {
        case 'RUN_STARTED':
          setRunStatus('running')
          setRunStartedAt(Date.parse(event.timestamp))
          break
        case 'NODE_STARTED':
          if (event.node_id !== 'run') startNode(event.node_id)
          break
        case 'NODE_THINKING':
          setNodesRuntime((prev) => ({
            ...prev,
            [event.node_id]: { ...prev[event.node_id], status: 'running', summary: event.summary ?? prev[event.node_id]?.summary },
          }))
          break
        case 'TOOL_CALL':
          if (event.tool) startNode(event.tool)
          break
        case 'TOOL_RESULT':
          if (event.tool) {
            completeNode(event.tool, { durationMs: event.duration_ms ?? undefined, summary: event.summary ?? undefined })
            setNodesRuntime((prev) => ({
              ...prev,
              [event.node_id]: { ...prev[event.node_id], toolCalls: (prev[event.node_id]?.toolCalls ?? 0) + 1 },
            }))
          }
          break
        case 'NODE_COMPLETED':
          if (event.node_id !== 'run') {
            completeNode(event.node_id, { durationMs: event.duration_ms ?? undefined, summary: event.summary ?? undefined })
          }
          break
        case 'NODE_ERROR':
          completeNode(event.node_id, { summary: event.summary ?? undefined }, 'error')
          break
        case 'EDGE_ACTIVE':
          // не-op: incomingEdges (статическая топология) уже накрывает это через
          // NODE_STARTED/TOOL_CALL — событие оставлено только для event stream снизу
          break
        case 'RUN_COMPLETED': {
          setRunStatus(event.status === 'error' ? 'error' : 'completed')
          const metadata = event.metadata as { final_report?: string } | null
          setFinalReport(metadata?.final_report ?? null)
          refreshSavedRuns()
          break
        }
        default:
          break
      }
    },
    [startNode, completeNode, refreshSavedRuns],
  )

  const resetForNewRun = useCallback(() => {
    setNodesRuntime(emptyRuntime())
    setEdgesState(emptyEdgeState())
    setEventLog([])
    setSelectedNodeId(null)
    setElapsedMs(0)
    setRunStartedAt(null)
    setFinalReport(null)
    setRunStatus('idle')
  }, [])

  const launchLiveRun = useCallback(
    (prompt: string) => {
      disconnectRef.current?.()
      replayCancelledRef.current = true
      resetForNewRun()
      setMode('live')
      startRun(prompt)
        .then(({ run_id }) => {
          setRunId(run_id)
          disconnectRef.current = connectRunSocket(run_id, applyEvent, () => {
            /* сокет закрылся — RUN_COMPLETED уже применён к состоянию, ничего доделывать не надо */
          })
        })
        .catch((err) => {
          setRunStatus('error')
          console.error(err)
        })
    },
    [applyEvent, resetForNewRun],
  )

  const handleStartRun = useCallback(() => {
    if (!promptValue.trim()) return
    launchLiveRun(promptValue.trim())
  }, [promptValue, launchLiveRun])

  const handleStartDemo = useCallback(() => {
    const demoPrompt = SAMPLE_PROMPTS[0]
    setPromptValue(demoPrompt)
    launchLiveRun(demoPrompt)
  }, [launchLiveRun])

  const handleStop = useCallback(() => {
    disconnectRef.current?.()
    disconnectRef.current = null
    replayCancelledRef.current = true
    setRunStatus('idle')
    setMode('idle')
  }, [])

  const handleClear = useCallback(() => {
    disconnectRef.current?.()
    disconnectRef.current = null
    replayCancelledRef.current = true
    setRunId(null)
    setPromptValue('')
    setMode('idle')
    resetForNewRun()
  }, [resetForNewRun])

  const handleReplay = useCallback(
    (targetRunId: string) => {
      disconnectRef.current?.()
      replayCancelledRef.current = true
      resetForNewRun()
      setMode('replay')
      setRunId(targetRunId)

      fetchRunEvents(targetRunId)
        .then((events) => {
          replayCancelledRef.current = false
          let index = 0
          let prevTs: string | null = null

          const step = () => {
            if (replayCancelledRef.current || index >= events.length) return
            const event = events[index]
            applyEvent(event)
            const delay = replayDelayMs(prevTs, event.timestamp, replaySpeed)
            prevTs = event.timestamp
            index += 1
            window.setTimeout(step, delay)
          }
          step()
        })
        .catch((err) => {
          setRunStatus('error')
          console.error(err)
        })
    },
    [applyEvent, replaySpeed, resetForNewRun],
  )

  const nodes: Node<FlowNodeData>[] = useMemo(
    () =>
      initialNodes.map((node) => ({
        ...node,
        data: { ...node.data, ...nodesRuntime[node.id] },
      })),
    [nodesRuntime],
  )

  const edges: Edge[] = useMemo(
    () =>
      initialEdges.map((edge) => {
        const state = edgesState[edge.id] ?? 'idle'
        return {
          ...edge,
          animated: state === 'active',
          style: {
            stroke: state === 'done' ? '#3fb950' : state === 'active' ? '#58a6ff' : '#3a3f4b',
            strokeWidth: state === 'idle' ? 1.5 : 2.5,
          },
        }
      }),
    [edgesState],
  )

  const selectedData = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId)?.data ?? null : null
  const nodesCompleted = AGENT_NODE_IDS.filter((id) => nodesRuntime[id]?.status === 'completed').length
  const toolsUsed = Object.values(nodesRuntime).reduce((sum, n) => sum + (n.toolCalls ?? 0), 0)
  const isRunning = mode !== 'idle' && runStatus === 'running'

  return (
    <div className="app-shell">
      <div className="topbar-wrap">
        <TopBar
          runId={runId}
          status={runStatus}
          elapsedMs={elapsedMs}
          nodesCompleted={nodesCompleted}
          totalNodes={AGENT_NODE_IDS.length}
          toolsUsed={toolsUsed}
        />
        <Toolbar
          promptValue={promptValue}
          onPromptChange={setPromptValue}
          onStartRun={handleStartRun}
          onStartDemo={handleStartDemo}
          onStop={handleStop}
          onClear={handleClear}
          isRunning={isRunning}
          savedRuns={savedRuns}
          onReplay={handleReplay}
          replaySpeed={replaySpeed}
          onReplaySpeedChange={setReplaySpeed}
        />
      </div>
      <GraphCanvas nodes={nodes} edges={edges} onNodeClick={setSelectedNodeId} />
      <Sidebar nodeId={selectedNodeId} data={selectedData} />
      <EventStream events={eventLog} />
      {finalReport && (
        <div className="final-report">
          <div className="final-report__header">
            <h4>Final Report</h4>
            <button onClick={() => setFinalReport(null)}>×</button>
          </div>
          <pre>{finalReport}</pre>
        </div>
      )}
    </div>
  )
}
