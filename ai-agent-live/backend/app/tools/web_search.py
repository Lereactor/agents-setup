import asyncio
import random

from .base import Tool, mock_delay_seconds

_SOURCES = ["РБК", "Коммерсантъ", "Forbes", "Habr", "внутренний wiki", "TAdviser", "VC.ru"]


class WebSearchTool(Tool):
    name = "web_search"

    async def run(self, query: str, mock_mode: bool) -> dict:
        if not mock_mode:
            return {"result_count": 0, "summary": "web_search: реальный провайдер не настроен"}
        await asyncio.sleep(mock_delay_seconds())
        count = random.randint(8, 24)
        picked = random.sample(_SOURCES, k=min(3, len(_SOURCES)))
        return {
            "result_count": count,
            "top_sources": picked,
            "summary": f"Найдено {count} релевантных материалов по запросу «{query}» "
            f"(источники: {', '.join(picked)}).",
        }
