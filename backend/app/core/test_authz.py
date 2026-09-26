"""
Tests for the role model and the access policy.

These are cheap tests guarding an expensive mistake. Every one of them is a statement
about who can read whose clinical record, and the cost of getting one wrong is a patient
seeing another patient's measurements.

The scope filters get as much attention as the assertions, because they are what most
queries actually use - and a filter that returns `{}` where it meant
`{"userId": ...}` does not fail, it returns everybody.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.authz import (
    analysis_scope_filter,
    assert_can_access_booking,
    assert_can_review_plan,
    booking_scope_filter,
    can_access_analysis,
    can_access_booking,
    can_access_patient_record,
    can_review_plan,
    can_start_screening,
    patient_scope_filter,
    plan_scope_filter,
    resolve_target_patient_id,
    video_session_scope_filter,
)
from app.core.exceptions import ForbiddenException, NotFoundException
from app.core.roles import Role, is_admin, is_clinician, is_patient, is_staff


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Override the project-wide autouse fixture; nothing here touches a database."""
    yield


PATIENT = SimpleNamespace(id="patient_1", role="USER", status="ACTIVE")
OTHER_PATIENT = SimpleNamespace(id="patient_2", role="USER", status="ACTIVE")
CLINICIAN = SimpleNamespace(id="clin_1", role="CLINICIAN", status="ACTIVE")
OTHER_CLINICIAN = SimpleNamespace(id="clin_2", role="CLINICIAN", status="ACTIVE")
ADMIN = SimpleNamespace(id="admin_1", role="ADMIN", status="ACTIVE")


def booking(user_id="patient_1", clinician_id="clin_1"):
    return SimpleNamespace(id="bk_1", userId=user_id, clinicianId=clinician_id)


# ---------------------------------------------------------------------------
# Role
# ---------------------------------------------------------------------------


class TestRole:
    def test_the_patient_role_is_stored_as_user(self):
        """
        The stored value stays `USER`; only this enum knows it means "patient".

        Renaming the column value would rewrite every existing row and invalidate every
        JWT already issued, so the mapping lives in code instead.
        """
        assert Role.PATIENT.value == "USER"

    def test_a_patient_is_never_labelled_user(self):
        """`USER` is a database value. Showing it to a human is a bug."""
        assert Role.PATIENT.label == "Patient"
        assert Role.CLINICIAN.label == "Clinician"
        assert Role.ADMIN.label == "Administrator"

    @pytest.mark.parametrize(
        "given,expected",
        [
            ("USER", Role.PATIENT),
            ("patient", Role.PATIENT),
            ("CLINICIAN", Role.CLINICIAN),
            # Patients and half the product copy say "doctor". Accept it on input.
            ("doctor", Role.CLINICIAN),
            ("physiotherapist", Role.CLINICIAN),
            ("ADMIN", Role.ADMIN),
            ("administrator", Role.ADMIN),
            ("  admin  ", Role.ADMIN),
        ],
    )
    def test_parse_accepts_the_spellings_clients_send(self, given, expected):
        assert Role.parse(given) is expected

    @pytest.mark.parametrize("given", ["", "SUPERUSER", "guest", None, "auditor"])
    def test_parse_refuses_anything_it_does_not_know(self, given):
        """
        Fail loudly. Defaulting an unparseable role to PATIENT would grant access to a
        request nobody understood.
        """
        with pytest.raises(ValueError):
            Role.parse(given)

    def test_the_predicates_agree_with_parse(self):
        assert is_patient(PATIENT) and not is_staff(PATIENT)
        assert is_clinician(CLINICIAN) and is_staff(CLINICIAN)
        assert is_admin(ADMIN) and is_staff(ADMIN)

    def test_the_predicates_fail_closed_on_a_broken_user(self):
        """A user object with no parseable role is not staff."""
        broken = SimpleNamespace(id="x", role="NONSENSE")
        assert not is_staff(broken)
        assert not is_admin(broken)
        assert not is_patient(broken)
        assert not is_staff(SimpleNamespace(id="x"))  # no role attribute at all


# ---------------------------------------------------------------------------
# Scope filters
# ---------------------------------------------------------------------------


class TestBookingScope:
    def test_a_patient_is_scoped_to_their_own(self):
        assert booking_scope_filter(PATIENT) == {"userId": "patient_1"}

    def test_a_clinician_is_scoped_to_their_assignments(self):
        assert booking_scope_filter(CLINICIAN) == {"clinicianId": "clin_1"}

    def test_an_admin_is_unscoped(self):
        """`{}` merges into a larger filter as a no-op, which is why it is a fragment."""
        assert booking_scope_filter(ADMIN) == {}


class TestPatientScope:
    def test_a_clinician_sees_patients_booked_with_them(self):
        scope = patient_scope_filter(CLINICIAN)
        assert scope["role"] == "USER"
        # The assignment on a booking is the only route by which a patient becomes
        # visible to a clinician.
        assert scope["bookings"] == {"some": {"clinicianId": "clin_1"}}

    def test_an_admin_sees_every_patient(self):
        assert patient_scope_filter(ADMIN) == {"role": "USER"}

    def test_a_patients_patient_list_is_themselves(self):
        assert patient_scope_filter(PATIENT) == {"id": "patient_1"}


class TestPlanScope:
    def test_a_patient_never_sees_a_draft(self):
        """
        The safety property of the whole exercise module. A draft is a machine
        suggestion no clinician has read, and showing one to a patient would present an
        unreviewed algorithm as clinical advice.
        """
        scope = plan_scope_filter(PATIENT)
        assert scope["patientId"] == "patient_1"
        assert scope["status"] == {"not": "DRAFT"}

    def test_staff_do_see_drafts_because_reviewing_them_is_the_job(self):
        assert "status" not in plan_scope_filter(CLINICIAN)
        assert plan_scope_filter(ADMIN) == {}


