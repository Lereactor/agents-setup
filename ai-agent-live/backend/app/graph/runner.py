import asyncio
import time

from ..agents.analyst import AnalystAgent
from ..agents.base import AgentNode, RunContext
from ..agents.researcher import ResearcherAgent
from ..agents.reviewer import ReviewerAgent
from ..agents.supervisor import SupervisorAgent
from ..agents.writer import WriterAgent
from ..events.bus import EventBus
from ..events.schema import EventType, NodeStatus
from ..llm.provider import LLMProvider
from ..tools.base import Tool
from ..tools.calculator import CalculatorTool
from ..tools.data_analysis import DataAnalysisTool
from ..tools.document_search import DocumentSearchTool
from ..tools.web_search import WebSearchTool

MAX_RETRIES = 1


def _build_tools() -> dict[str, Tool]:
    tools: list[Tool] = [WebSearchTool(), DataAnalysisTool(), DocumentSearchTool(), CalculatorTool()]
    return {t.name: t for t in tools}


async def _execute_with_retry(
    node: AgentNode, ctx: RunContext, parent_node_ids: list[str] | None = None
) -> str:
    """docx §ERROR HANDLING: one retry before giving up and letting the run fail."""
    attempts = 0
    while True:
        try:
            return await node.execute(ctx, parent_node_ids=parent_node_ids)
        except Exception:
            attempts += 1
            if attempts > MAX_RETRIES:
                raise
            await asyncio.sleep(0.5)


class GraphRunner:
    """Fixed workflow: Supervisor → (Researcher ∥ Analyst) → Reviewer → Writer.

    Deliberately a hardcoded pipeline, not a generic DAG scheduler — YAGNI for a
    5-node fixed graph, and LangGraph wasn't installable in this environment (see
    docs/plans/2026-08-26-ai-agent-visualization-design.md). This class is the one
    place to swap in a real LangGraph runtime later: same constructor/`run()`
    signature, same events out — nothing else (event bus, storage, frontend) needs
    to change.
    """

    def __init__(self, bus: EventBus, llm: LLMProvider, mock_mode: bool) -> None:
        self._bus = bus
        self._llm = llm
        self._mock_mode = mock_mode

    async def run(self, run_id: str, prompt: str) -> None:
        ctx = RunContext(
            run_id=run_id,
            prompt=prompt,
            bus=self._bus,
            llm=self._llm,
            tools=_build_tools(),
            mock_mode=self._mock_mode,
        )
        start = time.monotonic()
        await ctx.emit(
            EventType.RUN_STARTED,
            "run",
            node_type="run",
            status=NodeStatus.RUNNING,
            metadata={"prompt": prompt, "mock_mode": self._mock_mode},
        )

        supervisor = SupervisorAgent("supervisor")
        researcher = ResearcherAgent("researcher")
        analyst = AnalystAgent("analyst")
        reviewer = ReviewerAgent("reviewer")
        writer = WriterAgent("writer")

        run_status = NodeStatus.COMPLETED
        error_summary: str | None = None
        try:
            await _execute_with_retry(supervisor, ctx)
            await asyncio.gather(
                _execute_with_retry(researcher, ctx, parent_node_ids=["supervisor"]),
                _execute_with_retry(analyst, ctx, parent_node_ids=["supervisor"]),
            )
            await _execute_with_retry(reviewer, ctx, parent_node_ids=["researcher", "analyst"])
            await _execute_with_retry(writer, ctx, parent_node_ids=["reviewer"])
        except Exception as exc:  # noqa: BLE001 — the failing node already emitted NODE_ERROR
            run_status = NodeStatus.ERROR
            error_summary = f"Workflow остановлен из-за ошибки узла: {exc}"

        duration_ms = int((time.monotonic() - start) * 1000)
        await ctx.emit(
            EventType.RUN_COMPLETED,
            "run",
            node_type="run",
            status=run_status,
            summary=error_summary or "Workflow завершён",
            duration_ms=duration_ms,
            metadata={"final_report": ctx.results.get("writer")},
        )
