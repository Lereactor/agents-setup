# AI Agent Live Visualization

Локальное приложение: реальный мультиагентный workflow (Supervisor → Researcher ∥
Analyst → Reviewer → Writer) с realtime-визуализацией выполнения в виде анимированного
графа. Полная спецификация — `../AI_Agent_Visualization_Instruction.docx` (в корне
репозитория); решения по интеграции и отклонения от неё —
`../docs/plans/2026-08-26-ai-agent-visualization-design.md`.

**Отдельный проект**, не связан с Telegram-агентами (`news-digest`/`watchdog`/`shopping`)
из остальной части этого репозитория — их ничего здесь не трогает и не ломает.

## Структура проекта

```
ai-agent-live/
├── backend/
│   ├── app/
│   │   ├── agents/      # 5 узлов графа: supervisor, researcher, analyst, reviewer, writer
│   │   ├── tools/        # web_search, document_search, data_analysis (mock), calculator (реальный)
│   │   ├── graph/        # GraphRunner — фиксированный pipeline с параллельной веткой
│   │   ├── events/       # AgentEvent (pydantic) + EventBus (pub/sub по run_id)
│   │   ├── storage/      # персистентность трассы в data/traces/*.jsonl, для Replay
│   │   ├── llm/          # LLMProvider — mock-заглушки или реальный OpenAI-совместимый вызов
│   │   ├── config.py     # Settings из .env
│   │   └── main.py       # FastAPI: /health, /runs, /runs/{id}/events, /ws/{run_id}
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/   # TopBar, Sidebar, EventStream, Toolbar
│   │   ├── graph/         # React Flow: layout.ts (статическая топология), CustomNode
│   │   ├── events/        # TS-типы событий (зеркало backend/app/events/schema.py)
│   │   ├── api/           # REST + WebSocket клиент
│   │   └── App.tsx        # состояние графа/событий, live + replay режимы
│   └── package.json
├── data/traces/           # сохранённые трассы запусков (для Replay), в .gitignore
├── start_windows.bat
└── start_mac_linux.sh
```

## Команды установки

```bash
# Backend (Python 3.11+)
cd backend
pip install -r requirements.txt
copy .env.example .env      # PowerShell/Windows; на macOS/Linux: cp .env.example .env

# Frontend (нужен Node.js 18+ — см. "Известные ограничения")
cd ../frontend
npm install
```

## Команды запуска

Windows: `start_windows.bat` (из корня `ai-agent-live/`) — открывает backend и
frontend каждый в своём окне `cmd`. Остановить оба: `stop_windows.bat` (не просто
закрывает окна — Node/Python процессы `uvicorn --reload`/`vite` иначе могут
пережить закрытое окно и остаться висеть на портах).
macOS/Linux: `./start_mac_linux.sh` — работает на переднем плане, `Ctrl+C`
останавливает оба процесса сразу.

Либо вручную, в двух терминалах:

```bash
# Терминал 1
cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Терминал 2
cd frontend && npm run dev
```

Открыть `http://127.0.0.1:5173`. Нажать **Start Demo** — без API-ключа
(`MOCK_MODE=true` по умолчанию) должен пройти полный workflow за ~10-20 секунд.

## Переменные .env

`backend/.env` (см. `backend/.env.example`):

| Переменная | Назначение |
|---|---|
| `MOCK_MODE` | `true` — без реального LLM/API-ключа, безопасные заглушки с задержкой |
| `OPENAI_API_KEY` | ключ для реального режима (`MOCK_MODE=false`) |
| `OPENAI_MODEL` | модель, например `gpt-4o-mini` |
| `OPENAI_BASE_URL` | опционально — любой OpenAI-совместимый эндпоинт вместо api.openai.com |
| `HOST`, `PORT` | адрес backend (по умолчанию `127.0.0.1:8000`) |

`frontend/.env` (см. `frontend/.env.example`): `VITE_API_BASE` — адрес backend, по
умолчанию `http://127.0.0.1:8000`.

## Как добавить нового агента или инструмент

1. **Инструмент**: новый файл в `backend/app/tools/`, класс-наследник `Tool` (см.
   `tools/base.py`) с методом `run(query, mock_mode)`. Зарегистрировать в
   `_build_tools()` (`backend/app/graph/runner.py`).
2. **Агент**: новый файл в `backend/app/agents/`, класс-наследник `AgentNode` (см.
   `agents/base.py`), реализовать `async def run(self, ctx: RunContext) -> str` — внутри
   можно звать `ctx.call_tool(...)` и `ctx.llm.complete(...)`.
3. Вписать новый узел в pipeline `GraphRunner.run()` (`backend/app/graph/runner.py`) —
   вызов `_execute_with_retry(новый_агент, ctx, parent_node_ids=[...])` в нужном месте
   последовательности/параллельной ветки.
4. Добавить узел (и рёбра к нему) в статическую топологию фронтенда —
   `frontend/src/graph/layout.ts` (`initialNodes`/`initialEdges`). Frontend ничего не
   знает о графе заранее из backend — топология одна и та же в обоих местах, держать их
   в синхронизации вручную.
5. Мок-заглушку для роли — в `backend/app/llm/provider.py`, `_ROLE_TEMPLATES`.

Событийная схема (`backend/app/events/schema.py`, `AgentEvent`) и WebSocket-протокол
менять не нужно — она уже общая для любого количества узлов.

## Известные ограничения

- **LangGraph не используется** — в этом окружении `pip install` не работал (SSL-ошибка
  при обращении к PyPI, похоже на перехват сертификата антивирусом/прокси). Вместо
  этого — `GraphRunner` на чистом `asyncio` с тем же местом для замены (см. дизайн-док).
  Если LangGraph поставится на другой машине — `graph/runner.py` единственное место,
  которое нужно переписать.
- **Frontend не запущен и не смок-тестирован в этой сессии** — на машине, где собирался
  проект, не установлен Node.js. Код написан по спецификации и вручную вычитан, но
  первый реальный `npm install && npm run dev` может вскрыть опечатки/несовпадения
  версий пакетов — это первое, что стоит проверить после установки Node.
- **Stop не отменяет запущенный на backend workflow** — кнопка отключает фронтенд от
  WebSocket, но backend-процесс (asyncio-таска) в этой MVP-версии продолжает
  выполняться до конца. Полная отмена (asyncio.Task.cancel()) не реализована — не было
  явного требования в спецификации, добавить несложно при необходимости.
- **Token count / estimated cost** в TopBar не показываются — `LLMProvider` сейчас не
  возвращает usage-статистику ни в mock, ни в реальном режиме. Docx просит показывать
  их «если провайдер предоставляет данные» — сейчас не предоставляет, это осознанный
  пропуск, а не баг.
- Один процесс backend = один одновременный live-run (реестр `_pending_runs` в
  памяти) — этого достаточно для локальной демки, для нескольких параллельных live-run
  потребуется доработка.
