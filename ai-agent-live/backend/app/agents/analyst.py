from .base import AgentNode, RunContext


class AnalystAgent(AgentNode):
    node_type = "agent"

    async def run(self, ctx: RunContext) -> str:
        await ctx.emit_thinking(self.node_id, self.node_type, "analyzing")
        data = await ctx.call_tool(self.node_id, "data_analysis", ctx.prompt)
        growth = data.get("growth_pct", 0)
        calc = await ctx.call_tool(self.node_id, "calculator", f"{growth}*1.1")
        projected = calc.get("value")
        findings = f"{data.get('summary', '')} При сохранении темпа прогноз на след. период — {projected}%."
        return await ctx.llm.complete(
            role="analyst",
            prompt=ctx.prompt,
            system_prompt=(
                f"Ты — Analyst. Данные: {findings}. Кратко (1-2 предложения) сформулируй "
                "ключевой вывод для отчёта."
            ),
        )
