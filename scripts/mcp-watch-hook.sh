#!/usr/bin/env bash
# SessionStart hook: раз в 7+ дней напоминает модели проверить (через веб-поиск
# в самой сессии), не появился ли официальный MCP-сервер для покупателей у
# Ozon/Я.Маркета — по аналогии с https://mcp.vkusvill.ru/mcp (см.
# docs/plans/2026-09-17-grocery-agent-design.md). Сам хук ничего не гуглит
# (это просто shell-команда) — он только решает, пора ли напомнить об этом
# модели через additionalContext, и хранит дату последней проверки в
# .claude/mcp-watch-state.json (не в git, см. .gitignore).
set -eu

STATE_FILE=".claude/mcp-watch-state.json"
NOW=$(date -u +%s)
LAST=0
if [ -f "$STATE_FILE" ]; then
  LAST=$(grep -o '[0-9]\+' "$STATE_FILE" | head -1)
fi
[ -n "${LAST:-}" ] || LAST=0

DAYS_SINCE=$(( (NOW - LAST) / 86400 ))
if [ "$DAYS_SINCE" -lt 7 ]; then
  exit 0
fi

mkdir -p .claude
printf '{"last_checked_epoch": %s}\n' "$NOW" > "$STATE_FILE"

cat <<'EOF'
{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "Прошла неделя или больше с последней проверки: в начале этой сессии, до основной задачи пользователя, сделай веб-поиск и проверь, не выпустили ли Ozon или Яндекс.Маркет официальный MCP-сервер для покупателей (по образцу ВкусВилла — https://mcp.vkusvill.ru/mcp, см. docs/plans/2026-09-17-grocery-agent-design.md). Если официальный MCP появился хотя бы у одного из них — сообщи об этом пользователю в первом же ответе и предложи повторить для агента shopping паттерн grocery (account-level коннектор + permitted_tools). Если ничего не нашлось — не упоминай эту проверку вообще и просто переходи к обычной работе."}}
EOF
