"""Нормализация строк Google Sheets-лога агентов в список «запусков».

Строка лога: timestamp_utc | agent | status | detail | run_id. Агент пишет
`started` в начале работы и итог (success/error/skipped) в конце с тем же
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
    for index, row in enumerate(rows):
        timestamp = _parse_ts(_cell(row, 0))
        agent = _cell(row, 1)
        status = _cell(row, 2).lower()
        if timestamp is None or not agent or not status:
            continue  # шапка, пустые и битые строки
        run_id = _cell(row, 4)
        if not run_id:
            # Старые агенты слали лог через `curl -X POST`, получали «Error 411» после
            # редиректа Google и повторяли запрос — одна запись дублировалась.
            previous = last_legacy.get((agent, status))
            last_legacy[(agent, status)] = timestamp
            if previous and timestamp - previous <= LEGACY_DUPLICATE_WINDOW:
                continue
            run_id = f"legacy-{index}"
        group = groups.setdefault(run_id, {"agent": agent, "started": None, "final": None})
        entry = (timestamp, status, _cell(row, 3))
        if status == "started":
            group["started"] = entry
        else:
            group["final"] = entry

    runs = []
    for run_id, group in groups.items():
        started, final = group["started"], group["final"]
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
            }
        )
    runs.sort(key=lambda r: r["started_at"])
    return runs
