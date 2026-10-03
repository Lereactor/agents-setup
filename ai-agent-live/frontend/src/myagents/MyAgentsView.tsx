import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, type Edge, type Node } from 'reactflow'
import 'reactflow/dist/style.css'
import AgentCardNode, { type AgentCardData } from './AgentCardNode'
import AgentPanel from './AgentPanel'
import { AGENT_ORDER, isAgentId } from './agents'
import Heatmap from './Heatmap'
import HistoryFeed from './HistoryFeed'
import { AGENT_POSITIONS, baseEdges, edgeAgents, sourceNodes, type ParticleEdgeData } from './layout'
import ParticleEdge from './ParticleEdge'
import SourceNode from './SourceNode'
import { formatAgo, todayCounts } from './stats'
import type { AgentId, AgentRun, RunStatus } from './types'
import { useAgentLog } from './useAgentLog'
import { REPLAY_PERIODS, useReplay } from './useReplay'
import './myagents.css'

const nodeTypes = { agentCard: AgentCardNode, source: SourceNode }
const edgeTypes = { particle: ParticleEdge }

const FLASH_MS = 2600
const PULSE_LIVE_MS = 4000
const PULSE_REPLAY_MS = 1400

type Flash = { status: RunStatus; key: number }

/** Ребро к агенту от источника: какой источник «зажигать» вместе с агентом. */
const SOURCES_OF: Record<AgentId, string[]> = {
  shopping: ['telegram', 'worker'],
  grocery: ['telegram', 'worker'],
  'news-digest': ['cron-news'],
  watchdog: ['cron-watch'],
}

