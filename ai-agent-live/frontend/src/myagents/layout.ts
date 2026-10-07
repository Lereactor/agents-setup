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

/** Статичная топология системы агентов (см. agents-setup-brief.md и дизайн-доки агентов):
 *  Telegram → Cloudflare Worker → shopping / grocery / travel; расписания → news-digest, watchdog;
 *  watchdog наблюдает за остальными через лог. */
export const sourceNodes: Node<SourceNodeData>[] = [
  { id: 'telegram', type: 'source', position: { x: 10, y: 120 }, data: { label: 'Лев', icon: '🦁', sub: 'пишет в Telegram' } },
  { id: 'worker', type: 'source', position: { x: 10, y: 420 }, data: { label: 'Слушатель', icon: '⚡', sub: 'Cloudflare Worker' } },
  { id: 'cron-news', type: 'source', position: { x: 960, y: 85 }, data: { label: '08:00', icon: '⏰', sub: 'расписание' } },
  { id: 'cron-watch', type: 'source', position: { x: 960, y: 465 }, data: { label: '09:00', icon: '⏰', sub: 'расписание' } },
]

export const AGENT_POSITIONS: Record<AgentId, { x: number; y: number }> = {
  shopping: { x: 270, y: 0 },
  grocery: { x: 270, y: 300 },
  travel: { x: 270, y: 600 },
  'news-digest': { x: 640, y: 0 },
  watchdog: { x: 640, y: 380 },
}

/** Телефон: только карточки агентов сеткой в 2 колонки — на узком экране полный граф со
 *  узлами-источниками ужимается до нечитаемого. */
export const AGENT_POSITIONS_NARROW: Record<AgentId, { x: number; y: number }> = {
  shopping: { x: 0, y: 0 },
  grocery: { x: 280, y: 0 },
  travel: { x: 0, y: 270 },
  'news-digest': { x: 280, y: 270 },
  watchdog: { x: 0, y: 540 },
}

type EdgeSpec = Omit<Edge<ParticleEdgeData>, 'type'> & { data: ParticleEdgeData }

const COLORS: Record<AgentId, string> = {
  shopping: '#3d8bff',
  grocery: '#4cc96b',
  travel: '#26c6da',
  'news-digest': '#ffb347',
  watchdog: '#b18cff',
}

const specs: EdgeSpec[] = [
  { id: 'tg-worker', source: 'telegram', sourceHandle: 'out-b', target: 'worker', targetHandle: 'in-t', data: { color: '#58a6ff', agent: 'shopping' } },
  { id: 'worker-shopping', source: 'worker', sourceHandle: 'out-r', target: 'shopping', targetHandle: 'in-l', data: { color: COLORS.shopping, agent: 'shopping' } },
  { id: 'worker-grocery', source: 'worker', sourceHandle: 'out-r', target: 'grocery', targetHandle: 'in-l', data: { color: COLORS.grocery, agent: 'grocery' } },
  { id: 'worker-travel', source: 'worker', sourceHandle: 'out-r', target: 'travel', targetHandle: 'in-l', data: { color: COLORS.travel, agent: 'travel' } },
  { id: 'cron-news', source: 'cron-news', sourceHandle: 'out-l', target: 'news-digest', targetHandle: 'in-r', data: { color: COLORS['news-digest'], agent: 'news-digest' } },
  { id: 'cron-watch', source: 'cron-watch', sourceHandle: 'out-l', target: 'watchdog', targetHandle: 'in-r', data: { color: COLORS.watchdog, agent: 'watchdog' } },
  { id: 'watch-news', source: 'watchdog', sourceHandle: 'out-t', target: 'news-digest', targetHandle: 'in-b', data: { color: COLORS.watchdog, agent: 'watchdog', watch: true } },
  { id: 'watch-shopping', source: 'watchdog', sourceHandle: 'out-l', target: 'shopping', targetHandle: 'in-r', data: { color: COLORS.watchdog, agent: 'watchdog', watch: true } },
  { id: 'watch-grocery', source: 'watchdog', sourceHandle: 'out-l', target: 'grocery', targetHandle: 'in-r', data: { color: COLORS.watchdog, agent: 'watchdog', watch: true } },
  { id: 'watch-travel', source: 'watchdog', sourceHandle: 'out-l', target: 'travel', targetHandle: 'in-r', data: { color: COLORS.watchdog, agent: 'watchdog', watch: true } },
]

export const baseEdges: Edge<ParticleEdgeData>[] = specs.map((e) => ({ ...e, type: 'particle' }))

/** Ребро Telegram → Worker общее для shopping, grocery и travel — оживает от любого из них. */
export function edgeAgents(edge: Edge<ParticleEdgeData>): AgentId[] {
  return edge.id === 'tg-worker' ? ['shopping', 'grocery', 'travel'] : [edge.data!.agent]
}
