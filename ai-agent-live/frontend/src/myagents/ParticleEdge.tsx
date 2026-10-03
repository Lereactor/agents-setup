import { getBezierPath, type EdgeProps } from 'reactflow'
import type { ParticleEdgeData } from './layout'

/** Ребро, по которому бегут светящиеся частицы, пока агент на его конце активен. */
export default function ParticleEdge(props: EdgeProps<ParticleEdgeData & { active?: boolean }>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const color = data?.color ?? '#58a6ff'
  const active = !!data?.active
  const watch = !!data?.watch

  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        className={`react-flow__edge-path ${watch && active ? 'edge-watch--scan' : ''}`}
        style={{
          stroke: color,
          strokeOpacity: active ? 0.85 : watch ? 0.22 : 0.3,
          strokeWidth: active ? 2.5 : 1.5,
          strokeDasharray: watch ? '4 6' : undefined,
          filter: active ? `drop-shadow(0 0 4px ${color})` : undefined,
          transition: 'stroke-opacity .4s, stroke-width .4s',
        }}
      />
      {active &&
        !watch &&
        [0, 0.5, 1].map((delay) => (
          <circle key={delay} r="4" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
            <animateMotion dur="1.5s" repeatCount="indefinite" begin={`-${delay}s`} path={path} />
          </circle>
        ))}
    </>
  )
}
