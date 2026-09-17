# Инструкция по настройке: система агентов на Claude Code + Telegram

Практический чеклист, без объяснений «почему» (для «почему» см. документы в
`docs/plans/`). Пополняется по мере добавления новых агентов — при добавлении
нового агента дописывай раздел сюда же, а не в отдельный файл.

## 0. Предпосылки

- Node.js установлен
- Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
- Аккаунт claude.ai с доступом к Routines (claude.ai/code/routines,
  research preview)
- Telegram-аккаунт; для агентов, реагирующих на личные чаты — Telegram
  Premium с включённым секретарским режимом (Business Connection)

## 1. Telegram-бот (один на всю систему)

1. `@BotFather` → `/newbot` → получить токен
2. Сохранить токен в `tg_api.txt` в корне проекта (файл в `.gitignore`, **не
   коммитить**)
3. Создать Telegram-группу, добавить туда бота с правом писать сообщения
4. Узнать `chat_id` группы (например, переслать любое сообщение группы боту
   `@getidsbot` или через `getUpdates`)
5. В `@BotFather` → Group Privacy / group joining — выключить, если бот не
   должен добавляться в новые группы кем попало

Текущие значения (этот проект): бот `@LAgentsControl_bot`, группа
«Lev's assistants», `chat_id = -1004369832565`.

## 2. Лог запусков агентов — Google Sheets веб-хук (общий для всех агентов)

1. Создать Google Sheet, добавить лист `log` с шапкой первой строкой:
   `timestamp_utc | agent | status`
2. Extensions → Apps Script → вставить код из `scripts/log-sheet.gs`
3. Project Settings → Script Properties → добавить `SECRET_TOKEN` (случайное
   значение, например `openssl rand -hex 20`)
4. Deploy → New deployment → Web app: Execute as **Me**, Who has access
   **Anyone** (доступ ограничен токеном в запросе, не Google-аккаунтом) →
   скопировать URL деплоя
5. Сохранить в `sheets_api.txt` в корне проекта (в `.gitignore`, **не
   коммитить**), формат:
   ```
   SHEETS_LOG_URL=https://script.google.com/macros/s/.../exec
   SHEETS_LOG_TOKEN=...
   ```
6. Запись строки: `curl -s -L -X POST "$SHEETS_LOG_URL" -d "token=$SHEETS_LOG_TOKEN" -d "agent=<имя>" -d "status=success|error|skipped" -d "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"`
   (флаг `-L` обязателен — Apps Script отвечает 302-редиректом)
7. Чтение всего лога: `curl -s -L "$SHEETS_LOG_URL?token=$SHEETS_LOG_TOKEN"`
   → JSON `{"rows": [[...], ...]}`, первая строка — шапка

Каждый новый агент, который что-либо делает автономно, должен логировать
себя этим способом — это единственный источник данных для агента-надзирателя.

## 3. Claude Code Routines — общие шаги для любого агента на расписании

1. claude.ai/code/routines → New Routine
2. Подключить репозиторий/папку проекта
3. Вставить промпт (см. дизайн-документ конкретного агента в `docs/plans/`)
4. Проверить, есть ли в UI раздел Environment variables / Secrets:
   - **Если есть** — положить туда `TELEGRAM_BOT_TOKEN`, `SHEETS_LOG_URL`,
     `SHEETS_LOG_TOKEN`, в промпте ссылаться на переменные окружения
   - **Если нет** — вставить значения прямо в текст промпта (менее
     безопасно, но рабочий вариант для одиночного пользователя)
5. Настроить расписание (или API-триггер — см. раздел 5 для агентов без
   расписания)
6. **Run now** вручную перед тем, как полагаться на автопилот — проверить
   и сообщение в Telegram, и строку в логе Sheets

## 4. Агент «news-digest» (новости банков/IT, ежедневно)

Полный промпт и параметры — `docs/plans/2026-08-18-news-digest-agent-design.md`.

1. Настроить по общим шагам раздела 3
2. Расписание: ежедневно 05:00 UTC (08:00 МСК)
3. Env vars: `TELEGRAM_BOT_TOKEN`, `SHEETS_LOG_URL`, `SHEETS_LOG_TOKEN`

## 5. Агент «watchdog» (надзор за частотой запусков, ежедневно)

Полный промпт — `docs/plans/2026-08-18-watchdog-agent-design.md`.