class TestAnalysisScope:
    def test_a_patient_is_scoped_by_their_own_id(self):
        assert analysis_scope_filter(PATIENT) == {"userId": "patient_1"}

    def test_a_clinician_is_scoped_through_the_booking(self):
        """
        The analysis row records the patient, not the clinician. A clinician's claim
        runs through the assignment on the booking, so that is what the filter reaches
        for.
        """
        assert analysis_scope_filter(CLINICIAN) == {
            "booking": {"is": {"clinicianId": "clin_1"}}
        }


class TestVideoSessionScope:
    def test_a_clinician_reaches_a_session_or_its_booking(self):
        """
        Two ways in, because a consultation may be created before its clinician column
        is filled in - and a clinician assigned to the booking must still be able to
        open it.
        """
        scope = video_session_scope_filter(CLINICIAN)
        assert {"clinicianId": "clin_1"} in scope["OR"]
        assert {"booking": {"is": {"clinicianId": "clin_1"}}} in scope["OR"]

    def test_a_patient_reaches_only_their_own(self):
        assert video_session_scope_filter(PATIENT) == {"patientId": "patient_1"}


# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------


class TestBookingAccess:
    def test_the_owner_may_access(self):
        assert can_access_booking(PATIENT, booking())

    def test_another_patient_may_not(self):
        assert not can_access_booking(OTHER_PATIENT, booking())

    def test_the_assigned_clinician_may(self):
        assert can_access_booking(CLINICIAN, booking(clinician_id="clin_1"))

    def test_an_unassigned_clinician_may_not(self):
        assert not can_access_booking(OTHER_CLINICIAN, booking(clinician_id="clin_1"))

    def test_a_booking_with_no_clinician_is_closed_to_clinicians(self):
        assert not can_access_booking(CLINICIAN, booking(clinician_id=None))

    def test_an_admin_may(self):
        assert can_access_booking(ADMIN, booking(clinician_id=None))

    def test_a_missing_booking_is_not_accessible(self):
        assert not can_access_booking(ADMIN, None)

    def test_out_of_scope_raises_not_found_rather_than_forbidden(self):
        """
        Deliberate: a 403 on somebody else's real booking id confirms the id exists.
        The two cases are indistinguishable from outside.
        """
        with pytest.raises(NotFoundException):
            assert_can_access_booking(OTHER_PATIENT, booking())
        with pytest.raises(NotFoundException):
            assert_can_access_booking(PATIENT, None)


class TestPatientRecordAccess:
    def test_a_patient_reaches_only_themselves(self):
        assert can_access_patient_record(PATIENT, "patient_1")
        assert not can_access_patient_record(PATIENT, "patient_2")

    def test_an_admin_reaches_anybody(self):
        assert can_access_patient_record(ADMIN, "patient_2")

    def test_a_clinician_needs_their_caseload_passed_in(self):
        assert can_access_patient_record(
            CLINICIAN, "patient_1", assigned_patient_ids=["patient_1"]
        )
        assert not can_access_patient_record(
            CLINICIAN, "patient_9", assigned_patient_ids=["patient_1"]
        )

    def test_a_clinician_with_no_caseload_supplied_fails_closed(self):
        """
        The caseload is passed in so a caller looping over patients does not issue a
        query each. Omitted, the answer must be no - not "assume yes".
        """
        assert not can_access_patient_record(CLINICIAN, "patient_1")


class TestAnalysisAccess:
    def test_the_subject_may_read_their_own(self):
        analysis = SimpleNamespace(id="a1", userId="patient_1", bookingId="bk_1")
        assert can_access_analysis(PATIENT, analysis)
        assert not can_access_analysis(OTHER_PATIENT, analysis)

    def test_a_clinician_needs_the_booking(self):
        analysis = SimpleNamespace(id="a1", userId="patient_1", bookingId="bk_1")
        assert can_access_analysis(CLINICIAN, analysis, booking(clinician_id="clin_1"))
        assert not can_access_analysis(
            CLINICIAN, analysis, booking(clinician_id="clin_2")
        )
        # No booking supplied and none attached: fail closed.
        assert not can_access_analysis(CLINICIAN, analysis)


class TestPrescribingRights:
    def test_only_staff_may_prescribe(self):
        """
        The DRAFT/ACTIVE boundary. A patient activating their own machine-generated plan
        would defeat the entire review step.
        """
        assert can_review_plan(CLINICIAN)
        assert can_review_plan(ADMIN)
        assert not can_review_plan(PATIENT)

        with pytest.raises(ForbiddenException):
            assert_can_review_plan(PATIENT)

    def test_only_staff_may_start_a_screening(self):
        assert can_start_screening(CLINICIAN)
        assert can_start_screening(ADMIN)
        assert not can_start_screening(PATIENT)


class TestResolveTargetPatient:
    def test_no_id_means_the_caller(self):
        assert resolve_target_patient_id(PATIENT, None) == "patient_1"

    def test_a_patient_may_name_only_themselves(self):
        assert resolve_target_patient_id(PATIENT, "patient_1") == "patient_1"
        with pytest.raises(ForbiddenException):
            resolve_target_patient_id(PATIENT, "patient_2")

    def test_staff_may_name_anybody(self):
        assert resolve_target_patient_id(ADMIN, "patient_2") == "patient_2"
        assert resolve_target_patient_id(CLINICIAN, "patient_2") == "patient_2"
