import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { decryptConfig, type EncryptedConfig, type SiteConfig } from './crypto'
import { setSiteConfig } from './siteSource'
import './gate.css'

const STORAGE_KEY = 'agents-live.config'

function loadSaved(): SiteConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SiteConfig) : null
  } catch {
    return null
  }
}

/** Экран пароля публичного сайта. После ввода расшифровывает адрес лога и ключ для
 *  чтения; «запомнить» хранит их в localStorage этого устройства. */
export default function Gate({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfig | null>(() => {
    const saved = loadSaved()
    setSiteConfig(saved)
    return saved
  })
  const [enc, setEnc] = useState<EncryptedConfig | null>(null)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (config) return
    fetch(`${import.meta.env.BASE_URL}config.enc.json`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setEnc)
      .catch(() => setError('Не удалось загрузить сайт — обновите страницу'))
  }, [config])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!enc || !password) return
    setBusy(true)
    setError(null)
    try {
      const next = await decryptConfig(enc, password)
      if (remember) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          // приватный режим — просто не запоминаем
        }
      }
      setSiteConfig(next)
      setConfig(next)
    } catch {
      setError('Неверный пароль')
    } finally {
      setBusy(false)
    }
  }

  const logout = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // нечего удалять
    }
    setSiteConfig(null)
    setConfig(null)
    setPassword('')
  }

  if (config) {
    return (
      <>
        {children}
        <button className="gate-logout" onClick={logout} title="Забыть пароль на этом устройстве">
          выйти
        </button>
      </>
    )
  }

  return (
    <div className="gate">
      <form className="gate__card" onSubmit={submit}>
        <div className="gate__emojis" aria-hidden="true">
          <span>🛒</span>
          <span>🥕</span>
          <span>📰</span>
          <span>🛡️</span>
        </div>
        <h1>Мои агенты</h1>
        <p className="gate__sub">Живой пульт Telegram-агентов</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="gate__remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          запомнить на этом устройстве
        </label>
        <button type="submit" disabled={!enc || !password || busy}>
          {busy ? 'Открываю…' : 'Войти'}
        </button>
        {error && <div className="gate__error">{error}</div>}
      </form>
    </div>
  )
}
