import type { DayCell } from './stats'

/** Столбики запусков по дням; ошибки — красной верхушкой столбика. */
export default function Sparkline({ cells, color }: { cells: DayCell[]; color: string }) {
  const w = 280
  const h = 56
  const max = Math.max(1, ...cells.map((c) => c.total))
  const bw = w / cells.length
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sparkline">
      {cells.map((c, i) => {
        const total = (c.total / max) * (h - 4)
        const err = (c.errors / max) * (h - 4)
        return (
          <g key={c.key}>
            <title>{`${c.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}: ${c.total}`}</title>
            <rect x={i * bw + 1} y={h - total} width={bw - 2} height={total} rx={1.5} fill={color} fillOpacity={0.75} />
            {c.errors > 0 && <rect x={i * bw + 1} y={h - total} width={bw - 2} height={err} rx={1.5} fill="#ef4444" />}
          </g>
        )
      })}
      <line x1={0} y1={h - 0.5} x2={w} y2={h - 0.5} stroke="#2a3040" />
    </svg>
  )
}
