import asyncio
import random

from .base import Tool, mock_delay_seconds


class DataAnalysisTool(Tool):
    name = "data_analysis"

    async def run(self, query: str, mock_mode: bool) -> dict:
        if not mock_mode:
            return {"summary": "data_analysis: реальный источник данных не настроен"}
        await asyncio.sleep(mock_delay_seconds())
        growth_pct = round(random.uniform(8, 45), 1)
        sample_size = random.randint(120, 900)
        return {
            "growth_pct": growth_pct,
            "sample_size": sample_size,
            "summary": f"На выборке из {sample_size} записей рост показателя составил "
            f"~{growth_pct}% за анализируемый период по теме «{query}».",
        }
