export type RunStatus = 'idle' | 'running' | 'completed' | 'error'

interface Props {
  runId: string | null
  status: RunStatus
  elapsedMs: number
  nodesCompleted: number
  totalNodes: number
  toolsUsed: number
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const STATUS_TEXT: Record<RunStatus, string> = {
  idle: 'ожидание запуска',
  running: 'выполняется',
  completed: 'завершено',
  error: 'ошибка',
}

export default function TopBar({ runId, status, elapsedMs, nodesCompleted, totalNodes, toolsUsed }: Props) {
  return (
    <div className="topbar">
      <div className="topbar__title">AI Agent Live Visualization</div>
      <div className="topbar__stats">
        <span>RUN {runId ? runId.slice(0, 8) : '—'}</span>
        <span>{formatElapsed(elapsedMs)}</span>
        <span className={`topbar__status topbar__status--${status}`}>{STATUS_TEXT[status]}</span>
        <span>
          {nodesCompleted}/{totalNodes} узлов
        </span>
        <span>{toolsUsed} tool calls</span>
      </div>
    </div>
  )
}
