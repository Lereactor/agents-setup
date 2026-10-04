import { fetchMyAgentsLog } from '../api/client'
import { AGENT_ORDER } from './agents'
import { isLogError, type AgentId, type AgentRun, type LogOk } from './types'

/** Режим ?mock=1: реальная история (если доступна) + каждые ~10 с фиктивный запуск
 *  started → success/error. Нужен, чтобы проверить анимации, не дожидаясь реальных агентов.
 *  В Google Sheets ничего не пишет. */
export function isMockMode(): boolean {
  return new URLSearchParams(window.location.search).has('mock')
}

const SAMPLE_REPLY: Record<AgentId, string> = {
  shopping: `🛒 Наушники Sony WH-1000XM5

1. Sony WH-1000XM5 — 27 990 ₽, Я.Маркет, ★4.9 (2 140 отзывов)
2. Sony WH-1000XM5 — 29 490 ₽, Ozon, ★4.8 (5 312 отзывов)

💡 Взял бы на Я.Маркете: на 1 500 ₽ дешевле при том же рейтинге.`,
  grocery: `🛒 Борщ — продукты

1. Свёкла молодая — 69 ₽, ★4.9
2. Капуста белокочанная — 45 ₽, ★4.8
3. Говядина для супа — 489 ₽, ★4.9
…

🔗 Корзина: https://vkusvill.ru/?share_basket=…`,
  'news-digest': `📰 Новости за сегодня

1. ЦБ сохранил ключевую ставку…
2. Крупный банк запустил…
3. Вышла новая версия…`,
  watchdog: '🛡️ Надзор: всё в норме. news-digest — 1 запуск за сутки. shopping — 3, grocery — 2.',
}

const SAMPLE_STEPS: Record<AgentId, string[]> = {
  shopping: ['🔎 ищу на Ozon', '🔎 ищу на Яндекс.Маркете', '⚖️ сравниваю 7 предложений', '✉️ отправляю ответ'],
  grocery: ['🔎 ищу во ВкусВилле', '⚖️ сравниваю 5 вариантов', '🧺 собираю корзину', '✉️ отправляю ответ'],
  'news-digest': ['🔎 ищу новости банков', '🔎 ищу IT-новости', '✍️ отбираю главное', '✉️ отправляю дайджест'],
  watchdog: ['📖 читаю лог', '🧮 считаю запуски', '✉️ отправляю отчёт'],
}

const SAMPLE_DETAIL: Record<AgentId, { ask: string; done: string; fail: string }[]> = {
  shopping: [
    { ask: 'купи наушники Sony WH-1000XM5', done: 'лучшая цена 27 990 ₽ на Я.Маркете, рейтинг 4.8', fail: 'ошибка: Ozon не отдал страницу' },
    { ask: 'найди робот-пылесос до 20к', done: '3 варианта, лучший Dreame D10 — 17 490 ₽', fail: 'ошибка: таймаут веб-поиска' },
  ],
  grocery: [
    { ask: 'собери продукты на борщ', done: 'борщ → 9 товаров, корзина 1 284 ₽', fail: 'ошибка: ВкусВилл ответил 401' },
    { ask: 'вкусвилл, овсянка и молоко', done: 'овсянка + молоко → 2 товара, корзина', fail: 'ошибка: товар не найден' },
  ],
  'news-digest': [{ ask: 'старт', done: '5 новостей: банки 2, IT 3', fail: 'ошибка: Telegram 429' }],
  watchdog: [{ ask: 'старт', done: 'всё в норме: 4 агента, циклов нет', fail: 'аномалия: grocery 12 запусков за час' }],
}

function iso(ms: number) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function syntheticHistory(): AgentRun[] {
  const runs: AgentRun[] = []
  const now = Date.now()
  for (let day = 29; day >= 1; day--) {
    const base = now - day * 86400000
    const push = (agent: AgentId, offsetH: number, status: AgentRun['status']) => {
      const t = iso(base + offsetH * 3600000)
      runs.push({ run_id: `syn-${agent}-${day}-${offsetH}`, agent, status, started_at: t, finished_at: t, duration_s: null, detail: '', reply: '', steps: [] })
    }
    push('news-digest', 0, 'success')
    if (day % 3 === 0) push('shopping', 6, day % 9 === 0 ? 'error' : 'success')
    if (day % 2 === 0) push('grocery', 9, day % 8 === 0 ? 'error' : 'success')
  }
  return runs
}

export class MockSource {
  private runs: AgentRun[] = []
  private seq = 0
  private timers: number[] = []

  async start() {
    const real = await fetchMyAgentsLog()
    this.runs = isLogError(real) ? syntheticHistory() : [...real.runs]
    this.spawn()
    this.timers.push(window.setInterval(() => this.spawn(), 10000))
  }

  stop() {
    this.timers.forEach((t) => window.clearInterval(t))
    this.timers = []
  }

  private spawn() {
    const agent = AGENT_ORDER[Math.floor(Math.random() * AGENT_ORDER.length)]
    const samples = SAMPLE_DETAIL[agent]
    const sample = samples[Math.floor(Math.random() * samples.length)]
    const runId = `mock-${++this.seq}`
    const startedMs = Date.now()
    this.runs.push({ run_id: runId, agent, status: 'running', started_at: iso(startedMs), finished_at: null, duration_s: null, detail: sample.ask, reply: '', steps: [] })
    // шаги приходят по ходу работы — как progress-строки в настоящем логе
    SAMPLE_STEPS[agent].forEach((text, i) => {
      this.timers.push(
        window.setTimeout(() => {
          this.runs = this.runs.map((r) =>
            r.run_id === runId && r.status === 'running' ? { ...r, steps: [...r.steps, { at: iso(Date.now()), text }] } : r,
          )
        }, 600 + i * 1300),
      )
    })
    const doneTimer = window.setTimeout(() => {
      // ?mock=ok — всегда успех (удобно посмотреть ответы в чат), иначе ~20% ошибок.
      const ok = new URLSearchParams(window.location.search).get('mock') === 'ok' || Math.random() > 0.2
      this.runs = this.runs.map((r) =>
        r.run_id === runId
          ? { ...r, status: ok ? 'success' : 'error', finished_at: iso(Date.now()), duration_s: Math.round((Date.now() - startedMs) / 1000), detail: ok ? sample.done : sample.fail, reply: ok ? SAMPLE_REPLY[agent] : '' }
          : r,
      )
    }, 6000)
    this.timers.push(doneTimer)
  }

  snapshot(): LogOk {
    return { runs: [...this.runs], fetched_at: iso(Date.now()), stale_data: false }
  }
}
