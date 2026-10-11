"""Secret-leak detection for content and generated responses."""

from __future__ import annotations

import re
from core.observability import log_event
from core.guardrails.pii import contains_high_risk_pii, detect_pii_types


SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"(?:NVIDIA_API_KEY|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*\S+", re.I),
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"nvapi-[A-Za-z0-9_-]{20,}", re.I),
)


def find_secret_patterns(value: str) -> tuple[str, ...]:
    """Return pattern names only; never return matched secret values."""
    patterns = [pattern.pattern for pattern in SECRET_PATTERNS if pattern.search(value)]
    for pii_type in detect_pii_types(value):
        if pii_type in {"aadhaar", "pan", "bank_account", "payment_card", "password_or_credential"}:
            patterns.append(f"pii_{pii_type}")
    return tuple(patterns)


def contains_secret_pattern(value: str) -> bool:
    detected = bool(find_secret_patterns(value)) or contains_high_risk_pii(value)
    log_event("guardrail.secret_screening.completed", guardrail="secret_screening",
              status="blocked" if detected else "passed")
    return detected

