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

    def test_empty_input(self):
        self.assertEqual(parse_rows([], NOW), [])


if __name__ == "__main__":
    unittest.main()
