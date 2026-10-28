"""Shared environment setting parsers for backend configuration."""

from __future__ import annotations

import logging
import os


logger = logging.getLogger(__name__)


def positive_int_setting(name: str, default: int) -> int:
    """Return a positive integer environment value, warning and using default otherwise."""
    if default < 1:
        raise ValueError("default must be a positive integer")

    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        value = int(raw_value)
    except ValueError:
        logger.warning("%s must be a positive integer; using the default value %d.", name, default)
        return default

    if value < 1:
        logger.warning("%s must be a positive integer; using the default value %d.", name, default)
        return default
    return value
