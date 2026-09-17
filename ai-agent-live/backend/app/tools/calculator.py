import ast
import operator
from typing import Any

from .base import Tool

_OPS: dict[type, Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
}


def _eval_node(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval_node(node.operand))
    raise ValueError(f"unsupported expression node: {node!r}")


def safe_eval(expression: str) -> float:
    """Evaluates a numeric expression (+ - * / ** and parens only) without
    calling Python's eval() — no attribute/name access is possible."""
    tree = ast.parse(expression, mode="eval")
    return _eval_node(tree.body)


class CalculatorTool(Tool):
    """The one non-mock tool: real arithmetic, no external dependency needed."""

    name = "calculator"

    async def run(self, query: str, mock_mode: bool) -> dict:
        try:
            value = safe_eval(query)
            return {"expression": query, "value": value, "summary": f"{query} = {value}"}
        except Exception:
            return {"expression": query, "value": None, "summary": "не удалось вычислить выражение"}
