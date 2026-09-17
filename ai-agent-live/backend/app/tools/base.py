import random
from abc import ABC, abstractmethod
from typing import Any


class Tool(ABC):
    name: str

    @abstractmethod
    async def run(self, query: str, mock_mode: bool) -> dict[str, Any]:
        """Return a small JSON-serializable result — this is embedded directly
        in event metadata sent to the frontend, so keep it short (docx §8:
        "ограничить размер выводов инструментов")."""


def mock_delay_seconds() -> float:
    return random.uniform(0.6, 1.6)
