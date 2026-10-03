import { useState } from 'react'
import DemoView from './DemoView'
import MyAgentsView from './myagents/MyAgentsView'

type Tab = 'demo' | 'agents'

const TAB_KEY = 'ai-agent-live.tab'

function loadTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'demo' ? 'demo' : 'agents'
  } catch {
    return 'agents'
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>(loadTab)

  const choose = (next: Tab) => {
    setTab(next)
    try {
      localStorage.setItem(TAB_KEY, next)
    } catch {
      // приватный режим / заблокированное хранилище — просто не запоминаем
    }
  }

  return (
    <div className="root-tabs">
      <nav className="root-tabs__bar">
        <button className={tab === 'agents' ? 'is-active' : ''} onClick={() => choose('agents')}>
          Мои агенты
        </button>
        <button className={tab === 'demo' ? 'is-active' : ''} onClick={() => choose('demo')}>
          Демо
        </button>
      </nav>
      <div className="root-tabs__content">{tab === 'demo' ? <DemoView /> : <MyAgentsView />}</div>
    </div>
  )
}
