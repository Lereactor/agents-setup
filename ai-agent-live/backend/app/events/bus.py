import asyncio
from collections.abc import Awaitable, Callable

from .schema import AgentEvent

Listener = Callable[[AgentEvent], Awaitable[None]]


class EventBus:
    """Publish/subscribe per run_id. Each run gets its own set of queues so a
    WebSocket client only ever sees events for the run it asked about."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue]] = {}
        self._sync_listeners: list[Listener] = []
        self._lock = asyncio.Lock()

    def add_listener(self, listener: Listener) -> None:
        """Listener invoked for every event on every run (e.g. trace persistence)."""
        self._sync_listeners.append(listener)

    async def subscribe(self, run_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self._subscribers.setdefault(run_id, []).append(queue)
        return queue

    async def unsubscribe(self, run_id: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            subs = self._subscribers.get(run_id, [])
            if queue in subs:
                subs.remove(queue)

    async def publish(self, event: AgentEvent) -> None:
        for listener in self._sync_listeners:
            await listener(event)
        async with self._lock:
            queues = list(self._subscribers.get(event.run_id, []))
        for queue in queues:
            await queue.put(event)