1. Настроить по общим шагам раздела 3
2. Расписание: ежедневно 06:00 UTC (09:00 МСК, после news-digest)
3. Env vars: те же три, что у news-digest
4. Для новых агентов норму частоты в его промпте (список «agent: ожидается
   ~N запусков/сутки») обновлять не обязательно — агенты без нормы просто
   показываются с фактическим количеством без оценки

## 6. Агент «Shopping» (поиск товаров на Ozon/Я.Маркет по ключевому слову или фото)

Полный дизайн, промпт и хронология отладки — см.
`docs/plans/2026-08-20-shopping-agent-design.md` (раздел «Инциденты и
фиксы» — там подробно про каждый баг ниже, если что-то не заведётся с
первого раза). Статус: **проверено вживую, работает**.

В отличие от разделов 4-5, этот агент реагирует на сообщение, а не на
расписание — состоит из двух частей: слушатель (Cloudflare Worker) +
Routine с API-триггером.

**Три критичных урока, которые нужно применить с первого дня, не только
когда что-то сломается:**
1. Слушатель ОБЯЗАН игнорировать сообщения от ботов (`message.from.is_bot
   === true`) раньше любой проверки на триггер-слова — иначе собственный
   ответ бота («…рекомендую купить…») сам матчится и агент зацикливается
   на себя.
2. Слушателем для Telegram-вебхука НЕ должен быть Google Apps Script —
   Apps Script всегда отвечает 302-редиректом, а Telegram не следует
   редиректам и считает это сбоем доставки → используем Cloudflare
   Worker (отвечает обычным 200).
3. В настройках бота должны быть выключены и **Group Privacy**, и
   **Inline Mode** — причём после ЛЮБОГО изменения этих настроек нужно
   удалить бота из уже существующей группы и добавить заново (иначе
   старое состояние держится именно в этом чате).

### 6.1 Слушатель (Cloudflare Worker)

Через Cloudflare API, без похода в дашборд (нужен только Account ID и API
Token с правами Workers — dash.cloudflare.com → My Profile → API Tokens →
Create Token → шаблон «Edit Cloudflare Workers»; Account ID виден на
странице Workers & Pages):

```bash
CF_TOKEN="..."       # API Token
CF_ACCOUNT="..."     # Account ID

# 0. Если у аккаунта ещё нет *.workers.dev поддомена — Cloudflare создаёт
#    его только при первом заходе в браузере на Workers & Pages, через API
#    это не включить. Разово открыть dash.cloudflare.com → Workers & Pages,
#    дать странице загрузиться (сам поддомен создастся автоматически).

# 1. KV namespace для дедупликации по update_id
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/storage/kv/namespaces" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"shopping_update_cache"}'
# → сохранить namespace id из ответа

# 2. Деплой воркера (metadata.json описывает bindings, включая секреты)
cat > worker-metadata.json <<EOF
{
  "main_module": "shopping-listener-worker.js",
  "compatibility_date": "2024-09-23",
  "bindings": [
    {"type": "kv_namespace", "name": "UPDATE_CACHE", "namespace_id": "<id из шага 1>"},
    {"type": "plain_text", "name": "ROUTINE_TRIGGER_URL", "text": "<fire-URL из 6.3>"},
    {"type": "secret_text", "name": "ROUTINE_TRIGGER_TOKEN", "text": "<токен из 6.3>"}
  ]
}
EOF
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/workers/scripts/shopping-listener" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -F "metadata=@worker-metadata.json;type=application/json" \
  -F "shopping-listener-worker.js=@scripts/shopping-listener-worker.js;type=application/javascript+module"

# 3. Включить *.workers.dev маршрут для этого конкретного воркера
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/workers/scripts/shopping-listener/subdomain" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled": true, "previews_enabled": false}'

# 4. URL воркера: https://shopping-listener.<account-subdomain>.workers.dev
#    (account-subdomain виден в ответе шага 0 / на странице Workers & Pages)

# 5. Зарегистрировать как Telegram-вебхук
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  --data-urlencode "url=https://shopping-listener.<subdomain>.workers.dev" \
  --data-urlencode 'allowed_updates=["message","business_message"]'
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"   # проверить, pending_update_count и last_error_message
```

Обновление секретов позже (например, после пересоздания Routine, см. 6.5) —
повторить шаг 2 с новым `worker-metadata.json` (URL/токен меняются, KV
namespace id и остальное — те же).

