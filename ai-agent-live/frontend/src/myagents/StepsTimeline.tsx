import type { AgentStep } from './types'

/** Цепочка шагов запуска: что агент делал по ходу работы и когда. */
export default function StepsTimeline({ steps, live = false }: { steps: AgentStep[]; live?: boolean }) {
  if (!steps.length) return null
  return (
    <ol className={`steps ${live ? 'steps--live' : ''}`}>
      {steps.map((s, i) => (
        <li key={`${s.at}-${i}`} className={live && i === steps.length - 1 ? 'is-current' : ''}>
          <span className="steps__time">
            {new Date(s.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="steps__text">{s.text}</span>
        </li>
      ))}
    </ol>
  )
}
