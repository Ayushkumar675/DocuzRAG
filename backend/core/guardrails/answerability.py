"""Answerability states and safe abstention messages."""

from __future__ import annotations

from enum import StrEnum


class Answerability(StrEnum):
    SUPPORTED = "SUPPORTED"
    PARTIALLY_SUPPORTED = "PARTIALLY_SUPPORTED"
    NOT_SUPPORTED = "NOT_SUPPORTED"


NO_EVIDENCE_ABSTENTION = (
    "I cannot answer this question from the selected documents because "
    "no supporting evidence was retrieved."
)

UNVERIFIED_ABSTENTION = (
    "I could not verify a grounded answer from the retrieved evidence."
)
