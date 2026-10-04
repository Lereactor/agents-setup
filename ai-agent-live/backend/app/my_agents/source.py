"""Чтение Google Sheets-лога агентов через Apps Script веб-хук (с кэшем и ретраем)."""

import asyncio
import ssl
import time
from datetime import datetime, timezone

import httpx

from .log_parser import parse_rows

CACHE_SECONDS = 8
RETRY_DELAY_SECONDS = 5


class LogSource:
    def __init__(self, url: str, token: str, fetch=None, clock=time.monotonic, sleep=asyncio.sleep):
        self._url = url
        self._token = token
        self._fetch = fetch or self._http_fetch
        self._clock = clock
        self._sleep = sleep
        self._cached: dict | None = None
        self._cached_at: float | None = None

    async def _http_fetch(self):
        # Apps Script всегда отвечает 302 на скрытый URL с данными — нужен follow_redirects.
        # verify=системное хранилище ОС, а не certifi: на этой машине антивирус/прокси
        # подменяет сертификаты своим корневым, который есть только в хранилище Windows.
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=20, verify=ssl.create_default_context()
        ) as client:
            response = await client.get(self._url, params={"token": self._token})
            try:
                return response.json()
            except ValueError:
                return response.text

    async def _fetch_rows(self) -> list | None:
        try:
            payload = await self._fetch()
        except Exception:
            return None
        if isinstance(payload, dict) and isinstance(payload.get("rows"), list):
            return payload["rows"]
        return None

    async def get(self) -> dict:
        if not self._url or not self._token:
            return {"error": "not_configured"}
        if self._cached_at is not None and self._clock() - self._cached_at < CACHE_SECONDS:
            return self._cached

        rows = await self._fetch_rows()
        if rows is None:
            # Apps Script на личном аккаунте изредка отдаёт служебную страницу Google
            # вместо JSON — разовый повтор, как у надзирателя.
            await self._sleep(RETRY_DELAY_SECONDS)
            rows = await self._fetch_rows()
        if rows is None:
            if self._cached is None:
                return {"error": "unavailable"}
            return {**self._cached, "stale_data": True}

        now = datetime.now(timezone.utc)
        self._cached = {
            "runs": parse_rows(rows, now),
            "fetched_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "stale_data": False,
        }
        self._cached_at = self._clock()
        return self._cached
