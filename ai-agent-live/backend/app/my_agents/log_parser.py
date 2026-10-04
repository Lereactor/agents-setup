"""Нормализация строк Google Sheets-лога агентов в список «запусков».

Строка лога: timestamp_utc | agent | status | detail | run_id | reply. Агент пишет
`started` в начале работы, по ходу — шаги `progress` (detail = что делает сейчас)
и итог (success/error/skipped) в конце с тем же
run_id — здесь они склеиваются в один запуск. Старые строки (до 2026-10-04,
только 3 колонки, без run_id) — каждая сама по себе завершённый запуск.
"""

from datetime import datetime, timedelta

FINAL_STATUSES = {"success", "error", "skipped"}
STALE_AFTER = timedelta(minutes=30)
LEGACY_DUPLICATE_WINDOW = timedelta(seconds=30)


def _parse_ts(value) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


def _fmt(dt: datetime | None) -> str | None:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def _cell(row: list, index: int) -> str:
    return str(row[index]).strip() if len(row) > index and row[index] is not None else ""


def parse_rows(rows: list[list], now: datetime) -> list[dict]:
    groups: dict[str, dict] = {}
    last_legacy: dict[tuple[str, str], datetime] = {}
    # agent -> run_id незакрытого started без run_id (Apps Script старой версии не
    # сохраняет run_id) — следующий итог того же агента закрывает именно его.
    open_legacy_start: dict[str, str] = {}
    for index, row in enumerate(rows):
        timestamp = _parse_ts(_cell(row, 0))
        agent = _cell(row, 1)
        status = _cell(row, 2).lower()
        if timestamp is None or not agent or not status:
            continue  # шапка, пустые и битые строки
        run_id = _cell(row, 4)
        if not run_id:
            if status == "progress":
                continue  # шаг без run_id не к чему привязать
            # Старые агенты слали лог через `curl -X POST`, получали «Error 411» после
            # редиректа Google и повторяли запрос — одна запись дублировалась.
            previous = last_legacy.get((agent, status))
            last_legacy[(agent, status)] = timestamp
            if previous and timestamp - previous <= LEGACY_DUPLICATE_WINDOW:
                continue
            if status == "started":
                run_id = open_legacy_start[agent] = f"legacy-{index}"
            else:
                run_id = open_legacy_start.pop(agent, None) or f"legacy-{index}"
        group = groups.setdefault(run_id, {"agent": agent, "started": None, "final": None, "steps": []})
        entry = (timestamp, status, _cell(row, 3), _cell(row, 5))
        if status == "started":
            group["started"] = entry
        elif status == "progress":
            # промежуточный шаг агента («🔎 ищу…») — не отдельный запуск и не итог
            group["steps"].append({"at": _fmt(timestamp), "text": _cell(row, 3)})
        else:
            group["final"] = entry

    runs = []
    for run_id, group in groups.items():
        started, final, steps = group["started"], group["final"], group["steps"]
        if not started and not final:
            # строка started потерялась, а шаги дошли — запуск всё равно идёт
            started = (_parse_ts(steps[0]["at"]), "started", "", "")
        started_at = started[0] if started else final[0]
        if final:
            finished_at, status = final[0], final[1]
            detail = final[2] or (started[2] if started else "")
        else:
            finished_at = None
            status = "stale" if now - started_at > STALE_AFTER else "running"
            detail = started[2]
        duration = int((finished_at - started[0]).total_seconds()) if started and final else None
        runs.append(
            {
                "run_id": run_id,
                "agent": group["agent"],
                "status": status,
                "started_at": _fmt(started_at),
                "finished_at": _fmt(finished_at),
                "duration_s": duration,
                "detail": detail,
                # Текст, который агент отправил в Telegram (только у итоговой строки).
                "reply": final[3] if final else "",
                "steps": steps,
            }
        )
    runs.sort(key=lambda r: r["started_at"])
    return runs
