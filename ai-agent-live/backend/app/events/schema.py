from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


def new_id() -> str:
    return uuid4().hex


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class EventType(str, Enum):
    RUN_STARTED = "RUN_STARTED"
    NODE_STARTED = "NODE_STARTED"
    NODE_THINKING = "NODE_THINKING"
    TOOL_CALL = "TOOL_CALL"
    TOOL_RESULT = "TOOL_RESULT"
    NODE_COMPLETED = "NODE_COMPLETED"
    NODE_ERROR = "NODE_ERROR"
    EDGE_ACTIVE = "EDGE_ACTIVE"
    RUN_COMPLETED = "RUN_COMPLETED"


class NodeStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    ERROR = "error"


class AgentEvent(BaseModel):
    """Единица событийного потока между backend и frontend.

    Не класть сюда секреты, ключи или скрытый chain-of-thought модели —
    только безопасные статусы и краткие summary (см. docx, раздел 8).
    """

    event_id: str = Field(default_factory=new_id)
    run_id: str
    timestamp: str = Field(default_factory=now_iso)
    type: EventType
    node_id: str
    node_type: str | None = None
    status: NodeStatus | None = None
    parent_node_id: str | None = None
    tool: str | None = None
    summary: str | None = None
    duration_ms: int | None = None
    metadata: dict[str, Any] | None = None
