import unittest

from app.my_agents.source import LogSource

GOOD = {"rows": [["timestamp_utc", "agent", "status"], ["2026-10-03T05:09:06Z", "news-digest", "success"]]}


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class FakeFetch:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = 0

    async def __call__(self):
        self.calls += 1
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


async def no_sleep(_seconds):
    return None


def make(fetch, clock=None, url="https://example/exec", token="t"):
    return LogSource(url, token, fetch=fetch, clock=clock or FakeClock(), sleep=no_sleep)


class LogSourceTest(unittest.IsolatedAsyncioTestCase):
    async def test_not_configured(self):
        result = await make(FakeFetch(), url="").get()
        self.assertEqual(result, {"error": "not_configured"})

    async def test_good_response_is_parsed(self):
        result = await make(FakeFetch(GOOD)).get()
        self.assertFalse(result["stale_data"])
        self.assertEqual(len(result["runs"]), 1)
        self.assertEqual(result["runs"][0]["agent"], "news-digest")
        self.assertIn("fetched_at", result)

    async def test_cache_is_reused_within_20_seconds(self):
        clock = FakeClock()
        fetch = FakeFetch(GOOD, GOOD)
        source = make(fetch, clock)
        await source.get()
        clock.now += 19
        await source.get()
        self.assertEqual(fetch.calls, 1)
        clock.now += 2
        await source.get()
        self.assertEqual(fetch.calls, 2)

    async def test_garbage_is_retried_once(self):
        fetch = FakeFetch("<html>Page Not Found</html>", GOOD)
        result = await make(fetch).get()
        self.assertEqual(fetch.calls, 2)
        self.assertEqual(len(result["runs"]), 1)

    async def test_double_failure_returns_previous_data_marked_stale(self):
        clock = FakeClock()
        fetch = FakeFetch(GOOD, {"error": "unauthorized"}, RuntimeError("network"))
        source = make(fetch, clock)
        await source.get()
        clock.now += 30
        result = await source.get()
        self.assertTrue(result["stale_data"])
        self.assertEqual(len(result["runs"]), 1)

    async def test_double_failure_without_previous_data(self):
        result = await make(FakeFetch("nope", RuntimeError("x"))).get()
        self.assertEqual(result["error"], "unavailable")


if __name__ == "__main__":
    unittest.main()
