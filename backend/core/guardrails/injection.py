"""Prompt-injection detection for untrusted document content."""

from __future__ import annotations

import re
from dataclasses import dataclass

from core.observability import log_event


INJECTION_PATTERNS = (
    re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior|system|developer)\s+instructions", re.I),
    re.compile(r"you\s+are\s+now\s+(?:the|a)\s+", re.I),
    re.compile(r"reveal\s+(?:the\s+)?(?:system\s+prompt|api\s+key|secret)", re.I),
    re.compile(r"execute\s+(?:this\s+)?(?:shell|python|code|command)", re.I),
    re.compile(r"disregard\s+(?:application|security|tool)\s+rules", re.I),
)


@dataclass(frozen=True, slots=True)
class InjectionAssessment:
    detected: bool
    matched_patterns: tuple[str, ...]
    content_is_untrusted: bool = True


def assess_document_content(content: str) -> InjectionAssessment:
    """Detect suspicious instruction-like text without executing or deleting it."""

    matches = tuple(
        pattern.pattern
        for pattern in INJECTION_PATTERNS
        if pattern.search(content)
    )
    assessment = InjectionAssessment(detected=bool(matches), matched_patterns=matches)
    log_event(
        "guardrail.injection.completed",
        guardrail="prompt_injection_detection",
        detected=assessment.detected,
        matched_pattern_count=len(assessment.matched_patterns),
    )
    return assessment
