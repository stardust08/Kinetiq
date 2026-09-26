"""
End-to-end test of roles, consultations and exercise prescription.

Unlike the rest of the suite, this talks to a REAL Postgres and drives the REAL FastAPI
app through its HTTP routes. Nothing is faked: the authorisation dependencies run, the
Prisma client writes rows, the recommendation engine reads them back.

That is the point. The unit tests prove the logic; they cannot prove the routes are wired
to it, that a Prisma filter the unit tests stubbed out is actually valid SQL, or that the
screening gate is reached before the service it guards.

The WebSocket half of the API is covered by scripts/e2e_signalling_check.py, which needs
its own event loop - see test_20.

Skipped unless E2E_DATABASE_URL is set, and it must point at a DISPOSABLE database: the
first thing it does is delete every row. Run it with:

    docker run -d --name neura-e2e-pg -e POSTGRES_PASSWORD=neura \
        -e POSTGRES_USER=neura -e POSTGRES_DB=neura -p 55432:5432 postgres:16-alpine
    E2E=postgresql://neura:neura@localhost:55432/neura
    DATABASE_URL=$E2E python -m prisma migrate deploy
    DATABASE_URL=$E2E E2E_DATABASE_URL=$E2E \
        python -m pytest test_e2e_roles_consultations.py -v
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest

E2E_URL = os.getenv("E2E_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not E2E_URL,
    reason="E2E_DATABASE_URL is not set. This test deletes every row in the database it "
    "points at, so it never runs against the default DATABASE_URL.",
)

if E2E_URL:
    os.environ["DATABASE_URL"] = E2E_URL


def _now() -> datetime:
    return datetime.now(timezone.utc)


@pytest.fixture(autouse=True)
def _supervision_stays_on(unsupervised_screening_by_default):
    """
    Force the supervised-screening rule back ON for every test in this module.

    conftest.py installs a function-scoped autouse fixture that turns the rule OFF for
    the suite, because most of it predates supervision. That fixture runs for these tests
    too - and being function-scoped, it re-disabled the rule after the module fixture had
    enabled it, so the gate tests here quietly passed against an open gate.

    Declaring the conftest fixture as an argument is what orders this one after it. The
    dependency is the mechanism, not an accident; removing the parameter makes the
    ordering undefined and the rule may be off again.
    """
    from app.core.config import settings

    settings.SUPERVISED_SCREENING_REQUIRED = True
    yield


#: Cleared before the run, in dependency order so foreign keys do not block the delete.
_TABLES = (
    "exercisecompletion",
    "exerciseplanitem",
    "exerciseplan",
    "videosessionevent",
    "videosessionparticipant",
    "videosession",
    "romanalysis",
    "gaitframes",
    "gaitanalysis",
    "poselandmarks",
    "postureanalysis",
    "report",
    "slotlock",
    "booking",
    "payment",
    "cart",
    "subscription",
    "clinicianavailability",
    "cliniciantimeoff",
    "clinicianprofile",
)


@pytest.fixture(scope="module")
async def ctx():
    """
    A fresh world: an admin, two clinicians, a patient, an unrelated patient, a paid
    booking.

    Module-scoped because what is under test is a *sequence* - assign, open, unlock,
    capture, review, prescribe - where each step depends on the one before. Independent
    tests with their own fixtures would cover the steps and miss the flow.
    """
    import httpx

    from app.core.config import settings
    from app.core.security import TokenService
    from app.db.client import db
    from app.main import app

    if not db.is_connected():
        await db.connect()

    run = uuid.uuid4().hex[:8]

    for table in _TABLES:
        await getattr(db, table).delete_many()
    await db.service.delete_many()
    await db.category.delete_many()
    await db.exercise.delete_many()
    await db.user.delete_many()

    admin = await db.user.create(
        data={"phone": f"+9110{run}", "name": "Admin", "role": "ADMIN"}
    )
    clinician = await db.user.create(
        data={"phone": f"+9120{run}", "name": "Dr Reed", "role": "CLINICIAN"}
    )
    other_clinician = await db.user.create(
        data={"phone": f"+9130{run}", "name": "Dr Other", "role": "CLINICIAN"}
    )
    patient = await db.user.create(
        data={"phone": f"+9140{run}", "name": "Sam Patient", "role": "USER"}
    )
    stranger = await db.user.create(
        data={"phone": f"+9150{run}", "name": "Stranger", "role": "USER"}
    )

    category = await db.category.create(
        data={"name": "Physio", "slug": f"physio-{run}", "status": "ACTIVE"}
    )
    service = await db.service.create(
        data={
            "categoryId": category.id,
            "name": "ROM Assessment",
            "slug": f"rom-{run}",
            "basePrice": 500.0,
            "duration": "60 min",
            "includedScreeningCount": 3,
        }
    )
    payment = await db.payment.create(
        data={
            "userId": patient.id,
            "totalAmount": 500.0,
            "paidAmount": 500.0,
            "remainingAmount": 0.0,
            "status": "COMPLETED",
        }
    )
    booking = await db.booking.create(
        data={
            "userId": patient.id,
            "serviceId": service.id,
            "paymentId": payment.id,
            "totalAmount": 500.0,
            "paidAmount": 500.0,
            "remainingAmount": 0.0,
            "time": _now() + timedelta(hours=2),
            "status": "CONFIRMED",
            "totalScreeningCount": 3,
            "usedScreeningCount": 0,
            "remainingScreeningCount": 3,
        }
    )

    def auth(user):
        token = TokenService.create_access_token(user.id, user.role)
        return {"Authorization": f"Bearer {token}"}

    # Supervision is the rule under test. The suite-wide conftest fixture turns it off
    # for the tests that predate it, so it is forced back on here.
    settings.SUPERVISED_SCREENING_REQUIRED = True

    # httpx over an ASGI transport rather than starlette's TestClient.
    #
    # TestClient is synchronous and runs the app in its OWN event loop. Called from an
    # async test, the Prisma connection - which belongs to pytest-asyncio's loop - then
    # gets used from a different one, and every query fails with "Future attached to a
    # different loop". That surfaces as a 500 from the route rather than as an error
    # anybody can read. ASGITransport runs the app in the loop we are already in.
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://e2e.local"
    ) as client:
        yield {
            "client": client,
            "db": db,
            "admin": admin,
            "clinician": clinician,
            "other_clinician": other_clinician,
            "patient": patient,
            "stranger": stranger,
            "service": service,
            "booking": booking,
            "auth": auth,
            "state": {},
        }


# ---------------------------------------------------------------------------
# Roles and access
# ---------------------------------------------------------------------------


async def test_01_admin_stats_are_admin_only(ctx):
    client, auth = ctx["client"], ctx["auth"]

    ok = await client.get("/api/admin/stats", headers=auth(ctx["admin"]))
    assert ok.status_code == 200, ok.text
    stats = ok.json()["data"]
    assert stats["users"]["patients"] >= 1
    assert stats["users"]["clinicians"] >= 2

    # 403, not 401. A 401 makes the frontend's interceptor delete the token and sign a
    # legitimately signed-in user out.
    refused = await client.get("/api/admin/stats", headers=auth(ctx["patient"]))
    assert refused.status_code == 403, refused.text

    not_admin = await client.get("/api/admin/stats", headers=auth(ctx["clinician"]))
    assert not_admin.status_code == 403, not_admin.text


async def test_02_admin_creates_a_clinician_with_a_calendar(ctx):
    client, auth = ctx["client"], ctx["auth"]

    created = await client.post(
        "/api/admin/clinicians",
        headers=auth(ctx["admin"]),
        json={
            "name": "Dr Created",
            "phone": f"+9199{uuid.uuid4().hex[:8]}",
            "specialisation": "Sports rehabilitation",
            "slotDurationMinutes": 30,
        },
    )
    assert created.status_code == 200, created.text
    data = created.json()["data"]
    assert data["role"] == "CLINICIAN"
    assert data["roleLabel"] == "Clinician"
    # The profile is created alongside the account. Without it the clinician has no
    # calendar and cannot be booked - a failure that only shows up later, as an
    # unexplained empty availability list.
    assert data["clinicianProfile"]["specialisation"] == "Sports rehabilitation"

    blocked = await client.post(
        "/api/admin/clinicians",
        headers=auth(ctx["patient"]),
        json={"phone": "+910000000000"},
    )
    assert blocked.status_code == 403, blocked.text


async def test_03_admin_assigns_the_booking(ctx):
    client, auth = ctx["client"], ctx["auth"]

    queue = await client.get(
        "/api/admin/bookings",
        headers=auth(ctx["admin"]),
        params={"unassignedOnly": True},
    )
    assert queue.status_code == 200, queue.text
    assert any(b["id"] == ctx["booking"].id for b in queue.json()["data"]["bookings"])

    assigned = await client.patch(
        f"/api/admin/bookings/{ctx['booking'].id}/assign",
        headers=auth(ctx["admin"]),
        json={"clinicianId": ctx["clinician"].id},
    )
    assert assigned.status_code == 200, assigned.text

    after = await client.get(
        "/api/admin/bookings",
        headers=auth(ctx["admin"]),
        params={"unassignedOnly": True},
    )
    assert not any(
        b["id"] == ctx["booking"].id for b in after.json()["data"]["bookings"]
    )


async def test_04_a_clinician_sees_only_their_own_caseload(ctx):
    client, auth = ctx["client"], ctx["auth"]

    mine = await client.get(
        "/api/clinician/me/patients", headers=auth(ctx["clinician"])
    )
    assert mine.status_code == 200, mine.text
    assert [p["id"] for p in mine.json()["data"]] == [ctx["patient"].id]

    theirs = await client.get(
        "/api/clinician/me/patients", headers=auth(ctx["other_clinician"])
    )
    assert theirs.status_code == 200, theirs.text
    assert theirs.json()["data"] == []

    blocked = await client.get(
        f"/api/clinician/patients/{ctx['patient'].id}",
        headers=auth(ctx["other_clinician"]),
    )
    assert blocked.status_code == 404, blocked.text

    allowed = await client.get(
        f"/api/clinician/patients/{ctx['patient'].id}", headers=auth(ctx["clinician"])
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["data"]["patient"]["id"] == ctx["patient"].id


# ---------------------------------------------------------------------------
# Availability and slots
# ---------------------------------------------------------------------------


async def test_05_availability_decides_which_slots_exist(ctx):
    client, auth = ctx["client"], ctx["auth"]

    saved = await client.put(
        "/api/clinician/me/availability",
        headers=auth(ctx["clinician"]),
        json={"windows": [{"dayOfWeek": 1, "startMinute": 540, "endMinute": 720}]},
    )
    assert saved.status_code == 200, saved.text
    assert len(saved.json()["data"]["availability"]) == 1

    today = _now().date()
    tuesday = today + timedelta(days=((1 - today.weekday()) % 7) or 7)
    wednesday = tuesday + timedelta(days=1)

    on_tuesday = await client.get(
        f"/api/clinician/{ctx['clinician'].id}/slots",
        headers=auth(ctx["patient"]),
        params={"date": tuesday.isoformat(), "durationMinutes": 60},
    )
    assert on_tuesday.status_code == 200, on_tuesday.text
    times = [s["slotTime"][11:16] for s in on_tuesday.json()["data"]["slots"]]
    assert times == ["09:00", "10:00", "11:00"], times

    # Wednesday is not configured. Once a clinician has set any hours, the days they did
    # not set are closed - the platform default must not reopen them.
    on_wednesday = await client.get(
        f"/api/clinician/{ctx['clinician'].id}/slots",
        headers=auth(ctx["patient"]),
        params={"date": wednesday.isoformat(), "durationMinutes": 60},
    )
    assert on_wednesday.json()["data"]["slots"] == []

    overlapping = await client.put(
        "/api/clinician/me/availability",
        headers=auth(ctx["clinician"]),
        json={
            "windows": [
                {"dayOfWeek": 1, "startMinute": 540, "endMinute": 720},
                {"dayOfWeek": 1, "startMinute": 660, "endMinute": 780},
            ]
        },
    )
    assert overlapping.status_code == 400, overlapping.text
    assert "Tuesday" in overlapping.text

    # An admin has no calendar of their own to write to.
    wrong_role = await client.put(
        "/api/clinician/me/availability",
        headers=auth(ctx["admin"]),
        json={"windows": []},
    )
    assert wrong_role.status_code == 403, wrong_role.text


async def test_06_the_service_slot_endpoint_honours_the_clinician(ctx):
    client, auth = ctx["client"], ctx["auth"]

    today = _now().date()
    tuesday = today + timedelta(days=((1 - today.weekday()) % 7) or 7)

    scoped = await client.get(
        f"/api/slots/{ctx['service'].id}/available",
        params={"date": tuesday.isoformat(), "clinicianId": ctx["clinician"].id},
    )
    assert scoped.status_code == 200, scoped.text
    body = scoped.json()
    assert body["clinicianId"] == ctx["clinician"].id
    times = [s["slotTime"][11:16] for s in body["slots"]]
    assert times == ["09:00", "10:00", "11:00"], times

    # Unscoped keeps the previous service-wide behaviour, so existing clients that do
    # not pass a clinician are unaffected.
    unscoped = await client.get(
        f"/api/slots/{ctx['service'].id}/available",
        params={"date": tuesday.isoformat()},
    )
    assert unscoped.status_code == 200, unscoped.text
    assert len(unscoped.json()["slots"]) > 3


# ---------------------------------------------------------------------------
# The screening gate
# ---------------------------------------------------------------------------


async def test_07_a_patient_cannot_start_a_screening_alone(ctx):
    """The rule the whole feature exists for, on all three capture types."""
    client, auth = ctx["client"], ctx["auth"]

    for endpoint in (
        "/api/rom/start-analysis",
        "/api/posture/start-analysis",
        "/api/gait/start-analysis",
    ):
        refused = await client.post(
            endpoint,
            headers=auth(ctx["patient"]),
            json={"bookingId": ctx["booking"].id},
        )
        assert refused.status_code == 403, f"{endpoint}: {refused.text}"
        # The message has to tell them what to do, not only that they may not.
        assert "clinician" in refused.text.lower(), endpoint

    forged = await client.post(
        "/api/rom/start-analysis",
        headers=auth(ctx["patient"]),
        json={"bookingId": ctx["booking"].id, "screeningToken": "invented"},
    )
    assert forged.status_code == 403, forged.text


async def test_08_a_patient_cannot_open_a_consultation(ctx):
    client, auth = ctx["client"], ctx["auth"]

    refused = await client.post(
        "/api/video/sessions",
        headers=auth(ctx["patient"]),
        json={"bookingId": ctx["booking"].id},
    )
    assert refused.status_code == 403, refused.text

    # Before one exists the waiting room says "not yet" rather than erroring - that is
    # the normal state for most of the time the page is open.
    waiting = await client.get(
        f"/api/video/bookings/{ctx['booking'].id}/session",
        headers=auth(ctx["patient"]),
    )
    assert waiting.status_code == 200, waiting.text
    assert waiting.json()["data"] is None


async def test_09_clinician_opens_the_consultation_idempotently(ctx):
    client, auth = ctx["client"], ctx["auth"]

    first = await client.post(
        "/api/video/sessions",
        headers=auth(ctx["clinician"]),
        json={"bookingId": ctx["booking"].id},
    )
    assert first.status_code == 200, first.text
    session = first.json()["data"]
    assert session["status"] == "SCHEDULED"
    assert session["screening"]["enabled"] is False
    # The room name must not be derivable from the booking id, or anyone holding a
    # booking id could join the call.
    assert ctx["booking"].id not in session["roomName"]

    again = await client.post(
        "/api/video/sessions",
        headers=auth(ctx["clinician"]),
        json={"bookingId": ctx["booking"].id},
    )
    assert again.json()["data"]["id"] == session["id"], "a second room was created"

    unassigned_staff = await client.post(
        "/api/video/sessions",
        headers=auth(ctx["other_clinician"]),
        json={"bookingId": ctx["booking"].id},
    )
    assert unassigned_staff.status_code == 404, unassigned_staff.text

    ctx["state"]["session_id"] = session["id"]


async def test_10_joining_reports_role_and_permissions(ctx):
    client, auth = ctx["client"], ctx["auth"]
    session_id = ctx["state"]["session_id"]

    patient_join = await client.post(
        f"/api/video/sessions/{session_id}/join", headers=auth(ctx["patient"])
    )
    assert patient_join.status_code == 200, patient_join.text
    payload = patient_join.json()["data"]
    assert payload["session"]["status"] == "WAITING"
    assert payload["role"] == "PATIENT"
    assert payload["permissions"]["canStartScreening"] is False
    assert payload["permissions"]["canPerformScreening"] is True
    # The patient must never receive the clinician's private notes field.
    assert payload["session"]["clinicalNotes"] is None
    # Without ICE servers the browser cannot negotiate a connection at all.
    assert payload["iceServers"], "no ICE servers configured"

    schedule = await client.get(
        "/api/clinician/me/schedule", headers=auth(ctx["clinician"])
    )
    entry = next(e for e in schedule.json()["data"] if e["id"] == ctx["booking"].id)
    assert entry["consultation"]["patientWaiting"] is True

    staff_join = await client.post(
        f"/api/video/sessions/{session_id}/join", headers=auth(ctx["clinician"])
    )
    assert staff_join.status_code == 200, staff_join.text
    staff = staff_join.json()["data"]
    assert staff["session"]["status"] == "LIVE"
    assert staff["permissions"]["canStartScreening"] is True

    outsider = await client.post(
        f"/api/video/sessions/{session_id}/join", headers=auth(ctx["stranger"])
    )
    assert outsider.status_code == 404, outsider.text


async def test_11_unlocking_lets_the_patient_start_exactly_that_screening(ctx):
    client, auth, db = ctx["client"], ctx["auth"], ctx["db"]
    session_id = ctx["state"]["session_id"]

    self_unlock = await client.post(
        f"/api/video/sessions/{session_id}/enable-screening",
        headers=auth(ctx["patient"]),
        json={"screeningType": "ROM"},
    )
    assert self_unlock.status_code == 403, self_unlock.text

    unlocked = await client.post(
        f"/api/video/sessions/{session_id}/enable-screening",
        headers=auth(ctx["clinician"]),
        json={"screeningType": "ROM"},
    )
    assert unlocked.status_code == 200, unlocked.text
    result = unlocked.json()["data"]
    token = result["screeningToken"]
    assert token and result["screeningType"] == "ROM"

    # The token must not leak through the session payload the patient polls.
    as_patient = await client.get(
        f"/api/video/sessions/{session_id}", headers=auth(ctx["patient"])
    )
    assert "screeningToken" not in json.dumps(as_patient.json())
    assert as_patient.json()["data"]["screening"]["enabled"] is True

    # Unlocking ROM does not permit a posture capture: they cost the same credit and
    # produce different records, and the clinician chose which they were supervising.
    wrong_type = await client.post(
        "/api/posture/start-analysis",
        headers=auth(ctx["patient"]),
        json={"bookingId": ctx["booking"].id, "screeningToken": token},
    )
    assert wrong_type.status_code == 403, wrong_type.text
    assert "rom" in wrong_type.text.lower()

    started = await client.post(
        "/api/rom/start-analysis",
        headers=auth(ctx["patient"]),
        json={"bookingId": ctx["booking"].id, "screeningToken": token},
    )
    assert started.status_code == 200, started.text
    data = started.json()["data"]
    assert data["sessionId"]
    assert data["supervision"]["supervised"] is True
    assert data["supervision"]["supervisingClinicianId"] == ctx["clinician"].id
    assert len(data["movements"]) == 10

    # Starting spends no credit. Only a stored analysis does.
    booking = await db.booking.find_unique(where={"id": ctx["booking"].id})
    assert booking.remainingScreeningCount == 3

    ctx["state"]["token"] = token


async def test_12_revoking_stops_the_patient_immediately(ctx):
    client, auth = ctx["client"], ctx["auth"]
    session_id = ctx["state"]["session_id"]

    revoked = await client.post(
        f"/api/video/sessions/{session_id}/revoke-screening",
        headers=auth(ctx["clinician"]),
    )
    assert revoked.status_code == 200, revoked.text

    refused = await client.post(
        "/api/rom/start-analysis",
        headers=auth(ctx["patient"]),
        json={"bookingId": ctx["booking"].id, "screeningToken": ctx["state"]["token"]},
    )
    assert refused.status_code == 403, refused.text

    again = await client.post(
        f"/api/video/sessions/{session_id}/enable-screening",
        headers=auth(ctx["clinician"]),
        json={"screeningType": "ROM"},
    )
    assert again.status_code == 200, again.text
    ctx["state"]["token"] = again.json()["data"]["screeningToken"]


async def test_13_staff_start_a_screening_without_a_token(ctx):
    """Staff are authorised by role; the token is the patient's route in, not theirs."""
    client, auth = ctx["client"], ctx["auth"]

    started = await client.post(
        "/api/rom/start-analysis",
        headers=auth(ctx["clinician"]),
        json={"bookingId": ctx["booking"].id},
    )
    assert started.status_code == 200, started.text
    supervision = started.json()["data"]["supervision"]
    # The analysis belongs to the patient even though the clinician pressed start.
    assert supervision["patientId"] == ctx["patient"].id
    assert supervision["operatorId"] == ctx["clinician"].id

    blocked = await client.post(
        "/api/rom/start-analysis",
        headers=auth(ctx["other_clinician"]),
        json={"bookingId": ctx["booking"].id},
    )
    assert blocked.status_code == 401, blocked.text


