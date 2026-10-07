import type { AgentId, RunStatus } from './types'

export interface AgentMeta {
  id: AgentId
  title: string
  emoji: string
  /** Основной цвет агента — свечение карточки, частицы на рёбрах, тепловая карта. */
  color: string
  trigger: string
  /** Для агентов по расписанию — строка на карточке вместо отдельного узла-таймера. */
  schedule?: string
  description: string
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  shopping: {
    id: 'shopping',
    title: 'Покупки',
    emoji: '🛒',
    color: '#3d8bff',
    trigger: 'по сообщению: «купи», «найди», «закажи»',
    description: 'Топ-5 по цене, рейтингу и отзывам на Ozon, WB и Я.Маркете',
  },
  grocery: {
    id: 'grocery',
    title: 'Продукты',
    emoji: '🥕',
    color: '#4cc96b',
    trigger: 'по сообщению: «продукты», «вкусвилл»',
    description: 'Собирает корзину во ВкусВилле через официальный MCP',
  },
  travel: {
    id: 'travel',
    title: 'Поездки',
    emoji: '🚆',
    color: '#26c6da',
    trigger: 'по сообщению: «билет», «поезд», «самолёт»',
    description: 'Ищет поезда, рейсы и автобусы на Туту, даёт ссылку на покупку',
  },
  booking: {
    id: 'booking',
    title: 'Жильё',
    emoji: '🏡',
    color: '#ff8a65',
    trigger: 'по сообщению: «отель», «квартира», «коттедж», «посуточно»',
    description: 'Топ-3 на Суточно, Островке, Авито и Туту + риски и рекомендация',
  },
  'news-digest': {
    id: 'news-digest',
    title: 'Новости',
    emoji: '📰',
    color: '#ffb347',
    trigger: 'каждый день в 08:00',
    schedule: '⏰ каждый день в 08:00',
    description: 'Дайджест: банки и IT, до 5 главных новостей',
  },
  watchdog: {
    id: 'watchdog',
    title: 'Надзиратель',
    emoji: '🛡️',
    color: '#b18cff',
    trigger: 'фоном каждые 6 часов, отчёт в 09:00',
    schedule: '⏰ каждые 6 ч · отчёт в 09:00',
    description: 'Ловит циклы и зависания: ставит агента на паузу, повторяет зависший запрос',
  },
}

export const AGENT_ORDER: AgentId[] = ['shopping', 'grocery', 'travel', 'booking', 'news-digest', 'watchdog']

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
