from .base import AgentNode, RunContext


class SupervisorAgent(AgentNode):
    node_type = "supervisor"

    async def run(self, ctx: RunContext) -> str:
        await ctx.emit_thinking(self.node_id, self.node_type, "planning")
        return await ctx.llm.complete(
            role="supervisor",
            prompt=ctx.prompt,
            system_prompt=(
                "Ты — supervisor мультиагентной команды. Кратко (1-2 предложения) опиши, "
                "как разбиваешь задачу пользователя между Researcher и Analyst."
            ),
        )