# ---------------------------------------------------------------------------
# Prescription
# ---------------------------------------------------------------------------


async def test_14_the_engine_turns_a_screening_into_a_draft_plan(ctx):
    """
    A stored ROM analysis, run through the real engine over HTTP.

    The payload is the shape rom_v2 writes: a marked right shoulder restriction, a
    moderate left knee restriction, one metric that could not be measured, and one
    finding inside measurement noise. The last two must prescribe nothing.
    """
    client, auth, db = ctx["client"], ctx["auth"], ctx["db"]
    from prisma import Json

    metrics = {
        "metrics": {
            "rom_shoulder_flexion_right": {
                "clinicalName": "Shoulder flexion (right)",
                "value": 118.0,
                "unit": "degrees",
                "status": "measured",
                "normalRange": [165.0, 180.0],
            },
            "rom_shoulder_flexion_left": {
                "clinicalName": "Shoulder flexion (left)",
                "value": 172.0,
                "unit": "degrees",
                "status": "measured",
                "normalRange": [165.0, 180.0],
            },
            "rom_knee_flexion_left": {
                "clinicalName": "Knee flexion (left)",
                "value": 101.0,
                "unit": "degrees",
                "status": "measured",
                "normalRange": [130.0, 145.0],
            },
            # Could not be measured. Must never become a finding - a missing side view
            # is not a healthy hip.
            "rom_hip_flexion_right": {
                "clinicalName": "Hip flexion (right)",
                "value": 60.0,
                "unit": "degrees",
                "status": "insufficient_data",
                "normalRange": [90.0, 125.0],
            },
            # Half a degree short of a 45-degree floor, inside this metric's 0.987
            # MDC95: reported to the clinician, never prescribed against.
            "rom_cervical_lateral_flexion": {
                "clinicalName": "Cervical lateral flexion",
                "value": 44.5,
                "unit": "degrees",
                "status": "measured",
                "normalRange": [-45.0, 45.0],
            },
        }
    }

    analysis = await db.romanalysis.create(
        data={
            "userId": ctx["patient"].id,
            "bookingId": ctx["booking"].id,
            "metricsJson": Json(metrics),
            "capturedMovements": "shoulder_flexion_right,knee_flexion_left",
            "totalFrames": 240,
            "status": "completed",
        }
    )
    ctx["state"]["analysis_id"] = analysis.id

    # The catalogue must be seeded or a plan has no exercise rows to point at.
    synced = await client.post(
        "/api/exercises/catalogue/sync", headers=auth(ctx["admin"])
    )
    assert synced.status_code == 200, synced.text
    assert synced.json()["data"]["created"] >= 40

    suggestions = await client.get(
        f"/api/exercises/suggestions/ROM/{analysis.id}", headers=auth(ctx["patient"])
    )
    assert suggestions.status_code == 200, suggestions.text
    outcome = suggestions.json()["data"]

    keys = {f["metricKey"] for f in outcome["findings"]}
    assert "rom_hip_flexion_right" not in keys, "an unmeasured metric became a finding"
    assert "rom_shoulder_flexion_left" not in keys, "a healthy metric became a finding"
    assert "rom_shoulder_flexion_right" in keys

    borderline = next(
        f for f in outcome["findings"] if f["metricKey"] == "rom_cervical_lateral_flexion"
    )
    assert borderline["actionable"] is False
    assert borderline["severity"] == "borderline"

    slugs = {p["exerciseSlug"] for p in outcome["prescriptions"]}
    assert "shoulder-flexion-wand-aarom" in slugs
    assert "heel-slide-knee-flexion" in slugs
    assert "cervical-lateral-flexion-aarom" not in slugs, "prescribed off noise"

    for prescription in outcome["prescriptions"]:
        assert prescription["exercise"] is not None, prescription["exerciseSlug"]
        assert prescription["exercise"]["instructions"], prescription["exerciseSlug"]
        assert prescription["reason"].strip()

    drafted = await client.post(
        f"/api/exercises/suggestions/ROM/{analysis.id}/regenerate",
        headers=auth(ctx["clinician"]),
    )
    assert drafted.status_code == 200, drafted.text
    plan = drafted.json()["data"]
    assert plan["status"] == "DRAFT"
    assert len(plan["items"]) > 0
    ctx["state"]["plan_id"] = plan["id"]


