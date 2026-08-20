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

## 6. Агент «shopping-agent» (поиск товаров на Ozon/Я.Маркет по ключевому слову или фото)

Полный дизайн и промпт — `docs/plans/2026-08-20-shopping-agent-design.md`.
В отличие от разделов 4-5, этот агент реагирует на сообщение, а не на
расписание — состоит из двух частей.

### 6.1 Слушатель (Apps Script веб-хук)

1. Новый Apps Script проект (можно в той же Google Sheet, что и лог, или
   отдельный) со скриптом `scripts/shopping-listener.gs`
2. Deploy → New deployment → Web app: Execute as **Me**, Who has access
   **Anyone** → скопировать URL
3. `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d "url=<URL из шага 2>" -d "allowed_updates=[\"message\",\"business_message\"]"`
4. Проверить: `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"`

### 6.2 Проверка секретарского режима (если ни разу не проверялся)

1. Telegram → Settings → Business (или Premium-раздел) → убедиться, что
   бот подключён как AI-секретарь/Business bot к личному аккаунту
2. Отправить тестовое сообщение самому себе в личный чат
3. Проверить, что вебхук из 6.1 получил апдейт с полем `business_message`
   (не просто `message`) — если нет, разбираться в настройках Business
   Connection в самом Telegram, это не решается со стороны бота

### 6.3 Routine `shopping-agent`

1. Настроить по общим шагам раздела 3, но триггер — **API-вызов**, не
   расписание (формат параметров см. открытый вопрос в дизайн-документе —
   уточняется по месту в UI Routines)
2. Промпт — из дизайн-документа, раздел «Звено 2»
3. В слушателе (6.1) прописать URL+токен API-триггера этой Routine

### 6.4 Проверка

1. В группе написать «купи наушники до 3000» → должен прийти reply с
   вариантами
2. Отправить фото товара с подписью «купи такое» → должен прийти reply на
   основе изображения
3. Написать «не хочу это покупать» → бот должен промолчать (проверить по
   логу, что запуск был со `status=skipped`, а не вообще не было вызова)
4. Через неделю — свериться с логом, скорректировать список триггер-слов
   в `shopping-listener.gs` при необходимости
