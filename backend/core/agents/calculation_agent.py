"""Allowlisted deterministic calculation agent."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from typing import Iterable
from core.observability import observed_service


class CalculationError(ValueError):
    """Raised when a structured calculation request is invalid."""


class CalculationOperation(StrEnum):
    ADD = "add"
    SUBTRACT = "subtract"
    MULTIPLY = "multiply"
    DIVIDE = "divide"
    AVERAGE = "average"
    RATIO = "ratio"
    PERCENTAGE_CHANGE = "percentage_change"
    GROWTH = "growth"


@dataclass(frozen=True, slots=True)
class CalculationRequest:
    operation: CalculationOperation
    values: tuple[Decimal, ...]

    @classmethod
    def from_numbers(
        cls,
        operation: CalculationOperation,
        values: Iterable[int | float | str | Decimal],
    ) -> "CalculationRequest":
        converted: list[Decimal] = []
        for value in values:
            try:
                decimal = Decimal(str(value))
            except (InvalidOperation, ValueError) as error:
                raise CalculationError("Calculation input contains a non-numeric value.") from error
            if not decimal.is_finite():
                raise CalculationError("Calculation input must be finite.")
            converted.append(decimal)
        return cls(operation=operation, values=tuple(converted))


@dataclass(frozen=True, slots=True)
class CalculationResult:
    operation: CalculationOperation
    inputs: tuple[Decimal, ...]
    result: Decimal
    explanation: str


@observed_service("tools.calculate")
def calculate(request: CalculationRequest) -> CalculationResult:
    """Perform only explicit, deterministic arithmetic operations."""

    values = request.values
    operation = request.operation
    if not values:
        raise CalculationError("At least one calculation input is required.")
    if operation in {
        CalculationOperation.SUBTRACT,
        CalculationOperation.DIVIDE,
        CalculationOperation.RATIO,
        CalculationOperation.PERCENTAGE_CHANGE,
        CalculationOperation.GROWTH,
    } and len(values) != 2:
        raise CalculationError(f"{operation.value} requires exactly two inputs.")
    if operation in {
        CalculationOperation.ADD,
        CalculationOperation.MULTIPLY,
    } and len(values) < 2:
        raise CalculationError(f"{operation.value} requires at least two inputs.")

    if operation == CalculationOperation.ADD:
        result = sum(values, Decimal(0))
        explanation = "Added all inputs deterministically."
    elif operation == CalculationOperation.SUBTRACT:
        result = values[0] - values[1]
        explanation = "Subtracted the second input from the first."
    elif operation == CalculationOperation.MULTIPLY:
        result = Decimal(1)
        for value in values:
            result *= value
        explanation = "Multiplied all inputs deterministically."
    elif operation in {CalculationOperation.DIVIDE, CalculationOperation.RATIO}:
        _require_nonzero(values[1])
        result = values[0] / values[1]
        explanation = "Divided the first input by the second."
    elif operation == CalculationOperation.AVERAGE:
        result = sum(values, Decimal(0)) / Decimal(len(values))
        explanation = "Computed the arithmetic mean deterministically."
    else:
        _require_nonzero(values[0])
        result = ((values[1] - values[0]) / values[0]) * Decimal(100)
        explanation = "Computed percentage change from the first input to the second."

    return CalculationResult(
        operation=operation,
        inputs=values,
        result=result,
        explanation=explanation,
    )


def _require_nonzero(value: Decimal) -> None:
    if value == 0:
        raise CalculationError("Division by zero is not allowed.")