async def test_15_a_draft_is_invisible_to_the_patient(ctx):
    client, auth = ctx["client"], ctx["auth"]
    plan_id = ctx["state"]["plan_id"]

    listed = await client.get("/api/exercises/plans", headers=auth(ctx["patient"]))
    assert listed.status_code == 200, listed.text
    assert listed.json()["data"] == [], "a patient was shown an unreviewed draft"

    direct = await client.get(
        f"/api/exercises/plans/{plan_id}", headers=auth(ctx["patient"])
    )
    assert direct.status_code == 404, direct.text

    activate = await client.post(
        f"/api/exercises/plans/{plan_id}/activate",
        headers=auth(ctx["patient"]),
        json={},
    )
    assert activate.status_code == 403, activate.text

    edit = await client.patch(
        f"/api/exercises/plans/{plan_id}",
        headers=auth(ctx["patient"]),
        json={"title": "mine now"},
    )
    assert edit.status_code == 403, edit.text

    # The clinician sees it, because reviewing it is their job.
    queue = await client.get(
        "/api/clinician/me/review-queue", headers=auth(ctx["clinician"])
    )
    assert queue.status_code == 200, queue.text
    assert any(entry["id"] == plan_id for entry in queue.json()["data"])


async def test_16_clinician_edits_and_prescribes(ctx):
    client, auth = ctx["client"], ctx["auth"]
    plan_id = ctx["state"]["plan_id"]

    loaded = await client.get(
        f"/api/exercises/plans/{plan_id}", headers=auth(ctx["clinician"])
    )
    plan = loaded.json()["data"]
    assert len(plan["items"]) >= 2

    struck = await client.delete(
        f"/api/exercises/plans/{plan_id}/items/{plan['items'][0]['id']}",
        headers=auth(ctx["clinician"]),
    )
    assert struck.status_code == 200, struck.text

    adjusted = await client.patch(
        f"/api/exercises/plans/{plan_id}/items/{plan['items'][1]['id']}",
        headers=auth(ctx["clinician"]),
        json={"sets": 4, "frequencyPerWeek": 6},
    )
    assert adjusted.status_code == 200, adjusted.text

    added = await client.post(
        f"/api/exercises/plans/{plan_id}/items",
        headers=auth(ctx["clinician"]),
        json={
            "exerciseSlug": "postural-awareness-breaks",
            "clinicianNote": "Desk worker.",
        },
    )
    assert added.status_code == 200, added.text

    prescribed = await client.post(
        f"/api/exercises/plans/{plan_id}/activate",
        headers=auth(ctx["clinician"]),
        json={"clinicianNotes": "Start gently; stop if the shoulder hurts."},
    )
    assert prescribed.status_code == 200, prescribed.text
    active = prescribed.json()["data"]
    assert active["status"] == "ACTIVE"
    assert active["reviewedBy"]["id"] == ctx["clinician"].id
    assert active["activatedAt"]


