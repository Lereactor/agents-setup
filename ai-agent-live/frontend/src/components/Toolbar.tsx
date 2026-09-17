import type { RunSummary } from '../api/client'

export const SAMPLE_PROMPTS = [
  'Проанализируй причины роста нагрузки на команду сопровождения корпоративных систем и подготовь краткие рекомендации руководителю.',
  'Сравни три подхода к внедрению AI-агентов.',
  'Подготовь краткий управленческий отчёт по проблеме.',
]

export const REPLAY_SPEEDS = [0.5, 1, 2, 4] as const

interface Props {
  promptValue: string
  onPromptChange: (value: string) => void
  onStartRun: () => void
  onStartDemo: () => void
  onStop: () => void
  onClear: () => void
  isRunning: boolean
  savedRuns: RunSummary[]
  onReplay: (runId: string) => void
  replaySpeed: number
  onReplaySpeedChange: (speed: number) => void
}

export default function Toolbar({
  promptValue,
  onPromptChange,
  onStartRun,
  onStartDemo,
  onStop,
  onClear,
  isRunning,
  savedRuns,
  onReplay,
  replaySpeed,
  onReplaySpeedChange,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar__row">
        <input
          className="toolbar__input"
          placeholder="Опишите задачу для мультиагентного workflow…"
          value={promptValue}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={isRunning}
        />
        <button onClick={onStartRun} disabled={isRunning || !promptValue.trim()}>
          New Run
        </button>
        <button onClick={onStartDemo} disabled={isRunning}>
          Start Demo
        </button>
        <button onClick={onStop} disabled={!isRunning}>
          Stop
        </button>
        <button onClick={onClear} disabled={isRunning}>
          Clear
        </button>
      </div>

      <div className="toolbar__row toolbar__row--samples">
        {SAMPLE_PROMPTS.map((sample) => (
          <button key={sample} className="toolbar__sample" onClick={() => onPromptChange(sample)} disabled={isRunning}>
            {sample.length > 42 ? `${sample.slice(0, 42)}…` : sample}
          </button>
        ))}
      </div>

      <div className="toolbar__row toolbar__row--replay">
        <span className="toolbar__label">Replay:</span>
        <select
          disabled={isRunning || savedRuns.length === 0}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onReplay(e.target.value)
          }}
        >
          <option value="" disabled>
            {savedRuns.length ? 'выбрать сохранённый run' : 'нет сохранённых run'}
          </option>
          {savedRuns.map((run) => (
            <option key={run.run_id} value={run.run_id}>
              {run.run_id.slice(0, 8)} — {run.prompt.slice(0, 40)}
            </option>
          ))}
        </select>
        <span className="toolbar__label">Speed:</span>
        {REPLAY_SPEEDS.map((speed) => (
          <button
            key={speed}
            className={`toolbar__speed ${replaySpeed === speed ? 'toolbar__speed--active' : ''}`}
            onClick={() => onReplaySpeedChange(speed)}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  )
}
