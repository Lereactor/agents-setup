from .base import AgentNode, RunContext


class WriterAgent(AgentNode):
    node_type = "agent"

    async def run(self, ctx: RunContext) -> str:
        await ctx.emit_thinking(self.node_id, self.node_type, "writing")
        intro = await ctx.llm.complete(
            role="writer",
            prompt=ctx.prompt,
            system_prompt="Ты — Writer. Напиши одно вводное предложение для итогового отчёта.",
        )
        bullets = [
            f"- Исследование: {ctx.results.get('researcher', '—')}",
            f"- Анализ: {ctx.results.get('analyst', '—')}",
            f"- Проверка: {ctx.results.get('reviewer', '—')}",
        ]
        return intro + "\n" + "\n".join(bullets)
