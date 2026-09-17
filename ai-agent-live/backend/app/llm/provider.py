import asyncio
import random

from ..config import Settings

# Правдоподобные заглушки для MOCK_MODE — по одной на роль, без обращения к
# внешнему API. Реальный режим использует настоящий LLM через OpenAI-совместимый
# клиент (см. ниже).
_ROLE_TEMPLATES: dict[str, list[str]] = {
    "supervisor": [
        "Разбираю запрос «{prompt}» на подзадачи: сбор данных, анализ, проверка и "
        "финальный отчёт. Передаю Researcher и Analyst.",
    ],
    "researcher": [
        "Собрал внешние и внутренние источники по теме «{prompt}» — данные переданы "
        "на анализ.",
    ],
    "analyst": [
        "Проанализировал собранные данные по теме «{prompt}», выделил ключевые "
        "тренды и метрики.",
    ],
    "reviewer": [
        "Проверил черновик отчёта по теме «{prompt}» на полноту и непротиворечивость "
        "— существенных замечаний нет.",
    ],
    "writer": [
        "Подготовил краткий управленческий отчёт с рекомендациями по теме «{prompt}».",
    ],
}


class LLMProvider:
    """Единая точка входа к LLM. В MOCK_MODE ничего никуда не стучится — только
    правдоподобный текст с искусственной задержкой (см. docx §8, §MOCK DEMO)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = None
        if not settings.mock_mode and settings.openai_api_key:
            from openai import AsyncOpenAI

            kwargs: dict = {"api_key": settings.openai_api_key}
            if settings.openai_base_url:
                kwargs["base_url"] = settings.openai_base_url
            self._client = AsyncOpenAI(**kwargs)

    @property
    def is_mock(self) -> bool:
        return self._client is None

    async def complete(self, role: str, prompt: str, system_prompt: str) -> str:
        if self._client is None:
            await asyncio.sleep(random.uniform(0.8, 2.0))
            template = random.choice(_ROLE_TEMPLATES.get(role, ["Готово."]))
            return template.format(prompt=prompt)

        response = await self._client.chat.completions.create(
            model=self._settings.openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        )
        return response.choices[0].message.content or ""
