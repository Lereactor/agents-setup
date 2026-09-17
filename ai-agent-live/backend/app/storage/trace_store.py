import json
from pathlib import Path

from ..events.schema import AgentEvent, EventType

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "traces"


def _trace_path(run_id: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR / f"{run_id}.jsonl"


async def append_event(event: AgentEvent) -> None:
    path = _trace_path(event.run_id)
    with path.open("a", encoding="utf-8") as f:
        f.write(event.model_dump_json() + "\n")


def load_trace(run_id: str) -> list[AgentEvent]:
    path = _trace_path(run_id)
    if not path.exists():
        return []
    events = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(AgentEvent.model_validate_json(line))
    return events


def list_runs() -> list[dict]:
    """Summaries of every saved run, newest first — used by the Replay picker."""
    if not DATA_DIR.exists():
        return []
    summaries = []
    for path in DATA_DIR.glob("*.jsonl"):
        events = load_trace(path.stem)
        if not events:
            continue
        started = next((e for e in events if e.type == EventType.RUN_STARTED), events[0])
        completed = next((e for e in reversed(events) if e.type == EventType.RUN_COMPLETED), None)
        summaries.append(
            {
                "run_id": path.stem,
                "prompt": (started.metadata or {}).get("prompt", ""),
                "started_at": started.timestamp,
                "completed": completed is not None,
                "event_count": len(events),
            }
        )
    summaries.sort(key=lambda s: s["started_at"], reverse=True)
    return summaries
