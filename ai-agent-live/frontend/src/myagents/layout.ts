import type { Edge, Node } from 'reactflow'
import type { AgentId } from './types'

export interface SourceNodeData {
  label: string
  icon: string
  sub: string
}

export interface ParticleEdgeData {
  color: string
  /** Агент, к которому ведёт ребро — по его активности ребро «оживает». */
  agent: AgentId
  /** Ребро наблюдения надзирателя: пунктир, без частиц. */
  watch?: boolean
}

/** Топология и раскладка «на один экран», без пересечений линий:
 *
 *                    🦁 Лев
 *     🛒 Покупки        │        🚆 Поездки
 *                ╲      │      ╱
 *                  ⚡ Слушатель
 *                ╱      │      ╲
 *     🥕 Продукты       │        🏡 Жильё
 *                       │
 *          📰 Новости ─ 🛡️ Надзиратель
 *
 *  Надзиратель связан со слушателем (пауза и повтор идут через его /admin) и с новостями.
 *  Расписания — строкой на карточках Новостей и Надзирателя. Ось симметрии x = 385. */
export const sourceNodes: Node<SourceNodeData>[] = [
  { id: 'telegram', type: 'source', position: { x: 300, y: 0 }, data: { label: 'Лев', icon: '🦁', sub: 'пишет в Telegram' } },
  { id: 'worker', type: 'source', position: { x: 300, y: 215 }, data: { label: 'Слушатель', icon: '⚡', sub: 'Cloudflare Worker' } },
]

export const AGENT_POSITIONS: Record<AgentId, { x: number; y: number }> = {
  shopping: { x: -60, y: 0 },
  grocery: { x: -60, y: 250 },
  travel: { x: 570, y: 0 },
  booking: { x: 570, y: 250 },
  'news-digest': { x: -25, y: 510 },
  watchdog: { x: 255, y: 510 },
}

export const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  ...Object.fromEntries(sourceNodes.map((n) => [n.id, n.position])),
  ...AGENT_POSITIONS,
}

type EdgeSpec = Omit<Edge<ParticleEdgeData>, 'type'> & { data: ParticleEdgeData }

const COLORS: Record<AgentId, string> = {
  shopping: '#3d8bff',
  grocery: '#4cc96b',
  travel: '#26c6da',
  booking: '#ff8a65',
  'news-digest': '#ffb347',
  watchdog: '#b18cff',
}

// Стороны подключения ParticleEdge выбирает сам по взаимному положению карточек, поэтому
// после перетаскивания линии остаются теми же связями и цепляются за ближнюю сторону.
const specs: EdgeSpec[] = [
  { id: 'tg-worker', source: 'telegram', target: 'worker', data: { color: '#58a6ff', agent: 'shopping' } },
  { id: 'worker-shopping', source: 'worker', target: 'shopping', data: { color: COLORS.shopping, agent: 'shopping' } },
  { id: 'worker-grocery', source: 'worker', target: 'grocery', data: { color: COLORS.grocery, agent: 'grocery' } },
  { id: 'worker-travel', source: 'worker', target: 'travel', data: { color: COLORS.travel, agent: 'travel' } },
  { id: 'worker-booking', source: 'worker', target: 'booking', data: { color: COLORS.booking, agent: 'booking' } },
  { id: 'watch-worker', source: 'watchdog', target: 'worker', data: { color: COLORS.watchdog, agent: 'watchdog', watch: true } },
  { id: 'watch-news', source: 'watchdog', target: 'news-digest', data: { color: COLORS.watchdog, agent: 'watchdog', watch: true } },
]

export const baseEdges: Edge<ParticleEdgeData>[] = specs.map((e) => ({ ...e, type: 'particle' }))

/** Ребро Лев → Слушатель общее для агентов по сообщению — оживает от любого из них. */
export function edgeAgents(edge: Edge<ParticleEdgeData>): AgentId[] {
  return edge.id === 'tg-worker' ? ['shopping', 'grocery', 'travel', 'booking'] : [edge.data!.agent]
}