async def test_17_the_patient_now_sees_it_and_can_log_a_session(ctx):
    client, auth = ctx["client"], ctx["auth"]
    plan_id = ctx["state"]["plan_id"]

    listed = await client.get("/api/exercises/plans", headers=auth(ctx["patient"]))
    assert listed.status_code == 200, listed.text
    visible = listed.json()["data"]
    assert len(visible) == 1
    plan = visible[0]
    assert plan["id"] == plan_id
    assert plan["clinicianNotes"] == "Start gently; stop if the shoulder hurts."

    # The struck-off exercise is hidden from the patient and kept for the clinician.
    assert all(item["isRemoved"] is False for item in plan["items"])
    staff_view = await client.get(
        f"/api/exercises/plans/{plan_id}", headers=auth(ctx["clinician"])
    )
    assert any(item["isRemoved"] for item in staff_view.json()["data"]["items"])

    # Borderline findings go to the clinician, not the patient.
    patient_findings = {f["metricKey"] for f in (plan["findings"] or [])}
    staff_findings = {
        f["metricKey"] for f in (staff_view.json()["data"]["findings"] or [])
    }
    assert "rom_cervical_lateral_flexion" not in patient_findings
    assert "rom_cervical_lateral_flexion" in staff_findings

    item_id = plan["items"][0]["id"]
    logged = await client.post(
        f"/api/exercises/plan-items/{item_id}/complete",
        headers=auth(ctx["patient"]),
        json={"setsDone": 3, "repsDone": 10, "painScore": 2, "difficultyRating": 3},
    )
    assert logged.status_code == 200, logged.text

    out_of_range = await client.post(
        f"/api/exercises/plan-items/{item_id}/complete",
        headers=auth(ctx["patient"]),
        json={"painScore": 99},
    )
    assert out_of_range.status_code in (400, 422), out_of_range.text

    adherence = await client.get(
        f"/api/exercises/plans/{plan_id}/adherence", headers=auth(ctx["patient"])
    )
    assert adherence.status_code == 200, adherence.text
    summary = adherence.json()["data"]
    assert summary["totalCompleted"] == 1
    assert summary["totalExpected"] >= 1
    assert 0 <= summary["overallAdherencePercent"] <= 100

    stranger_view = await client.get(
        f"/api/exercises/plans/{plan_id}", headers=auth(ctx["stranger"])
    )
    assert stranger_view.status_code == 404, stranger_view.text

    stranger_log = await client.post(
        f"/api/exercises/plan-items/{item_id}/complete",
        headers=auth(ctx["stranger"]),
        json={"setsDone": 1},
    )
    assert stranger_log.status_code == 404, stranger_log.text


