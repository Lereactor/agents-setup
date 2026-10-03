# «Мои агенты» — план реализации

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Вкладка «Мои агенты» в `ai-agent-live`: онлайн + история запусков реальных
Routine-агентов из Google Sheets-лога, с уникальной анимированной графикой у каждого агента.

**Architecture:** Backend (FastAPI) читает Apps Script веб-хук лога, нормализует строки в
«запуски» (склейка `started` + итог по `run_id`), кэширует 20 с и отдаёт `GET /my-agents/log`.
Frontend (React + React Flow) опрашивает его раз в 30 с, сравнивает с прошлым снимком и
анимирует новые/изменившиеся запуски; история — тепловая карта, лента, панель агента, таймлапс.
Агенты (Routine-промпты) пишут `started` в начале и итог с `detail` в конце.

**Tech Stack:** Python 3.11, FastAPI, httpx, unittest (pytest не установлен, pip бывает
недоступен из-за SSL) · React 18, TypeScript, React Flow 11, Vite 5, inline SVG + CSS-анимации.

Дизайн: `docs/plans/2026-10-04-my-agents-dashboard-design.md`.

---

### Task 1: Apps Script принимает `detail` и `run_id`

**Files:** Modify: `scripts/log-sheet.gs`

**Step 1:** В `doPost` после проверки `agent/status`:

```js
const detail = String(params.detail || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
const runId = String(params.run_id || '').slice(0, 64);
sheet.appendRow([timestamp, params.agent, params.status, detail, runId]);
```

Обновить шапку-комментарий: `timestamp_utc | agent | status | detail | run_id`, статусы
`started|success|error|skipped`. `doGet` не меняется (`getDataRange` вернёт 5 колонок,
у старых строк — пустые строки).

**Step 2: Commit** `git commit -m "log-sheet: accept detail and run_id columns"`

---

### Task 2: Нормализация лога (чистая функция, TDD)

**Files:**
- Create: `ai-agent-live/backend/app/my_agents/__init__.py` (пустой)
- Create: `ai-agent-live/backend/app/my_agents/log_parser.py`
- Test: `ai-agent-live/backend/tests/test_log_parser.py` (+ пустой `tests/__init__.py`)

**Контракт:** `parse_rows(rows: list[list], now: datetime) -> list[dict]` — вход: `rows` из
веб-хука (первая строка — шапка). Выход — запуски, отсортированные по `started_at` по
возрастанию: `{run_id, agent, status, started_at, finished_at, duration_s, detail}`.

Правила:
- Строка без `run_id` (старый формат) → отдельный запуск: `run_id = "legacy-<index>"`,
  `started_at = finished_at = timestamp`, `duration_s = None`.
- Строки с одинаковым `run_id` склеиваются: `started` даёт `started_at`; итоговая
  (`success|error|skipped`) даёт `status`, `finished_at`, `detail` (если пуст — `detail`
  из `started`). `duration_s = finished_at − started_at` (если оба есть).
- Есть `started`, нет итога → `status = "running"`, или `"stale"`, если `now − started_at > 30 мин`.
- Итог без `started` → `started_at = finished_at`.
- Пустые/битые строки (нет `agent` или непарсящийся timestamp) пропускаются.
- `timestamp` из Sheets может прийти как ISO-строка с `Z` — парсить через
  `datetime.fromisoformat(s.replace("Z", "+00:00"))`.

**Step 1: Тесты** (`unittest`): legacy-строка; пара started+success → duration 42 с;
started без итога → running; started 31 мин назад → stale; error без started; шапка и
пустая строка пропускаются; detail берётся из итога, при пустом — из started; сортировка.

**Step 2:** `cd ai-agent-live/backend && python -m unittest discover -s tests -v` → FAIL (нет модуля).

**Step 3:** Реализация `log_parser.py`.

**Step 4:** Тот же запуск → все PASS.

**Step 5: Commit** `"my-agents: log row normalization with tests"`

---

### Task 3: Клиент Sheets + кэш + endpoint

**Files:**
- Modify: `ai-agent-live/backend/app/config.py` — `sheets_log_url: str = ""`, `sheets_log_token: str = ""`
- Modify: `ai-agent-live/backend/.env.example` — `SHEETS_LOG_URL=`, `SHEETS_LOG_TOKEN=` с комментарием «из sheets_api.txt»
- Create: `ai-agent-live/backend/app/my_agents/source.py`
- Modify: `ai-agent-live/backend/app/main.py` — `GET /my-agents/log`
- Test: `ai-agent-live/backend/tests/test_source.py`

