"""Optional Pydantic Logfire observability with a safe local fallback."""

from __future__ import annotations

from contextlib import contextmanager
from functools import lru_cache, wraps
import logging
import sys
from typing import Any, Iterator


@lru_cache(maxsize=1)
def _logfire_module() -> Any | None:
    try:
        import logfire
    except ImportError:
        return None
    return logfire


@lru_cache(maxsize=1)
def configure_observability() -> bool:
    """Configure Logfire once when it is installed and a token is available."""

    import os

    logfire = _logfire_module()
    token = os.getenv("LOGFIRE_TOKEN", "").strip()
    enabled = os.getenv("LOGFIRE_ENABLED", "true").strip().casefold() not in {"0", "false", "no"}
    if logfire is None or not token or not enabled:
        return False
    try:
        logfire.configure(
            token=token,
            service_name=os.getenv("LOGFIRE_SERVICE_NAME", "DocuNova-backend"),
            send_to_logfire="if-token-present",
            console=False,
        )
        if hasattr(logfire, "instrument_system_metrics"):
            logfire.instrument_system_metrics()
    except Exception as error:
        logging.getLogger("docunova.observability").warning(
            "Logfire configuration failed (%s)", type(error).__name__,
        )
        return False
    return True


def _safe_attributes(attributes: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in attributes.items()
        if not any(part in key.casefold() for part in ("api_key", "authorization", "token", "secret", "context", "content"))
    }


def log_event(message: str, **attributes: Any) -> None:
    """Emit a structured event without recording secrets or document context."""

    if not configure_observability():
        return
    logfire = _logfire_module()
    if logfire is None:
        return
    try:
        logfire.info(message, **_safe_attributes(attributes))
    except Exception:
        return


@contextmanager
def log_span(name: str, **attributes: Any) -> Iterator[None]:
    """Create a Logfire span when available, otherwise act as a no-op."""

    if not configure_observability():
        yield
        return
    logfire = _logfire_module()
    if logfire is None:
        yield
        return
    try:
        span = logfire.span(name, **_safe_attributes(attributes))
    except Exception:
        yield
        return
    # Record safe error metadata rather than exporting exception chains that
    # might include provider request headers or application input.
    span.__enter__()
    error_info = (None, None, None)
    try:
        yield
    except BaseException as error:
        error_info = sys.exc_info()
        log_event("operation.failed", operation=name, status="error", error_type=type(error).__name__)
        raise
    finally:
        span.__exit__(*error_info)


def observed_service(name: str):
    """Trace a service boundary without capturing its arguments or outputs."""
    def decorate(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            log_event("service.started", service=name, status="started")
            with log_span(name, service=name):
                try:
                    result = function(*args, **kwargs)
                except Exception as error:
                    log_event("service.completed", service=name, status="error",
                              error_type=type(error).__name__)
                    raise
                log_event("service.completed", service=name, status="complete")
                return result
        return wrapped
    return decorate


def instrument_fastapi(app: Any) -> None:
    """Instrument FastAPI if the installed Logfire version supports it."""

    if not configure_observability():
        return
    logfire = _logfire_module()
    if logfire is None:
        return

    def request_attributes_mapper(_request: Any, attributes: dict[str, Any]) -> dict[str, Any]:
        # Keep validation failures useful while dropping questions, filenames,
        # and other request values from exported spans.
        errors = attributes.get("errors") or []
        return {"errors": [{"type": item.get("type"), "loc": item.get("loc")} for item in errors]}

    try:
        logfire.instrument_fastapi(
            app,
            capture_headers=False,
            request_attributes_mapper=request_attributes_mapper,
        )
    except Exception:
        return
