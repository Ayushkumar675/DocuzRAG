"""Tests never export telemetry or require external provider credentials."""

import os

os.environ["LOGFIRE_ENABLED"] = "false"
