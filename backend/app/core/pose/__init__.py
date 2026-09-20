"""
Pose processing module for clinical posture analysis.

This module contains the core pose processing components:
- BodyCalibrator: Clinical metrics calculation
- ROMCalculator: Range of motion calculations

Imports are lazy, because the calibrators pull in scipy, which is heavy and
unnecessary when you only want the metric math - the validation harness and the
unit tests import BodyCalibrator without needing the ML stack installed. Importing
them eagerly here would force every test run and every CI job to carry mediapipe.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - import-time typing only
    from .calibration import BodyCalibrator, BodyCalibration
    from .rom_calculator import (
        AdvancedROMCalculator,
        ROMResult,
        ExerciseView,
        ExercisePosture,
    )

__all__ = [
    "BodyCalibrator",
    "BodyCalibration",
    "AdvancedROMCalculator",
    "ROMResult",
    "ExerciseView",
    "ExercisePosture",
]

_LAZY = {
    "BodyCalibrator": ".calibration",
    "BodyCalibration": ".calibration",
    "AdvancedROMCalculator": ".rom_calculator",
    "ROMResult": ".rom_calculator",
    "ExerciseView": ".rom_calculator",
    "ExercisePosture": ".rom_calculator",
}


def __getattr__(name: str):
    """PEP 562 lazy attribute access, so `from app.core.pose import X` still works."""
    module_name = _LAZY.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    from importlib import import_module

    module = import_module(module_name, __name__)
    value = getattr(module, name)
    globals()[name] = value  # cache so we only pay the import once
    return value


def __dir__():
    return sorted(__all__)
