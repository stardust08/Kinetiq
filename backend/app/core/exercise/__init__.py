"""Exercise catalogue and the rules that turn a screening into a prescription."""

from app.core.exercise.library import (
    EXERCISES,
    RULES,
    BodyRegion,
    Difficulty,
    ExerciseDef,
    Rule,
    Trigger,
    exercise_by_slug,
    rules_for_metric,
)
from app.core.exercise.engine import (
    ENGINE_VERSION,
    Finding,
    Prescription,
    build_prescription,
    extract_findings,
    summarise_findings,
)

__all__ = [
    "EXERCISES",
    "RULES",
    "BodyRegion",
    "Difficulty",
    "ExerciseDef",
    "Rule",
    "Trigger",
    "exercise_by_slug",
    "rules_for_metric",
    "ENGINE_VERSION",
    "Finding",
    "Prescription",
    "build_prescription",
    "extract_findings",
    "summarise_findings",
]
