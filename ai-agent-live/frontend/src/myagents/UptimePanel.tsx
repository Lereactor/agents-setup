import { AGENTS } from './agents'
import type { OperationalStatusState } from './OperationalStatus'
import { formatAgo, MOSCOW_TIME_ZONE } from './stats'

const SERVICE_LABELS: Record<string, { title: string; detail: string }> = {
  'Cloudflare Worker': { title: 'Worker', detail: 'Telegram и прокси Kimi' },
  'Agents Runner': { title: 'Runner', detail: 'агенты на VPS' },
  'Agents Live': { title: 'Сайт', detail: 'эта панель мониторинга' },
}

function clock(iso: string): string {
  return `${new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: MOSCOW_TIME_ZONE,
  })} МСК`
}

interface Props {
  operational: OperationalStatusState
  onClose: () => void
}

export default function UptimePanel({ operational, onClose }: Props) {
  const meta = AGENTS.uptime
  const services = operational.snapshot?.runner.services ?? []
  const healthy = services.filter((service) => service.ok && !service.down).length
  const checkedAt = services.reduce<string | null>((latest, service) => {
    if (!service.checked_at) return latest
    return !latest || service.checked_at > latest ? service.checked_at : latest
  }, null)

  return (
    <aside className="agent-panel" style={{ ['--agent-color' as string]: meta.color }}>
      <div className="agent-panel__head">
        <span className="agent-panel__big">{meta.emoji}</span>
        <div>
          <div className="agent-panel__title">{meta.title}</div>
          <div className="dim">{meta.description}</div>
          <div className="dim">⚙ {meta.trigger}</div>
        </div>
        <button className="chip chip--clear" onClick={onClose} title="Закрыть">
          ×
        </button>
      </div>

      <div className="kpis">
        <div className="kpi">
          <b>{services.length ? `${healthy}/${services.length}` : '—'}</b>
          <span>сервисов доступно</span>
        </div>
        <div className="kpi">
          <b>5 мин</b>
          <span>интервал проверки</span>
        </div>
        <div className="kpi">
          <b>{checkedAt ? clock(checkedAt) : '—'}</b>
          <span>последняя проверка</span>
        </div>
      </div>

      <div className={`uptime-panel__live ${services.length && healthy === services.length ? 'is-ok' : 'is-down'}`}>
        <span className="ops-card__dot" />
        <div>
          <strong>
            {services.length
              ? healthy === services.length
                ? 'Мониторинг работает, всё доступно'
                : 'Есть недоступные сервисы'
              : operational.unavailable
                ? 'Живой статус временно недоступен'
                : 'Получаем живой статус…'}
          </strong>
          {checkedAt && <small>проверено {formatAgo(checkedAt)}</small>}
        </div>
      </div>

      <div className="panel-subtitle">Сервисы сейчас</div>
      <ul className="uptime-services">
        {services.map((service) => {
          const available = service.ok && !service.down
          const label = SERVICE_LABELS[service.name] ?? { title: service.name, detail: '' }
          return (
            <li key={service.name} className={available ? 'is-ok' : 'is-down'}>
              <span className="ops-card__dot" />
              <div className="uptime-services__name">
                <strong>{label.title}</strong>
                <small>{label.detail}</small>
              </div>
              <div className="uptime-services__result">
                <strong>{available ? 'доступен' : 'сбой'}</strong>
                <small>
                  {service.detail || 'нет данных'}
                  {service.checked_at ? ` · ${clock(service.checked_at)}` : ''}
                </small>
              </div>
            </li>
          )
        })}
        {!services.length && <li className="dim">Данные проверок ещё не получены.</li>}
      </ul>

      <div className="uptime-panel__note">
        Успешные проверки не создают записи в общем журнале. Kimi не вызывается и токены не расходуются. В Telegram
        приходят только алерт после двух сбоев подряд и сообщение о восстановлении.
      </div>
    </aside>
  )
}