async def test_18_ending_the_consultation_clears_the_authorisation(ctx):
    client, auth = ctx["client"], ctx["auth"]
    session_id = ctx["state"]["session_id"]

    # A patient cannot end it: a dropped connection must not finish an appointment.
    refused = await client.post(
        f"/api/video/sessions/{session_id}/end",
        headers=auth(ctx["patient"]),
        json={},
    )
    assert refused.status_code == 403, refused.text

    ended = await client.post(
        f"/api/video/sessions/{session_id}/end",
        headers=auth(ctx["clinician"]),
        json={"clinicalNotes": "Reviewed shoulder range; programme issued."},
    )
    assert ended.status_code == 200, ended.text
    session = ended.json()["data"]
    assert session["status"] == "ENDED"
    # No live authorisation may survive a closed consultation.
    assert session["screening"]["enabled"] is False

    stale = await client.post(
        "/api/rom/start-analysis",
        headers=auth(ctx["patient"]),
        json={"bookingId": ctx["booking"].id, "screeningToken": ctx["state"]["token"]},
    )
    assert stale.status_code == 403, stale.text

    events = await client.get(
        f"/api/video/sessions/{session_id}/events", headers=auth(ctx["clinician"])
    )
    assert events.status_code == 200, events.text
    types = {e["type"] for e in events.json()["data"]}
    assert "session_created" in types
    assert "screening_enabled" in types
    assert "screening_revoked" in types
    assert "ended" in types


