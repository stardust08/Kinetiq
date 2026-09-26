"""
Tests for the recommendation engine and the rules it reads.

The engine's job is to turn measurements into exercises. Most of these tests are about
the cases where it must turn measurements into *nothing*, because that is where the
product's honesty lives: a metric the pipeline could not measure, a metric with no cited
normal range, and a deviation smaller than the measurement's own repeatability all have
to produce no prescription. Each of those looks identical to a healthy result from the
outside, and each would otherwise hand a patient exercises for a number nobody can
stand behind.

`test_the_rules_are_coherent` is the one that pays for itself. It checks every rule
against the live metric registries, so a rule keyed on a metric that gets retired,
renamed or marked unsupported fails the build rather than silently never firing.
"""

from __future__ import annotations

import pytest

from app.core.exercise.engine import (
    build_prescription,
    extract_findings,
    generate,
    summarise_findings,
)
from app.core.exercise.library import (
    EXERCISES,
    EXERCISES_BY_SLUG,
    RULES,
    validate_rules,
)


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Override the project-wide autouse fixture; nothing here touches a database."""
    yield


def metric(
    key,
    value,
    normal_range,
    *,
    status="measured",
    unit="degrees",
    name=None,
):
    return {
        key: {
            "key": key,
            "clinicalName": name or key,
            "value": value,
            "unit": unit,
            "status": status,
            "normalRange": normal_range,
        }
    }


def payload(*metric_dicts):
    merged = {}
    for d in metric_dicts:
        merged.update(d)
    return {"metrics": merged}


# ---------------------------------------------------------------------------
# The rules themselves
# ---------------------------------------------------------------------------


class TestLibraryIntegrity:
    def test_the_rules_are_coherent(self):
        """
        Every rule must name a real, supported, gradeable metric and real exercises.

        This catches the three mistakes that are invisible at runtime: a typo'd exercise
        slug prescribes nothing, a rule on an unsupported metric never fires, and a rule
        on a metric with no normal range has no threshold to trigger on. All three look
        like coverage and behave like absence.
        """
        problems = validate_rules()
        assert problems == [], "incoherent rules:\n  " + "\n  ".join(problems)

    def test_every_exercise_has_a_dose(self):
        """
        An exercise with neither reps nor a hold time tells the patient to do the
        movement an unspecified number of times. Enforced in ExerciseDef.__post_init__;
        asserted here so the constructor guard cannot be removed unnoticed.
        """
        for exercise in EXERCISES:
            assert (
                exercise.default_reps is not None
                or exercise.default_hold_seconds is not None
            ), f"{exercise.slug} has no reps and no hold time"

    def test_every_exercise_has_instructions_and_a_citation(self):
        for exercise in EXERCISES:
            assert exercise.instructions, f"{exercise.slug} has no instructions"
            assert exercise.reference, f"{exercise.slug} has no citation"

    def test_slugs_are_unique(self):
        slugs = [e.slug for e in EXERCISES]
        assert len(slugs) == len(set(slugs))

    def test_range_of_motion_rules_only_fire_on_restriction(self):
        """
        A ROM normal range is a floor, not a band: reaching further than published is
        healthy. A rule that fired above the range would prescribe stretches to somebody
        whose shoulder moves well.
        """
        from app.core.exercise.library import Trigger

        for rule in RULES:
            if rule.metric_key.startswith("rom_"):
                assert rule.trigger is Trigger.BELOW_NORMAL, (
                    f"{rule.metric_key} fires on {rule.trigger.value}; range of motion "
                    f"is a floor and only a shortfall is a finding"
                )


# ---------------------------------------------------------------------------
# What must NOT produce a finding
# ---------------------------------------------------------------------------


class TestGatesBeforeAFinding:
    def test_a_value_inside_its_range_is_not_a_finding(self):
        findings = extract_findings(
            payload(metric("trunk_angle", 2.0, [-2.0, 6.0])), "POSTURE"
        )
        assert findings == []

    @pytest.mark.parametrize(
        "status", ["insufficient_data", "low_confidence", "out_of_range", "unsupported"]
    )
    def test_a_metric_that_was_not_measured_is_never_a_finding(self, status):
        """
        The most important gate. A shoulder that could not be measured because the
        patient never turned sideways is not a healthy shoulder, and it is not an
        abnormal one either - it is a missing measurement, and prescribing from it would
        mean prescribing from nothing.
        """
        findings = extract_findings(
            payload(
                metric("rom_shoulder_flexion_left", 90.0, [165.0, 180.0], status=status)
            ),
            "ROM",
        )
        assert findings == []

    def test_a_metric_with_no_cited_range_is_never_a_finding(self):
        """
        Half the registry deliberately has no normal range - either no clinical
        threshold exists, or the measurement error is wider than the published range.
        Without a range there is no outside to be on.
        """
        findings = extract_findings(
            payload(metric("forward_head_ratio", 0.9, None, unit="ratio")), "POSTURE"
        )
        assert findings == []

    def test_a_deviation_inside_measurement_noise_prescribes_nothing(self):
        """
        `pelvic_obliquity` has an MDC95 of 1.076 degrees. A value 0.3 degrees outside its
        band is a measurement that landed on the other side of a line, not a finding, and
        it will have moved on its own by next week.
        """
        findings = extract_findings(
            payload(metric("pelvic_obliquity", 2.8, [-2.5, 2.5])), "POSTURE"
        )

        assert len(findings) == 1, "the finding should be reported, not dropped"
        finding = findings[0]
        assert finding.severity == "borderline"
        assert finding.actionable is False
        assert finding.exceeds_mdc is False
        # The clinician is told why it carries no verdict.
        assert "repeat-measurement error" in finding.statement

        assert build_prescription(findings, "POSTURE") == []

    def test_a_borderline_finding_is_hidden_from_the_patient_summary(self):
        outcome = generate(
            payload(metric("pelvic_obliquity", 2.8, [-2.5, 2.5])), "POSTURE"
        )
        assert outcome["prescriptions"] == []
        assert "did not find any measurement outside" in outcome["summary"]
        # But it is still recorded, for the clinician.
        assert len(outcome["findings"]) == 1

    def test_a_malformed_payload_produces_nothing_rather_than_raising(self):
        """
        Called from the finalize path. Raising here would mean a patient who completed a
        capture gets no result because the plan generator tripped over the payload.
        """
        for bad in (None, [], "text", 42, {}, {"metrics": None}, {"metrics": "x"}):
            assert extract_findings(bad, "POSTURE") == []

    def test_a_non_numeric_value_is_skipped(self):
        findings = extract_findings(
            payload(metric("trunk_angle", "eleven", [-2.0, 6.0])), "POSTURE"
        )
        assert findings == []


# ---------------------------------------------------------------------------
# Grading
# ---------------------------------------------------------------------------


class TestGrading:
    def test_a_band_metric_is_graded_against_its_band_width(self):
        findings = extract_findings(
            payload(metric("trunk_angle", 11.2, [-2.0, 6.0])), "POSTURE"
        )
        assert findings[0].direction == "above"
        assert findings[0].deviation == pytest.approx(5.2)
        assert findings[0].actionable is True

    def test_a_floor_metric_is_graded_against_a_fraction_of_the_floor(self):
        """
        Regression test. The floor scale was once a constant with a lower bound of 5.0,
        which is a sensible number of degrees and an enormous ratio - so every ratio
        metric graded as mild no matter how far short it fell. Walking speed 0.8 against
        a floor of 1.1 is not mild.
        """
        rom = extract_findings(
            payload(metric("rom_shoulder_flexion_right", 118.0, [165.0, 180.0])), "ROM"
        )
        assert rom[0].severity == "marked"

        gait = extract_findings(
            payload(metric("walking_speed_ratio", 0.8, [1.1, 1.6], unit="ratio")), "GAIT"
        )
        assert gait[0].severity == "marked"

    def test_reaching_past_a_floor_is_not_a_finding(self):
        findings = extract_findings(
            payload(metric("rom_shoulder_flexion_left", 178.0, [165.0, 180.0])), "ROM"
        )
        assert findings == []

    def test_a_signed_floor_is_graded_on_distance_travelled_not_direction(self):
        """
        Cervical lateral flexion is signed with a band of (-45, 45), which means 45
        degrees each way rather than a window between the two numbers.

        So the graded quantity is how far the neck travelled, and the sign only says
        which way. A left side-bend recorded as -43 is a 2-degree shortfall against the
        45-degree floor. Read as an ordinary band it would sit comfortably inside
        (-45, 45) and produce no finding at all, which is how a genuinely restricted
        neck - -18, below - would have gone unreported.
        """
        nearly_full = extract_findings(
            payload(metric("rom_cervical_lateral_flexion", -43.0, [-45.0, 45.0])),
            "ROM",
        )
        assert len(nearly_full) == 1
        assert nearly_full[0].deviation == pytest.approx(2.0)
        assert nearly_full[0].severity == "mild"

        restricted = extract_findings(
            payload(metric("rom_cervical_lateral_flexion", -18.0, [-45.0, 45.0])),
            "ROM",
        )
        assert len(restricted) == 1
        assert restricted[0].direction == "below"
        # Graded on the 27 degrees it fell short by, not on its distance from -45.
        assert restricted[0].deviation == pytest.approx(27.0)
        assert restricted[0].severity == "marked"

    def test_a_full_range_signed_movement_is_not_a_finding(self):
        for value in (45.0, -45.0, 48.0, -50.0):
            findings = extract_findings(
                payload(metric("rom_cervical_lateral_flexion", value, [-45.0, 45.0])),
                "ROM",
            )
            assert findings == [], f"{value} degrees reaches the floor and is not a finding"

    def test_findings_come_back_worst_first(self):
        findings = extract_findings(
            payload(
                metric("trunk_angle", 7.0, [-2.0, 6.0]),
                metric("left_knee_angle", 150.0, [175.0, 185.0]),
            ),
            "POSTURE",
        )
        severities = [f.severity for f in findings]
        assert severities == sorted(
            severities, key=lambda s: {"marked": 3, "moderate": 2, "mild": 1, "borderline": 0}[s], reverse=True
        )

    def test_the_statement_names_the_number_and_the_expectation(self):
        findings = extract_findings(
            payload(
                metric(
                    "rom_knee_flexion_left",
                    101.0,
                    [130.0, 145.0],
                    name="Knee flexion (left)",
                )
            ),
            "ROM",
        )
        statement = findings[0].statement
        assert "101" in statement
        assert "130" in statement
        assert "Knee flexion (left)" in statement


# ---------------------------------------------------------------------------
# Prescription
# ---------------------------------------------------------------------------


class TestPrescription:
    def test_a_restriction_prescribes_exercises_for_that_joint(self):
        outcome = generate(
            payload(metric("rom_shoulder_flexion_right", 118.0, [165.0, 180.0])), "ROM"
        )
        slugs = {p["exerciseSlug"] for p in outcome["prescriptions"]}
        assert "shoulder-flexion-wand-aarom" in slugs
        assert all(s in EXERCISES_BY_SLUG for s in slugs)

    def test_the_side_of_the_finding_reaches_the_prescription(self):
        """
        A right-shoulder restriction must not produce left-shoulder work. The side is
        the difference between the right exercise and a useless one.
        """
        outcome = generate(
            payload(metric("rom_knee_flexion_left", 101.0, [130.0, 145.0])), "ROM"
        )
        for prescription in outcome["prescriptions"]:
            assert prescription["sides"] == ["left"]

    def test_a_signed_finding_selects_the_correct_side(self):
        """
        `shoulder_obliquity` positive means the RIGHT shoulder sits high. Stretching the
        left upper trapezius for that patient is not a lesser intervention, it is the
        wrong one.
        """
        right_high = generate(
            payload(metric("shoulder_obliquity", 5.0, [-2.5, 2.5])), "POSTURE"
        )
        sides = {s for p in right_high["prescriptions"] for s in p["sides"]}
        assert sides == {"right"}

        left_high = generate(
            payload(metric("shoulder_obliquity", -5.0, [-2.5, 2.5])), "POSTURE"
        )
        sides = {s for p in left_high["prescriptions"] for s in p["sides"]}
        assert sides == {"left"}

    def test_one_exercise_reached_twice_is_listed_once_with_both_reasons(self):
        """
        A patient handed the same exercise three times with three explanations would
        reasonably conclude the report is broken.
        """
        outcome = generate(
            payload(
                metric("rom_shoulder_flexion_left", 110.0, [165.0, 180.0]),
                metric("rom_shoulder_abduction_left", 100.0, [165.0, 180.0]),
            ),
            "ROM",
        )
        slugs = [p["exerciseSlug"] for p in outcome["prescriptions"]]
        assert len(slugs) == len(set(slugs))

        pendulum = next(
            p for p in outcome["prescriptions"] if p["exerciseSlug"] == "pendulum-codman"
        )
        # Reached by both findings, so it carries both and outranks a single-finding item.
        assert len(pendulum["triggerMetricKeys"]) == 2

    def test_an_exercise_addressing_more_findings_outranks_one_addressing_fewer(self):
        outcome = generate(
            payload(
                metric("rom_shoulder_flexion_left", 110.0, [165.0, 180.0]),
                metric("rom_shoulder_abduction_left", 100.0, [165.0, 180.0]),
            ),
            "ROM",
        )
        priorities = [p["priority"] for p in outcome["prescriptions"]]
        assert priorities == sorted(priorities, reverse=True)

    def test_the_plan_is_capped_so_a_patient_might_actually_do_it(self):
        """
        A twenty-item home programme gets done by nobody. The cap is applied after
        ranking, so what survives is the highest-value work.
        """
        outcome = generate(
            payload(
                metric("rom_shoulder_flexion_left", 100.0, [165.0, 180.0]),
                metric("rom_shoulder_flexion_right", 100.0, [165.0, 180.0]),
                metric("rom_shoulder_abduction_left", 100.0, [165.0, 180.0]),
                metric("rom_shoulder_abduction_right", 100.0, [165.0, 180.0]),
                metric("rom_knee_flexion_left", 80.0, [130.0, 145.0]),
                metric("rom_knee_flexion_right", 80.0, [130.0, 145.0]),
                metric("rom_hip_flexion_left", 50.0, [90.0, 125.0]),
                metric("rom_hip_flexion_right", 50.0, [90.0, 125.0]),
                metric("rom_elbow_flexion_left", 90.0, [135.0, 150.0]),
                metric("rom_elbow_flexion_right", 90.0, [135.0, 150.0]),
            ),
            "ROM",
        )
        assert 0 < len(outcome["prescriptions"]) <= 8

    def test_a_rule_does_not_fire_on_the_wrong_analysis(self):
        """
        ROM rules are keyed to ROM captures. A posture capture that happened to expose a
        same-named quantity must not be read as a range-of-motion result - it is measured
        from a body at rest, which answers a different question.
        """
        outcome = generate(
            payload(metric("rom_knee_flexion_left", 80.0, [130.0, 145.0])), "POSTURE"
        )
        assert outcome["prescriptions"] == []

    def test_every_prescription_carries_a_reason_a_patient_can_read(self):
        outcome = generate(
            payload(metric("cadence", 86.0, [100.0, 120.0], unit="steps_per_min")),
            "GAIT",
        )
        assert outcome["prescriptions"]
        for prescription in outcome["prescriptions"]:
            assert prescription["reason"].strip()
            # The reason names the measurement, not just the exercise.
            assert "86" in prescription["reason"]


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


class TestSummary:
    def test_a_clean_screening_says_so_without_inventing_reassurance(self):
        summary = summarise_findings([], "POSTURE")
        assert "did not find any measurement outside" in summary

    def test_a_summary_names_the_worst_finding(self):
        findings = extract_findings(
            payload(
                metric(
                    "rom_shoulder_flexion_right",
                    118.0,
                    [165.0, 180.0],
                    name="Shoulder flexion (right)",
                )
            ),
            "ROM",
        )
        summary = summarise_findings(findings, "ROM")
        assert "Shoulder flexion (right)" in summary
        # And says a clinician reviews it before it becomes a programme.
        assert "clinician" in summary.lower()

    def test_the_outcome_envelope_is_complete(self):
        outcome = generate(
            payload(metric("rom_knee_flexion_left", 101.0, [130.0, 145.0])), "ROM"
        )
        assert set(outcome) == {
            "engineVersion",
            "analysisType",
            "title",
            "summary",
            "findings",
            "prescriptions",
        }
        assert outcome["analysisType"] == "ROM"
        assert outcome["engineVersion"] >= 1


class TestPayloadShapes:
    def test_a_top_level_metric_map_is_read_as_well_as_a_wrapped_one(self):
        """
        Older rows store the metric map without a "metrics" wrapper. A reader that only
        understood one shape would return "no findings" for the other - which looks
        exactly like a healthy patient.
        """
        wrapped = extract_findings(
            payload(metric("trunk_angle", 11.0, [-2.0, 6.0])), "POSTURE"
        )
        flat = extract_findings(
            metric("trunk_angle", 11.0, [-2.0, 6.0]), "POSTURE"
        )
        assert len(wrapped) == len(flat) == 1
        assert wrapped[0].metric_key == flat[0].metric_key

    def test_snake_case_keys_are_accepted(self):
        """Some writers emit `normal_range` / `clinical_name`."""
        findings = extract_findings(
            {
                "trunk_angle": {
                    "clinical_name": "Trunk sagittal lean",
                    "value": 11.0,
                    "unit": "degrees",
                    "status": "measured",
                    "normal_range": [-2.0, 6.0],
                }
            },
            "POSTURE",
        )
        assert len(findings) == 1
        assert findings[0].clinical_name == "Trunk sagittal lean"

    def test_a_reversed_range_is_normalised_rather_than_inverted(self):
        findings = extract_findings(
            payload(metric("trunk_angle", 11.0, [6.0, -2.0])), "POSTURE"
        )
        assert len(findings) == 1
        assert findings[0].normal_range == (-2.0, 6.0)