**`source.py`:** класс `LogSource(url, token, fetch=None, clock=time.monotonic)`.
`async get() -> dict`:
- не настроен → `{"error": "not_configured"}`;
- кэш свежее 20 с → вернуть его;
- иначе `fetch()` (по умолчанию `httpx.AsyncClient(follow_redirects=True, timeout=20)`,
  `GET url?token=`), JSON с `rows` → `{"runs": parse_rows(...), "fetched_at": iso, "stale_data": False}`;
- не JSON / нет `rows` / сетевая ошибка → ждать 5 с (sleep инжектируемый), повтор 1 раз;
  снова неудача → прошлый удачный ответ с `stale_data: True`, иначе `{"error": "unavailable"}`.

**Тесты** (`IsolatedAsyncioTestCase`, fetch и sleep — фейки): not_configured; удачный ответ;
кэш не дергает fetch повторно в течение 20 с; мусор → повтор → успех; мусор дважды →
прошлые данные со `stale_data`; мусор дважды без прошлых → `unavailable`.

**Endpoint:** `@app.get("/my-agents/log")` → `await log_source.get()`.

**Проверка вживую:** скопировать `SHEETS_LOG_URL/TOKEN` из `sheets_api.txt` в `backend/.env`,
`curl http://127.0.0.1:8000/my-agents/log` → 125+ запусков.

**Commit** `"my-agents: /my-agents/log endpoint with cache and retry"`

---

### Task 4: Frontend — типы, API, вкладки

**Files:**
- Create: `frontend/src/myagents/types.ts` — `AgentId = 'news-digest'|'watchdog'|'shopping'|'grocery'`,
  `RunStatus = 'running'|'stale'|'success'|'error'|'skipped'`, `AgentRun`, `LogResponse`.
- Modify: `frontend/src/api/client.ts` — `fetchMyAgentsLog(): Promise<LogResponse>`.
- Move: текущий `App.tsx` → `DemoView.tsx` (без изменений логики, `export default function DemoView`).
- Create: новый `App.tsx` — состояние вкладки (`'demo' | 'agents'`, запоминается в
  `localStorage` в try/catch), рендерит `<DemoView/>` или `<MyAgentsView/>`, переключатель
  вкладок — фиксированная плашка поверх (`.tabs`), не ломая grid демо.

**Проверка:** `npx tsc -b` без ошибок; демо работает как раньше.
**Commit** `"frontend: tabs, my-agents API client and types"`

---

### Task 5: Граф и карточки-иллюстрации

**Files:**
- Create: `frontend/src/myagents/layout.ts` — узлы: `telegram`, `worker`, `shopping`, `grocery`,
  `cron-news` (⏰ 08:00), `news-digest`, `cron-watch` (⏰ 09:00), `watchdog`; рёбра
  `telegram→worker→shopping|grocery`, `cron-news→news-digest`, `cron-watch→watchdog`,
  `watchdog⇢{news-digest,shopping,grocery}` (пунктир, класс `edge--watch`).
