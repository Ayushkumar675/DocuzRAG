"""Intent routing constrained to the approved tool allowlist."""

from __future__ import annotations

from dataclasses import dataclass

from core.guardrails.tool_policy import ToolName


@dataclass(frozen=True, slots=True)
class RouteDecision:
    tools: tuple[ToolName, ...]
    reason: str


class AgentRouter:
    """Select tools deterministically; never execute document instructions."""

    def route(self, question: str) -> RouteDecision:
        normalized = question.casefold()
        tools: list[ToolName] = []
        if any(word in normalized for word in ("calculate", "percent", "%", "average", "ratio", "growth")):
            tools.append(ToolName.CALCULATE)
        if any(word in normalized for word in ("compare", "difference", "changed", "versus", " vs ")):
            tools.append(ToolName.COMPARE_DOCUMENTS)
        if any(word in normalized for word in ("image", "chart", "graph", "diagram", "visual")):
            tools.append(ToolName.ANALYZE_IMAGE)
        if not tools:
            tools.append(ToolName.RETRIEVE_DOCUMENTS)
        if ToolName.VERIFY_CLAIM not in tools:
            tools.append(ToolName.VERIFY_CLAIM)
        return RouteDecision(
            tools=tuple(dict.fromkeys(tools)),
            reason="Selected from query intent using the explicit tool allowlist.",
        )
