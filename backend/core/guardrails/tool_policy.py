"""Explicit allowlist for agent tool calls."""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Callable
from core.observability import observed_service, log_event


class ToolName(StrEnum):
    RETRIEVE_DOCUMENTS = "retrieve_documents"
    SEARCH_METADATA = "search_metadata"
    ANALYZE_IMAGE = "analyze_image"
    COMPARE_DOCUMENTS = "compare_documents"
    CALCULATE = "calculate"
    VERIFY_CLAIM = "verify_claim"


class UnauthorizedToolError(PermissionError):
    """Raised when a router attempts an unallowlisted tool call."""


class ToolPolicy:
    """Resolve only named tools from the explicit application allowlist."""

    def __init__(self) -> None:
        self._handlers: dict[ToolName, Callable[..., Any]] = {}

    def register(self, tool: ToolName, handler: Callable[..., Any]) -> None:
        self._handlers[tool] = handler

    @observed_service("guardrails.tool_policy")
    def call(self, tool: str | ToolName, **arguments: Any) -> Any:
        try:
            normalized = ToolName(tool)
        except ValueError as error:
            raise UnauthorizedToolError(f"Tool '{tool}' is not allowed.") from error
        handler = self._handlers.get(normalized)
        if handler is None:
            raise UnauthorizedToolError(f"Tool '{normalized.value}' is not configured.")
        log_event("guardrail.tool_policy.passed", guardrail="tool_allowlist", tool=normalized.value)
        return handler(**arguments)
