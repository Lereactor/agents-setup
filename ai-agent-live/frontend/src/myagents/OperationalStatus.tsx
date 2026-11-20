import { useEffect, useState } from 'react'
import { MOSCOW_TIME_ZONE } from './stats'

const STATUS_URL = 'https://shopping-listener.lev-3d7.workers.dev/status.json'
const POLL_MS = 30_000

export interface ServiceStatus {
  name: string
  ok: boolean
  down: boolean
  checked_at: string | null
  detail: string
  failures: number
}

export interface OperationalSnapshot {
  updated_at: string
  worker: { ok: boolean }
  runner: {
    ok: boolean
    model: string
    agents: string[]
    services: ServiceStatus[]
    reminders: { pending: number }
    error?: string
  }
  paused: string[]
}

export interface OperationalStatusState {
  snapshot: OperationalSnapshot | null
  unavailable: boolean
}

export function useOperationalStatus(): OperationalStatusState {
  const [snapshot, setSnapshot] = useState<OperationalSnapshot | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const tick = async () => {
      try {
        const response = await fetch(STATUS_URL, { cache: 'no-store' })
        if (!response.ok) throw new Error('status unavailable')
        const data = (await response.json()) as OperationalSnapshot
        if (cancelled) return
        setSnapshot(data)
        setUnavailable(false)
      } catch {
        if (!cancelled) setUnavailable(true)
      }
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  return { snapshot, unavailable }
}

function StatusCard({ name, ok, detail }: { name: string; ok: boolean; detail: string }) {
  return (
    <div className={`ops-card ${ok ? 'is-ok' : 'is-down'}`}>
      <span className="ops-card__dot" />
      <div>
        <strong>{name}</strong>
        <small>{detail}</small>
      </div>
    </div>
  )
}

export default function OperationalStatus({ state }: { state: OperationalStatusState }) {
  const { snapshot, unavailable } = state
  const services = snapshot?.runner.services.filter((service) => service.name !== 'Cloudflare Worker') ?? []
  return (
    <section className="ops-strip" aria-label="Живые статусы инфраструктуры">
      <div className="ops-strip__title">
        <strong>Инфраструктура</strong>
        <span className={unavailable ? 'ops-error' : 'dim'}>
          {unavailable ? 'статус временно недоступен' : snapshot ? `обновлено ${new Date(snapshot.updated_at).toLocaleTimeString('ru-RU', { timeZone: MOSCOW_TIME_ZONE })}` : 'проверяем…'}
        </span>
      </div>
      <div className="ops-strip__cards">
        <StatusCard name="Worker" ok={snapshot?.worker.ok === true} detail="Telegram · LLM proxy" />
        <StatusCard
          name="Runner"
          ok={snapshot?.runner.ok === true}
          detail={snapshot ? `${snapshot.runner.agents.length} агентов · ${snapshot.runner.model || 'нет связи'}` : 'проверяем…'}
        />
        {services.map((service) => (
          <StatusCard key={service.name} name={service.name} ok={service.ok && !service.down} detail={service.detail || 'проверка каждые 5 минут'} />
        ))}
      </div>
      {snapshot && (
        <div className="ops-strip__meta dim">
          <span>Напоминаний в очереди: {snapshot.runner.reminders.pending}</span>
          <span>На паузе: {snapshot.paused.length ? snapshot.paused.join(', ') : 'никого'}</span>
          <span>Содержимое чатов и документов здесь не передаётся</span>
        </div>
      )}
    </section>
  )
}
