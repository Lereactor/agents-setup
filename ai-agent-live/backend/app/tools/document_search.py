import asyncio
import random

from .base import Tool, mock_delay_seconds

_DOCS = [
    "Регламент эскалации инцидентов v3",
    "Отчёт о нагрузке команды сопровождения Q2",
    "Инструкция по приоритизации тикетов",
    "Протокол ретро за прошлый квартал",
    "План найма технической поддержки",
]


class DocumentSearchTool(Tool):
    name = "document_search"

    async def run(self, query: str, mock_mode: bool) -> dict:
        if not mock_mode:
            return {"summary": "document_search: локальный индекс документов не настроен"}
        await asyncio.sleep(mock_delay_seconds())
        found = random.sample(_DOCS, k=min(2, len(_DOCS)))
        return {
            "documents": found,
            "summary": f"В локальном индексе по запросу «{query}» найдено: "
            f"{', '.join(found)}.",
        }
