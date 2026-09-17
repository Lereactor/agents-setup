from .base import AgentNode, RunContext


class ReviewerAgent(AgentNode):
    node_type = "agent"

    async def run(self, ctx: RunContext) -> str:
        await ctx.emit_thinking(self.node_id, self.node_type, "reviewing")
        research = ctx.results.get("researcher", "")
        analysis = ctx.results.get("analyst", "")
        return await ctx.llm.complete(
            role="reviewer",
            prompt=ctx.prompt,
            system_prompt=(
                f"Ты — Reviewer. Есть вывод Researcher: {research} И вывод Analyst: "
                f"{analysis}. Кратко (1-2 предложения) подтверди, что данных достаточно "
                "для отчёта, или укажи один существенный недостаток."
            ),
        )
