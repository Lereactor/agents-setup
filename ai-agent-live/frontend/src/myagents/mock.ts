import { fetchMyAgentsLog } from '../api/client'
import { AGENT_ORDER } from './agents'
import { isLogError, type AgentId, type AgentRun, type LogOk } from './types'

/** Режим ?mock=1: реальная история (если доступна) + каждые ~10 с фиктивный запуск
 *  started → success/error. Нужен, чтобы проверить анимации, не дожидаясь реальных агентов.
 *  В Google Sheets ничего не пишет. */
export function isMockMode(): boolean {
  return new URLSearchParams(window.location.search).has('mock')
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
      runs.push({ run_id: `syn-${agent}-${day}-${offsetH}`, agent, status, started_at: t, finished_at: t, duration_s: null, detail: '' })
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
    this.runs.push({ run_id: runId, agent, status: 'running', started_at: iso(startedMs), finished_at: null, duration_s: null, detail: sample.ask })
    const doneTimer = window.setTimeout(() => {
      const ok = Math.random() > 0.2
      this.runs = this.runs.map((r) =>
        r.run_id === runId
          ? { ...r, status: ok ? 'success' : 'error', finished_at: iso(Date.now()), duration_s: Math.round((Date.now() - startedMs) / 1000), detail: ok ? sample.done : sample.fail }
          : r,
      )
    }, 6000)
    this.timers.push(doneTimer)
  }

  snapshot(): LogOk {
    return { runs: [...this.runs], fetched_at: iso(Date.now()), stale_data: false }
  }
}