Диагностика: `GET https://shopping-listener.<subdomain>.workers.dev/?debug=1`
возвращает последний сырой Telegram-апдейт, который реально дошёл до
воркера (хранится в KV) — самый быстрый способ проверить, доходит ли вообще
что-то от Telegram, в обход UI Routines.

### 6.2 Настройки бота (Group Privacy, Inline Mode, Secretary Mode)

В нативном Bot Settings UI Telegram (не старый чат с BotFather, а
приложение-настройки бота):

1. **Group Privacy** — выключить (иначе бот видит в группах только
   команды/упоминания, не обычные сообщения)
2. **Inline Mode** — выключить (иначе сообщения, начинающиеся с
   `@ИмяБота`, перехватываются клиентом Telegram как inline-запрос и не
   доходят до чата вообще — сообщение просто не отправляется)
3. **Secretary Mode** (Business Connection, для личных чатов через
   Premium-аккаунт) — оставить включённым
4. После **любого** изменения пп. 1-2 — зайти в уже существующую рабочую
   группу, удалить бота из участников и добавить заново. Проверено
   эмпирически: без этого шага новая настройка не подхватывается для уже
   открытого чата, даже если в самих настройках бота всё выключено верно.

Проверка секретарского режима (если ни разу не проверялся): отправить
тестовое сообщение самому себе в личный чат с ботом, проверить через
`?debug=1` (6.1) или временный `getUpdates`, что апдейт пришёл с полем
`business_message`.

### 6.3 Routine «Shopping»

1. claude.ai/code/routines → New Routine, подключить репозиторий
2. Промпт — из дизайн-документа, раздел «Звено 2» (важно: промпт сам
   парсит JSON из последней реплики сессии, платформа не подставляет
   именованные `${VAR}`)
3. Триггер — **API**, не расписание. UI покажет готовый пример вызова:
   ```
   curl -X POST https://api.anthropic.com/v1/claude_code/routines/<id>/fire \
     -H "Authorization: Bearer $TOKEN" \
     -H "anthropic-version: 2023-06-01" \
     -H "anthropic-beta: experimental-cc-routine-2026-04-01" \
     -H "Content-Type: application/json" \
     -d '{"text": "..."}'
   ```
   Скопировать URL и токен в секреты Cloudflare Worker (6.1, шаг 2). Токен
   — боевой секрет, обращаться как с паролем.
4. **Run now** вручную → откроется сессия → ⋮ (справа сверху) → **Edit
   environment** → добавить `TELEGRAM_BOT_TOKEN`, `SHEETS_LOG_URL`,
   `SHEETS_LOG_TOKEN`

### 6.4 Проверка

1. В группе написать «купи наушники до 3000» → должен прийти reply с
   вариантами
2. Отправить фото товара с подписью «купи такое» → должен прийти reply на
   основе изображения
3. Написать «не хочу это покупать» → бот должен промолчать (проверить по
   логу, что запуск был со `status=skipped`, а не вообще не было вызова)
4. Через неделю — свериться с логом, скорректировать список триггер-слов
   в `shopping-listener-worker.js` при необходимости (передеплоить тем же
   способом, что в 6.1 шаг 2)

### 6.5 Если начались проблемы с адресатом ответа (пишешь в группу — приходит в личку)

Известное ограничение платформы: `fire` добавляет каждый вызов в одну и ту
же непрерывную сессию Routine, не создаёт новую сессию на каждый вызов.
После большого числа тестов подряд сессия накапливает историю, и модель
иногда путает chat_id из старого сообщения с новым. У Routines с
расписанием есть `Archive` для сессии (⋮ в открытой сессии) — у Routines с
API-триггером такого пункта в UI замечено не было.

**Фикс**: удалить Routine и создать заново (чистая сессия) — раздел 6.3
заново, плюс обновить секреты в Cloudflare Worker (раздел 6.1, шаг 2) с
новым `fire`-URL и токеном. Не тестировать одну Routine избыточно много
раз подряд вперемешку (личка/группа/синтетика) — это и забивает сессию.

### 6.6 Агент «grocery» (ВкусВилл, через официальный MCP)

Полный дизайн — `docs/plans/2026-09-17-grocery-agent-design.md`. Пятый
агент в системе, переиспользует Cloudflare Worker и Telegram-бот из
разделов 6.1-6.2 (webhook уже настроен, второй раз регистрировать не
нужно) — новое здесь только: второй Routine, `.mcp.json`, Allowed domains.

