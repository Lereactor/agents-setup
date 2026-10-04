import { useState } from 'react'

interface Props {
  text: string
  /** Время отправки (ISO) — подпись в углу пузыря, как в Telegram. */
  at: string | null
  /** Свернуть длинный ответ до нескольких строк с кнопкой «показать целиком». */
  collapsible?: boolean
}

/** Сообщение бота в стиле Telegram: то, что агент отправил в чат «Lev’s assistants». */
export default function ReplyBubble({ text, at, collapsible = true }: Props) {
  const [open, setOpen] = useState(!collapsible)
  const long = text.split('\n').length > 6 || text.length > 360
  const time = at ? new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="tg-msg">
      <div className="tg-msg__avatar">🤖</div>
      <div className={`tg-msg__bubble ${long && !open ? 'tg-msg__bubble--clamped' : ''}`}>
        <div className="tg-msg__author">Lev Agents Control</div>
        <div className="tg-msg__text">{text}</div>
        <div className="tg-msg__meta">
          {long && collapsible && (
            <button
              className="tg-msg__more"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(!open)
              }}
            >
              {open ? 'свернуть' : 'показать целиком'}
            </button>
          )}
          <span>{time} ✓✓</span>
        </div>
      </div>
    </div>
  )
}