async def test_19_clinician_books_a_follow_up_for_the_patient(ctx):
    client, auth = ctx["client"], ctx["auth"]

    today = _now().date()
    tuesday = today + timedelta(days=((1 - today.weekday()) % 7) or 7)
    slot = datetime(tuesday.year, tuesday.month, tuesday.day, 10, tzinfo=timezone.utc)

    booked = await client.post(
        "/api/clinician/bookings",
        headers=auth(ctx["clinician"]),
        json={
            "patientId": ctx["patient"].id,
            "serviceId": ctx["service"].id,
            "slotTime": slot.isoformat(),
            "description": "Four-week review",
        },
    )
    assert booked.status_code == 200, booked.text
    booking = booked.json()["data"]
    # CONFIRMED, not PENDING: a clinician putting an appointment in their own calendar
    # has already confirmed it, and PENDING would block the screening it exists for.
    assert booking["status"] == "CONFIRMED"
    assert booking["clinicianId"] == ctx["clinician"].id
    assert booking["remainingScreeningCount"] == 3

    clash = await client.post(
        "/api/clinician/bookings",
        headers=auth(ctx["clinician"]),
        json={
            "patientId": ctx["patient"].id,
            "serviceId": ctx["service"].id,
            "slotTime": slot.isoformat(),
        },
    )
    assert clash.status_code == 409, clash.text

    blocked = await client.post(
        "/api/clinician/bookings",
        headers=auth(ctx["patient"]),
        json={
            "patientId": ctx["patient"].id,
            "serviceId": ctx["service"].id,
            "slotTime": (slot + timedelta(hours=1)).isoformat(),
        },
    )
    assert blocked.status_code == 403, blocked.text


def test_20_the_signalling_socket_works_end_to_end():
    """
    Drives the real WebSocket route in a separate process.

    It has to be a separate process: starlette's TestClient runs the app in its own event
    loop, and the Prisma connection this module opened belongs to pytest-asyncio's.
    Sharing them produces "Future attached to a different loop" from inside the route,
    which surfaces as a 500 and reads like a bug in the handler.
    """
    script = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "scripts", "e2e_signalling_check.py"
    )
    assert os.path.exists(script), script

    result = subprocess.run(
        [sys.executable, script],
        capture_output=True,
        text=True,
        timeout=240,
        env={**os.environ, "DATABASE_URL": E2E_URL or ""},
        cwd=os.path.dirname(os.path.abspath(__file__)),
    )
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr[-4000:])
    assert result.returncode == 0, "signalling check failed; output above"
