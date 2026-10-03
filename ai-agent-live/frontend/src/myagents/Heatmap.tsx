import { useMemo } from 'react'
import { AGENT_ORDER, AGENTS } from './agents'
import { runsByDay } from './stats'
import type { AgentRun } from './types'

const DAYS = 30
const CELL = 15
const GAP = 3
const LABEL_W = 92

interface Props {
  runs: AgentRun[]
  selectedDay: string | null
  onSelectDay: (day: string | null) => void
}

/** Агенты × последние 30 дней: яркость — число запусков, красная точка — была ошибка. */
export default function Heatmap({ runs, selectedDay, onSelectDay }: Props) {
  const rows = useMemo(
    () =>
      AGENT_ORDER.map((agent) => {
        const cells = runsByDay(runs.filter((r) => r.agent === agent), DAYS)
        const max = Math.max(1, ...cells.map((c) => c.total))
        return { agent, cells, max }
      }),
    [runs],
  )
  const days = rows[0]?.cells ?? []
  const width = LABEL_W + DAYS * (CELL + GAP)
  const height = 16 + AGENT_ORDER.length * (CELL + GAP)

  return (
    <div className="heatmap">
      <div className="panel-title">
        Активность за 30 дней
        {selectedDay && (
          <button className="chip chip--clear" onClick={() => onSelectDay(null)}>
            {new Date(selectedDay).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} ×
          </button>
        )}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="heatmap__svg">
        {days.map((d, i) =>
          (d.date.getDate() === 1 && i < DAYS - 4) || i === 0 || i === DAYS - 1 ? (
            <text
              key={d.key}
              x={i === DAYS - 1 ? LABEL_W + i * (CELL + GAP) + CELL : LABEL_W + i * (CELL + GAP)}
              y={10}
              textAnchor={i === DAYS - 1 ? 'end' : 'start'}
              className="heatmap__axis"
            >
              {d.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            </text>
          ) : null,
        )}
        {rows.map(({ agent, cells, max }, row) => {
          const y = 16 + row * (CELL + GAP)
          const color = AGENTS[agent].color
          return (
            <g key={agent}>
              <text x={0} y={y + CELL - 3} className="heatmap__label">
                {AGENTS[agent].emoji} {AGENTS[agent].title}
              </text>
              {cells.map((cell, i) => {
                const x = LABEL_W + i * (CELL + GAP)
                const intensity = cell.total ? 0.25 + 0.75 * (cell.total / max) : 0
                const selected = selectedDay === cell.key
                return (
                  <g key={cell.key} className="heatmap__cell" onClick={() => onSelectDay(selected ? null : cell.key)}>
                    <title>
                      {`${AGENTS[agent].title}, ${cell.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}: ` +
                        `${cell.total} запуск(ов)${cell.errors ? `, ошибок: ${cell.errors}` : ''}`}
                    </title>
                    <rect
                      x={x}
                      y={y}
                      width={CELL}
                      height={CELL}
                      rx={3}
                      fill={cell.total ? color : '#1c2130'}
                      fillOpacity={cell.total ? intensity : 1}
                      stroke={selected ? '#fff' : 'none'}
                      strokeWidth={1.5}
                    />
                    {cell.errors > 0 && <circle cx={x + CELL - 3} cy={y + 3} r={2.6} fill="#ef4444" stroke="#0b0d12" strokeWidth={0.8} />}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