1. **`.mcp.json`** уже в корне репозитория:
   ```json
   {"mcpServers": {"vkusvill": {"type": "http", "url": "https://mcp.vkusvill.ru/mcp"}}}
   ```
   Если сервер потребует ключ (не проверено до первого реального вызова) —
   добавить `"headers": {"Authorization": "Bearer ${VKUSVILL_TOKEN}"}` и
   переменную `VKUSVILL_TOKEN` в Routine (шаг 4 ниже).

2. **Routine `grocery`**: claude.ai/code/routines → New Routine, подключить
   тот же репозиторий, промпт — из дизайн-документа. Триггер — **API**, как
   у `shopping` (раздел 6.3, п.3) — скопировать `fire`-URL и токен.

3. **Allowed domains**: в настройках Routine `grocery` (сетевой доступ
   облачного окружения) добавить `mcp.vkusvill.ru` — без этого Routine не
   сможет обратиться к MCP-серверу, даже если `.mcp.json` подключён верно.

4. **Run now** → ⋮ → **Edit environment** → добавить `TELEGRAM_BOT_TOKEN`,
   `SHEETS_LOG_URL`, `SHEETS_LOG_TOKEN` (те же значения, что у `shopping`).

5. **Обновить Cloudflare Worker** (тот же воркер `shopping-listener`, новые
   секреты в дополнение к существующим — повторить раздел 6.1 шаг 2 с
   `worker-metadata.json`, добавив в `bindings`):
   ```json
   {"type": "plain_text", "name": "ROUTINE_TRIGGER_URL_GROCERY", "text": "<fire-URL из шага 2>"},
   {"type": "secret_text", "name": "ROUTINE_TRIGGER_TOKEN_GROCERY", "text": "<токен из шага 2>"}
   ```
   KV namespace и остальные bindings — те же, что уже есть, не трогать.
   Код воркера (`scripts/shopping-listener-worker.js`) уже обновлён: сначала
   проверяет корни `вкусвилл`/`продукт` (→ `grocery`), затем `куп`/`заказ`/
   `найд`/`buy`/`order`/`find` (→ `shopping`) — сообщение уходит только
   одному агенту, даже если совпали оба набора слов.

6. **Проверка**:
   - «вкусвилл, найди овсянку без сахара» в группе → reply с товарами и
     ссылкой на корзину
   - фото товара с подписью «вкусвилл, найди такое» → reply на основе фото
   - «вкусвилл сегодня дорогой» → тишина, в логе `status=skipped`
   - «вкусвилл, купи молоко» → сработал только `grocery` (проверить по
     логу Sheets, что не было параллельного запуска `shopping`)
   - тапнуть ссылку на корзину с телефона → должна открыться корзина в
     приложении ВкусВилл с нужными товарами

## 7. AI Agent Live Visualization (отдельная локальная демка, не Telegram)

Полный дизайн — `docs/plans/2026-08-26-ai-agent-visualization-design.md`,
исходная спецификация — `AI_Agent_Visualization_Instruction.docx` в корне
репозитория. Код — `ai-agent-live/`, подробный README там же.

В отличие от разделов 1-6, никак не связана с Telegram/Routines/Sheets —
локальный FastAPI-бэкенд + React-фронтенд, показывающий realtime-граф
выполнения мультиагентного workflow (Supervisor → Researcher ∥ Analyst →
Reviewer → Writer).

1. Backend: Python 3.11+, `pip install -r ai-agent-live/backend/requirements.txt`,
   скопировать `.env.example` → `.env` (по умолчанию `MOCK_MODE=true` —
   работает без API-ключа)
2. Frontend: нужен **Node.js 18+** — на машине, где проектировался этот
   раздел, Node не был установлен вообще; поставить перед первым запуском
   (`winget install OpenJS.NodeJS.LTS` на Windows, либо nodejs.org)
3. Запуск: `ai-agent-live/start_windows.bat` (или `start_mac_linux.sh`) из
   корня `ai-agent-live/`, либо вручную backend/frontend в двух терминалах
   — см. README там же
4. Открыть `http://127.0.0.1:5173`, нажать **Start Demo** — должен пройти
   полный workflow за ~10-20 секунд без единого внешнего API-ключа
5. Известные ограничения (LangGraph не установлен из-за SSL-ошибки
   pip в этом окружении, frontend не смок-тестирован при написании) — см.
   README `ai-agent-live/README.md`, раздел «Известные ограничения»
