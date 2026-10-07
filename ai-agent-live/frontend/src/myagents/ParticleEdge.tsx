import { useCallback } from 'react'
import { getBezierPath, Position, useStore, type EdgeProps, type Node, type ReactFlowState } from 'reactflow'
import type { ParticleEdgeData } from './layout'

type Box = { x: number; y: number; w: number; h: number }

function boxOf(node: Node | undefined): Box | null {
  const p = node?.positionAbsolute
  if (!node || !p || !node.width || !node.height) return null
  return { x: p.x, y: p.y, w: node.width, h: node.height }
}

/** Точка и сторона подключения: середина стороны, обращённой к другой карточке
 *  (по преобладающему направлению между центрами). */
function anchor(from: Box, to: Box): { x: number; y: number; pos: Position } {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2)
  const dy = to.y + to.h / 2 - (from.y + from.h / 2)
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { x: from.x + from.w, y: from.y + from.h / 2, pos: Position.Right }
      : { x: from.x, y: from.y + from.h / 2, pos: Position.Left }
  }
  return dy >= 0
    ? { x: from.x + from.w / 2, y: from.y + from.h, pos: Position.Bottom }
    : { x: from.x + from.w / 2, y: from.y, pos: Position.Top }
}

/** Ребро, по которому бегут светящиеся частицы, пока агент на его конце активен.
 *  Концы считаются от текущих карточек — после перетаскивания линия цепляется за ближнюю сторону. */
export default function ParticleEdge(props: EdgeProps<ParticleEdgeData & { active?: boolean }>) {
  const { id, source, target, data } = props
  const sourceNode = useStore(useCallback((s: ReactFlowState) => s.nodeInternals.get(source), [source]))
  const targetNode = useStore(useCallback((s: ReactFlowState) => s.nodeInternals.get(target), [target]))
  const a = boxOf(sourceNode)
  const b = boxOf(targetNode)

  let path: string
  if (a && b) {
    const s = anchor(a, b)
    const t = anchor(b, a)
    ;[path] = getBezierPath({ sourceX: s.x, sourceY: s.y, sourcePosition: s.pos, targetX: t.x, targetY: t.y, targetPosition: t.pos })
  } else {
    ;[path] = getBezierPath(props)
  }

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
          strokeOpacity: active ? 0.85 : watch ? 0.3 : 0.3,
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
