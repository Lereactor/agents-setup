import type { AgentId, RunStatus } from './types'

export interface AgentMeta {
  id: AgentId
  title: string
  emoji: string
  /** Основной цвет агента — свечение карточки, частицы на рёбрах, тепловая карта. */
  color: string
  trigger: string
  description: string
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  shopping: {
    id: 'shopping',
    title: 'Покупки',
    emoji: '🛒',
    color: '#3d8bff',
    trigger: 'по сообщению: «купи», «найди», «закажи»',
    description: 'Ищет лучшую цену и отзывы на Ozon и Яндекс.Маркете',
  },
  grocery: {
    id: 'grocery',
    title: 'Продукты',
    emoji: '🥕',
    color: '#4cc96b',
    trigger: 'по сообщению: «продукты», «вкусвилл»',
    description: 'Собирает корзину во ВкусВилле через официальный MCP',
  },
  'news-digest': {
    id: 'news-digest',
    title: 'Новости',
    emoji: '📰',
    color: '#ffb347',
    trigger: 'каждый день в 08:00',
    description: 'Дайджест: банки и IT, до 5 главных новостей',
  },
  watchdog: {
    id: 'watchdog',
    title: 'Надзиратель',
    emoji: '🛡️',
    color: '#b18cff',
    trigger: 'каждый день в 09:00',
    description: 'Следит за частотой запусков, ловит циклы и зависания',
  },
}

export const AGENT_ORDER: AgentId[] = ['shopping', 'grocery', 'news-digest', 'watchdog']

export function isAgentId(value: string): value is AgentId {
  return value in AGENTS
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  running: 'работает…',
  stale: 'завис?',
  success: 'успех',
  error: 'ошибка',
  skipped: 'пропуск',
}

export const STATUS_COLOR: Record<RunStatus, string> = {
  running: '#58a6ff',
  stale: '#f0b429',
  success: '#3fb950',
  error: '#ef4444',
  skipped: '#8b93a7',
}
