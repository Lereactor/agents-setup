import unittest
from datetime import datetime, timedelta, timezone

from app.my_agents.log_parser import parse_rows

HEADER = ["timestamp_utc", "agent", "status", "detail", "run_id"]
NOW = datetime(2026, 10, 4, 12, 0, 0, tzinfo=timezone.utc)


def ts(minutes_ago: float) -> str:
    return (NOW - timedelta(minutes=minutes_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


class ParseRowsTest(unittest.TestCase):
    def test_legacy_row_without_run_id_is_its_own_finished_run(self):
        runs = parse_rows([HEADER[:3], ["2026-10-03T05:09:06Z", "news-digest", "success"]], NOW)
        self.assertEqual(len(runs), 1)
        run = runs[0]
        self.assertEqual(run["agent"], "news-digest")
        self.assertEqual(run["status"], "success")
        self.assertEqual(run["started_at"], "2026-10-03T05:09:06Z")
        self.assertEqual(run["finished_at"], "2026-10-03T05:09:06Z")
        self.assertIsNone(run["duration_s"])
        self.assertEqual(run["detail"], "")
        self.assertTrue(run["run_id"].startswith("legacy-"))

    def test_started_and_result_are_merged_by_run_id(self):
        rows = [
            HEADER,
            ["2026-10-04T10:00:00Z", "grocery", "started", "найди овсянку", "r1"],
            ["2026-10-04T10:00:42Z", "grocery", "success", "овсянка → 3 товара, корзина", "r1"],
        ]
        [run] = parse_rows(rows, NOW)
        self.assertEqual(run["run_id"], "r1")
        self.assertEqual(run["status"], "success")
        self.assertEqual(run["started_at"], "2026-10-04T10:00:00Z")
        self.assertEqual(run["finished_at"], "2026-10-04T10:00:42Z")
        self.assertEqual(run["duration_s"], 42)
        self.assertEqual(run["detail"], "овсянка → 3 товара, корзина")

    def test_detail_falls_back_to_started_detail(self):
        rows = [
            HEADER,
            ["2026-10-04T10:00:00Z", "shopping", "started", "купи наушники", "r2"],
            ["2026-10-04T10:01:00Z", "shopping", "error", "", "r2"],
        ]
        [run] = parse_rows(rows, NOW)
        self.assertEqual(run["status"], "error")
        self.assertEqual(run["detail"], "купи наушники")

    def test_started_without_result_is_running(self):
        [run] = parse_rows([HEADER, [ts(5), "shopping", "started", "купи чайник", "r3"]], NOW)
        self.assertEqual(run["status"], "running")
        self.assertIsNone(run["finished_at"])
        self.assertIsNone(run["duration_s"])

    def test_started_older_than_30_minutes_is_stale(self):
        [run] = parse_rows([HEADER, [ts(31), "news-digest", "started", "", "r4"]], NOW)
        self.assertEqual(run["status"], "stale")

    def test_result_without_started_uses_finish_as_start(self):
        [run] = parse_rows([HEADER, ["2026-10-04T10:00:00Z", "grocery", "error", "401", "r5"]], NOW)
        self.assertEqual(run["status"], "error")
        self.assertEqual(run["started_at"], "2026-10-04T10:00:00Z")
        self.assertIsNone(run["duration_s"])

    def test_header_blank_and_broken_rows_are_skipped(self):
        rows = [
            HEADER,
            ["", "", "", "", ""],
            ["not-a-date", "grocery", "success", "", ""],
            ["2026-10-04T10:00:00Z", "", "success", "", ""],
            ["2026-10-04T10:00:00Z", "grocery", "success"],
        ]
        runs = parse_rows(rows, NOW)
        self.assertEqual([r["agent"] for r in runs], ["grocery"])

    def test_runs_sorted_by_start_time(self):
        rows = [
            HEADER,
            ["2026-10-04T11:00:00Z", "shopping", "success", "", "b"],
            ["2026-10-04T09:00:00Z", "grocery", "success", "", "a"],
        ]
        self.assertEqual([r["run_id"] for r in parse_rows(rows, NOW)], ["a", "b"])

    def test_legacy_duplicates_within_30s_are_merged(self):
        # До 2026-10-04 агенты слали лог с `curl -X POST`, получали «Error 411» после
        # редиректа и повторяли запрос — одна и та же запись появлялась дважды.
        rows = [
            HEADER[:3],
            ["2026-10-03T05:08:55Z", "news-digest", "success"],
            ["2026-10-03T05:09:06Z", "news-digest", "success"],
            ["2026-10-03T05:09:20Z", "shopping", "success"],
            ["2026-10-04T05:09:06Z", "news-digest", "success"],
        ]
        runs = parse_rows(rows, NOW)
        self.assertEqual(
            [(r["agent"], r["started_at"]) for r in runs],
            [
                ("news-digest", "2026-10-03T05:08:55Z"),
                ("shopping", "2026-10-03T05:09:20Z"),
                ("news-digest", "2026-10-04T05:09:06Z"),
            ],
        )

    def test_started_without_run_id_pairs_with_next_result_of_same_agent(self):
        # Если Apps Script ещё старой версии, run_id не сохраняется — склеиваем
        # started со следующим итогом того же агента, иначе старт «работает» вечно.
        rows = [
            HEADER,
            ["2026-10-04T00:39:34Z", "grocery", "started", "", ""],
            ["2026-10-04T00:39:40Z", "shopping", "success", "", ""],
            ["2026-10-04T00:39:56Z", "grocery", "success", "", ""],
        ]
        runs = parse_rows(rows, NOW)
        grocery = [r for r in runs if r["agent"] == "grocery"]
        self.assertEqual(len(grocery), 1)
        self.assertEqual(grocery[0]["status"], "success")
        self.assertEqual(grocery[0]["started_at"], "2026-10-04T00:39:34Z")
        self.assertEqual(grocery[0]["duration_s"], 22)

    def test_reply_comes_from_result_row(self):
        rows = [
            HEADER + ["reply"],
            ["2026-10-04T10:00:00Z", "grocery", "started", "найди овсянку", "r9", ""],
            ["2026-10-04T10:00:30Z", "grocery", "success", "овсянка → 3 товара", "r9", "🛒 Овсянка\n1. Геркулес — 89 ₽"],
        ]
        [run] = parse_rows(rows, NOW)
        self.assertEqual(run["reply"], "🛒 Овсянка\n1. Геркулес — 89 ₽")

    def test_reply_empty_for_old_rows(self):
        [run] = parse_rows([HEADER[:3], ["2026-10-03T05:09:06Z", "news-digest", "success"]], NOW)
        self.assertEqual(run["reply"], "")

    def test_progress_rows_become_steps_not_runs(self):
        rows = [
            HEADER,
            [ts(3), "grocery", "started", "найди молоко", "r10"],
            [ts(2.5), "grocery", "progress", "🔎 ищу «молоко» во ВкусВилле", "r10"],
            [ts(2), "grocery", "progress", "🧺 собираю корзину", "r10"],
        ]
        [run] = parse_rows(rows, NOW)
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["detail"], "найди молоко")
        self.assertEqual([s["text"] for s in run["steps"]], ["🔎 ищу «молоко» во ВкусВилле", "🧺 собираю корзину"])
        self.assertEqual(run["steps"][0]["at"], ts(2.5))

    def test_progress_does_not_finish_or_unstale_run(self):
        rows = [
            HEADER,
            [ts(40), "news-digest", "started", "", "r11"],
            [ts(35), "news-digest", "progress", "🔎 ищу новости", "r11"],
        ]
        [run] = parse_rows(rows, NOW)
        self.assertEqual(run["status"], "stale")
        self.assertIsNone(run["finished_at"])

    def test_empty_input(self):
        self.assertEqual(parse_rows([], NOW), [])


if __name__ == "__main__":
    unittest.main()
