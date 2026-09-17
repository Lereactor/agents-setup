from .base import AgentNode, RunContext


class ResearcherAgent(AgentNode):
    node_type = "agent"

    async def run(self, ctx: RunContext) -> str:
        await ctx.emit_thinking(self.node_id, self.node_type, "searching")
        web = await ctx.call_tool(self.node_id, "web_search", ctx.prompt)
        docs = await ctx.call_tool(self.node_id, "document_search", ctx.prompt)
        findings = f"{web.get('summary', '')} {docs.get('summary', '')}".strip()
        return await ctx.llm.complete(
            role="researcher",
            prompt=ctx.prompt,
            system_prompt=(
                f"Ты — Researcher. Находки инструментов: {findings}. Кратко (1-2 "
                "предложения) сформулируй, что удалось собрать по запросу пользователя."
            ),
        )
