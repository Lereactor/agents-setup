import time
from dataclasses import dataclass, field

from ..events.bus import EventBus
from ..events.schema import AgentEvent, EventType, NodeStatus
from ..llm.provider import LLMProvider
from ..tools.base import Tool


@dataclass
class RunContext:
    run_id: str
    prompt: str
    bus: EventBus
    llm: LLMProvider
    tools: dict[str, Tool]
    mock_mode: bool
    results: dict[str, str] = field(default_factory=dict)

    async def emit(self, event_type: EventType, node_id: str, **kwargs) -> None:
        await self.bus.publish(AgentEvent(run_id=self.run_id, type=event_type, node_id=node_id, **kwargs))

    async def emit_thinking(self, node_id: str, node_type: str, label: str) -> None:
        """Safe, short status only — never the model's actual reasoning (docx §6/§ВАЖНО)."""
        await self.emit(
            EventType.NODE_THINKING,
            node_id,
            node_type=node_type,
            status=NodeStatus.RUNNING,
            summary=label,
        )

    async def call_tool(self, node_id: str, tool_name: str, query: str) -> dict:
        await self.emit(
            EventType.TOOL_CALL,
            node_id,
            tool=tool_name,
            status=NodeStatus.RUNNING,
            summary=f"Вызов {tool_name}",
        )
        start = time.monotonic()
        result = await self.tools[tool_name].run(query=query, mock_mode=self.mock_mode)
        duration_ms = int((time.monotonic() - start) * 1000)
        await self.emit(
            EventType.TOOL_RESULT,
            node_id,
            tool=tool_name,
            status=NodeStatus.COMPLETED,
            summary=str(result.get("summary", "готово"))[:300],
            duration_ms=duration_ms,
            metadata=result,
        )
        return result


class AgentNode:
    node_type: str = "agent"

    def __init__(self, node_id: str) -> None:
        self.node_id = node_id

    async def run(self, ctx: RunContext) -> str:
        raise NotImplementedError

    async def execute(self, ctx: RunContext, parent_node_ids: list[str] | None = None) -> str:
        parents = parent_node_ids or []
        start = time.monotonic()
        await ctx.emit(
            EventType.NODE_STARTED,
            self.node_id,
            node_type=self.node_type,
            status=NodeStatus.RUNNING,
            parent_node_id=parents[0] if parents else None,
        )
        for parent in parents:
            await ctx.emit(
                EventType.EDGE_ACTIVE,
                self.node_id,
                node_type=self.node_type,
                parent_node_id=parent,
            )
        try:
            summary = await self.run(ctx)
        except Exception as exc:  # noqa: BLE001 — surfaced to UI, workflow continues to report it
            await ctx.emit(
                EventType.NODE_ERROR,
                self.node_id,
                node_type=self.node_type,
                status=NodeStatus.ERROR,
                summary=f"Ошибка узла: {exc}",
            )
            raise
        duration_ms = int((time.monotonic() - start) * 1000)
        await ctx.emit(
            EventType.NODE_COMPLETED,
            self.node_id,
            node_type=self.node_type,
            status=NodeStatus.COMPLETED,
            summary=summary[:300],
            duration_ms=duration_ms,
        )
        ctx.results[self.node_id] = summary
        return summary