export default function MyAgentsView() {
  const [flash, setFlash] = useState<Partial<Record<AgentId, Flash>>>({})
  const [pulseUntil, setPulseUntil] = useState<Partial<Record<AgentId, number>>>({})
  const [replayLast, setReplayLast] = useState<Partial<Record<AgentId, AgentRun>>>({})
  const [selected, setSelected] = useState<AgentId | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [, forceTick] = useState(0)
  const flashSeq = useRef(0)
  const replayingRef = useRef(false)

  const fire = useCallback((agent: AgentId, status: RunStatus, pulseMs: number) => {
    const key = ++flashSeq.current
    if (status !== 'running') {
      setFlash((f) => ({ ...f, [agent]: { status, key } }))
      window.setTimeout(() => setFlash((f) => (f[agent]?.key === key ? { ...f, [agent]: undefined } : f)), FLASH_MS)
    }
    setPulseUntil((p) => ({ ...p, [agent]: Date.now() + pulseMs }))
    window.setTimeout(() => forceTick((n) => n + 1), pulseMs + 50)
  }, [])

  const log = useAgentLog(
    useCallback(
      (changes: AgentRun[]) => {
        if (replayingRef.current) return // во время таймлапса живые вспышки на паузе
        for (const run of changes) if (isAgentId(run.agent)) fire(run.agent, run.status, PULSE_LIVE_MS)
      },
      [fire],
    ),
  )

  const replay = useReplay(
    log.runs,
    useCallback(
      (run: AgentRun) => {
        if (!isAgentId(run.agent)) return
        setReplayLast((r) => ({ ...r, [run.agent]: run }))
        fire(run.agent, run.status === 'running' || run.status === 'stale' ? 'success' : run.status, PULSE_REPLAY_MS)
      },
      [fire],
    ),
  )
  replayingRef.current = replay.playing

  useEffect(() => {
    if (!replay.playing) setReplayLast({})
  }, [replay.playing])

  // Тик раз в 5 с — чтобы «обновлено N с назад» и «N мин назад» на карточках не застывали.
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 5000)
    return () => window.clearInterval(id)
  }, [])

  const byAgent = useMemo(() => {
    const acc = {} as Record<AgentId, AgentRun[]>
    for (const a of AGENT_ORDER) acc[a] = []
    for (const r of log.runs) if (isAgentId(r.agent)) acc[r.agent].push(r)
    return acc
  }, [log.runs])

  const now = Date.now()
  const agentState = AGENT_ORDER.reduce(
    (acc, agent) => {
      const runs = byAgent[agent]
      const current = replay.playing ? null : [...runs].reverse().find((r) => r.status === 'running' || r.status === 'stale') ?? null
      const last = replay.playing
        ? replayLast[agent] ?? null
        : [...runs].reverse().find((r) => r.status !== 'running' && r.status !== 'stale') ?? null
      const active = current?.status === 'running' || (pulseUntil[agent] ?? 0) > now
      acc[agent] = { current, last, active }
      return acc
    },
    {} as Record<AgentId, { current: AgentRun | null; last: AgentRun | null; active: boolean }>,
  )

  const nodes: Node[] = [
    ...sourceNodes.map((n) => ({
      ...n,
      data: { ...n.data, active: AGENT_ORDER.some((a) => agentState[a].active && SOURCES_OF[a].includes(n.id)) },
    })),
    ...AGENT_ORDER.map(
      (agent): Node<AgentCardData> => ({
        id: agent,
        type: 'agentCard',
        position: AGENT_POSITIONS[agent],
        data: {
          agent,
          current: agentState[agent].current,
          last: agentState[agent].last,
          flash: flash[agent] ?? null,
          today: todayCounts(byAgent[agent]),
          selected: selected === agent,
        },
      }),
    ),
  ]

  const edges: Edge<ParticleEdgeData & { active: boolean }>[] = baseEdges.map((e) => ({
    ...e,
    data: { ...e.data!, active: edgeAgents(e).some((a) => agentState[a].active) },
  }))

  const runningCount = AGENT_ORDER.filter((a) => agentState[a].current?.status === 'running').length

  return (
    <div className="ma-shell">
      <header className="ma-header">
        <div className="ma-header__title">
          <span className="ma-logo">◉</span> Мои агенты
          {log.mock && <span className="chip chip--mock">демо-данные (?mock)</span>}
        </div>
        <div className="ma-header__status">
          {log.error ? (
            <span className="live-pill live-pill--err">● нет связи с логом</span>
          ) : log.staleData ? (
            <span className="live-pill live-pill--warn">● данные устарели — Google не ответил</span>
          ) : log.loading ? (
            <span className="live-pill">● загрузка…</span>
          ) : (
            <span className="live-pill live-pill--ok">
              <i /> онлайн · обновлено {log.fetchedAt ? formatAgo(log.fetchedAt, now) : '—'}
              {runningCount > 0 && <b> · работают сейчас: {runningCount}</b>}
            </span>
          )}
        </div>
        <div className="ma-header__replay">
          {replay.playing ? (
            <>
              <div className="replay-bar">
                <div className="replay-bar__fill" style={{ width: `${replay.progress * 100}%` }} />
                <span>
                  {replay.virtualTime &&
                    new Date(replay.virtualTime).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <button className="btn" onClick={replay.stop}>
                ■ стоп
              </button>
            </>
          ) : (
            <>
              <span className="dim">Проиграть историю:</span>
              {REPLAY_PERIODS.map((p) => (
                <button key={p.days} className="btn" disabled={!log.runs.length} onClick={() => replay.start(p.days)}>
                  ▶ {p.label}
                </button>
              ))}
            </>
          )}
        </div>
      </header>

      <div className="ma-canvas">
        {log.error === 'not_configured' && (
          <div className="ma-overlay">
            <h3>Лог агентов не подключён</h3>
            <ol>
              <li>
                Откройте файл <code>ai-agent-live\backend\.env</code> в Блокноте.
              </li>
              <li>
                Допишите две строки из <code>sheets_api.txt</code>: <code>SHEETS_LOG_URL=…</code> и <code>SHEETS_LOG_TOKEN=…</code>
              </li>
              <li>
                Перезапустите: <code>stop_windows.bat</code>, затем <code>start_windows.bat</code>.
              </li>
            </ol>
          </div>
        )}
        {(log.error === 'network' || log.error === 'unavailable') && !log.runs.length && (
          <div className="ma-overlay">
            <h3>{log.error === 'network' ? 'Backend не отвечает' : 'Google Sheets не ответил'}</h3>
            <p className="dim">
              {log.error === 'network'
                ? 'Проверьте окно «AI Agent Live - backend» — нет ли там ошибки. Повтор каждые 30 с.'
                : 'Похоже на разовый сбой Apps Script. Повтор каждые 30 с.'}
            </p>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_, node) => isAgentId(node.id) && setSelected(selected === node.id ? null : node.id)}
          onPaneClick={() => setSelected(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.3}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={28} color="#1d2333" />
        </ReactFlow>
      </div>

      <AgentPanel agent={selected} runs={log.runs} onSelect={setSelected} />

      <div className="ma-bottom">
        <Heatmap runs={log.runs} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        <HistoryFeed runs={log.runs} day={selectedDay} agentFilter={selected} onAgentFilter={setSelected} />
      </div>
    </div>
  )
}