- Create: `frontend/src/myagents/art/{ShoppingArt,GroceryArt,NewsArt,WatchdogArt}.tsx` —
  inline SVG ~160×110, анимации CSS-классами, усиливаются при `data-active="true"`:
  - Shopping: пакет (градиент #005BFF→#00A2FF, ручки), ценники «₽» жёлтые (#FFCC00)
    выпрыгивают по дуге (keyframes `tag-pop`, 3 штуки с задержкой).
  - Grocery: плетёная корзинка (#7CB342/#2E7D32), морковь/яблоко/лист падают
    (`veg-drop`), листья на фоне качаются (`leaf-sway`) всегда, мягко.
  - News: газета, за ней солнце восходит (`sun-rise`), бегущая строка (`ticker`).
  - Watchdog: щит, внутри радар с вращающимся сектором (`radar-sweep`), точки-«агенты».
- Create: `frontend/src/myagents/AgentCardNode.tsx` — карточка: иллюстрация, имя + эмодзи,
  статус-бейдж (работает/успех/ошибка/пропуск/завис?), таймер для `running`, последний
  `detail` (2 строки, ellipsis), мини-счётчики «сегодня ✓N ✗M». Класс
  `agent-card--flash-<status>` на 2.5 с при новом итоге.
- Create: `frontend/src/myagents/SourceNode.tsx` — компактные узлы Telegram/Worker/⏰.
- Create: `frontend/src/myagents/ParticleEdge.tsx` — кастомное ребро React Flow: путь
  `getBezierPath`, при `data.active` по нему бегут 3 светящиеся точки (`<circle>` +
  `<animateMotion>` по `path`), цвет — цвет агента.
- Create: `frontend/src/myagents/myagents.css` — тема «пульт управления»: фон с
  радиальным градиентом и сеткой, стекло-карточки, свечение по цвету агента
  (`--agent-color`), все keyframes; `@media (prefers-reduced-motion)` — анимации выкл.

**Commit** `"my-agents: graph with illustrated agent cards and particle edges"`

---

### Task 6: Онлайн — опрос и анимация изменений

**Files:** Create: `frontend/src/myagents/useAgentLog.ts`, `frontend/src/myagents/MyAgentsView.tsx`

- `useAgentLog()`: опрос каждые 30 с (+ сразу при монтировании, + при возврате на вкладку
  `visibilitychange`), хранит `runs`, `error`, `fetchedAt`, `staleData`; сравнивает с
  прошлым снимком по `run_id`+`status` → `changes: AgentRun[]` (на первом снимке пусто —
  не анимировать всю историю при открытии).
- `MyAgentsView`: для каждого агента — активен, если есть `running`; flash при изменении в
  итог; рёбра пути к агенту `active`, пока он `running` или 4 с после flash.
- Шапка: «● онлайн, обновлено 12 с назад» / «⚠ данные устарели» / ошибка `not_configured`
  → карточка-инструкция (что вписать в `backend/.env`).
- Звук не делаем (YAGNI).

**Commit** `"my-agents: live polling and change animations"`

---

### Task 7: История — тепловая карта, лента, панель агента

**Files:** Create: `frontend/src/myagents/{Heatmap,HistoryFeed,AgentPanel,Sparkline}.tsx`, `stats.ts`

- `stats.ts` (чистые функции): `runsByDay(runs, days=30)`, `successRate`, `avgDuration`,
  `todayCounts` — по локальной дате (МСК для пользователя = локальная).
- Heatmap: строки — 4 агента (цвет агента), колонки — 30 дней, яркость ∝ count, красная
  точка при error, tooltip «3 окт: 2 запуска, 0 ошибок», клик по клетке → фильтр ленты на день.
- HistoryFeed: новые сверху, иконка агента, время, статус-бейдж, длительность, `detail`;
  фильтры (агент, статус) + поиск по `detail`; новые записи въезжают анимацией.
- AgentPanel (по клику на карточку): успешность %, спарклайн 30 дней, средняя длительность,
  последние 10 запусков.

**Commit** `"my-agents: heatmap, history feed and agent panel"`

---

### Task 8: «Проиграть историю» + dev-моки

**Files:** Create: `frontend/src/myagents/useReplay.ts`, `frontend/src/myagents/mock.ts`

- Replay: период (сутки/неделя/месяц) → запуски за период проигрываются за ~30 с:
  время сжимается линейно, каждый запуск → активный путь + flash; полоса прогресса с
  текущей датой; кнопка «стоп». Во время replay онлайн-анимации ставятся на паузу.
- `mock.ts`: при `?mock=1` в URL `useAgentLog` вместо API отдаёт реальную историю +
  каждые 10 с генерирует `started` → через 6 с `success`/`error` по случайному агенту.
  В лог не пишет ничего.

**Commit** `"my-agents: history replay and dev mock mode"`

---

### Task 9: Промпты агентов

**Files:** Modify: `docs/plans/2026-08-18-news-digest-agent-design.md`,
`2026-08-20-shopping-agent-design.md`, `2026-09-17-grocery-agent-design.md`,
`2026-08-18-watchdog-agent-design.md`

- Каждый промпт: шаг 0 «сгенерируй `RUN_ID`, залогируй `status=started`» (+ `detail` =
  запрос пользователя для shopping/grocery, «старт» для расписаний); финальный шаг логирования
  дополнен `run_id` и `detail` (≤200 символов, что сделано/почему ошибка). Логирование не
  должно ронять агента: `|| true`.
- Watchdog: (1) парсинг 5 колонок; (2) считать только итоговые статусы; (3) `started` старше
  30 мин без итога с тем же `run_id` → «⏳ завис запуск {agent} ({время})»; (4) grocery в список
  агентов по событию; (5) логирует себя, `detail` = короткий вердикт.

**Commit** `"agents: log started/detail/run_id; watchdog logs itself and detects hung runs"`

---

### Task 10: Двойные запуски news-digest

- Посчитать по логу пары записей news-digest < 5 мин друг от друга, по датам.
- Сформулировать гипотезу (два триггера в Routine или повторный Run) и шаги проверки для
  пользователя; при подтверждении — описать фикс в news-digest дизайн-доке.

---

### Task 11: Документация и финальная проверка

- `docs/SETUP-GUIDE.md`: новый раздел «Вкладка „Мои агенты“» — пронумерованные ручные шаги
  с точными названиями кнопок (Apps Script → New version, шапки D1/E1, 4 промпта, `.env`,
  Run now).
- `ai-agent-live/README.md`: раздел про вкладку.
- Проверка: `python -m unittest discover -s tests -v`, `npx tsc -b`, `start_windows.bat`,
  `curl /my-agents/log`, вкладка с `?mock=1` в браузере.
- Commit, `git push` (Routine-сессии читают репозиторий).
