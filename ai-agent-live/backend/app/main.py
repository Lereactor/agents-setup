import asyncio
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .events.bus import EventBus
from .events.schema import EventType
from .graph.runner import GraphRunner
from .llm.provider import LLMProvider
from .storage import trace_store

app = FastAPI(title="AI Agent Live Visualization")

# Локальная демка на одной машине — источники не ограничиваем.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

bus = EventBus()
bus.add_listener(trace_store.append_event)
llm = LLMProvider(settings)
runner = GraphRunner(bus, llm, settings.mock_mode)

# run_id -> {"prompt": str, "started": bool}. Демка на одну машину/один процесс —
# in-memory реестр достаточен, персистентность самих событий отдельно в trace_store.
_pending_runs: dict[str, dict] = {}


class StartRunRequest(BaseModel):
    prompt: str


@app.get("/health")
async def health():
    return {"status": "ok", "mock_mode": settings.mock_mode, "llm_mock": llm.is_mock}


@app.post("/runs")
async def start_run(req: StartRunRequest):
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(400, "prompt is required")
    run_id = uuid4().hex
    _pending_runs[run_id] = {"prompt": prompt, "started": False}
    return {"run_id": run_id, "prompt": prompt}


@app.get("/runs")
async def list_runs():
    return trace_store.list_runs()


@app.get("/runs/{run_id}/events")
async def get_run_events(run_id: str):
    events = trace_store.load_trace(run_id)
    if not events:
        raise HTTPException(404, "run not found")
    return events


@app.websocket("/ws/{run_id}")
async def ws_run(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    pending = _pending_runs.get(run_id)
    if pending is None:
        await websocket.send_json({"error": "unknown run_id"})
        await websocket.close()
        return

    # Подписываемся ДО запуска графа — иначе первые события (RUN_STARTED,
    # NODE_STARTED супервизора) могут уйти в никуда до того, как клиент успеет
    # открыть сокет.
    queue = await bus.subscribe(run_id)
    if not pending["started"]:
        pending["started"] = True
        asyncio.create_task(runner.run(run_id, pending["prompt"]))

    try:
        while True:
            event = await queue.get()
            await websocket.send_text(event.model_dump_json())
            if event.type == EventType.RUN_COMPLETED:
                break
    except WebSocketDisconnect:
        pass
    finally:
        await bus.unsubscribe(run_id, queue)
