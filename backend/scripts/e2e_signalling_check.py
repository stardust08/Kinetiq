"""
Drives the real WebRTC signalling route end to end.

Two real WebSocket clients through the real FastAPI app, against a real database. What it
proves that the unit tests cannot:

  * the socket route authorises before accepting - no token, and a token belonging to
    somebody who is not a participant, are both refused;
  * the joining peer is told who to offer to, which is what stops both sides offering at
    once and leaving the call stuck;
  * an offer addressed to a peer reaches that peer and carries the sender's id;
  * a patient cannot send a staff-only control message over the socket;
  * participants and audit events are written, and marked as having left on disconnect.

Runs as a standalone script rather than a pytest test because starlette's TestClient owns
its own event loop, and a Prisma connection opened on pytest's loop cannot be used from
it. In its own process there is no other loop to collide with.

    DATABASE_URL=postgresql://... python scripts/e2e_signalling_check.py

Exits 0 on success, 1 on the first failed expectation.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

FAILURES: list[str] = []


def check(condition: bool, description: str) -> None:
    if condition:
        print(f"  ok   {description}")
    else:
        print(f"  FAIL {description}")
        FAILURES.append(description)


def main() -> int:
    if not os.getenv("DATABASE_URL"):
        print("DATABASE_URL is not set; refusing to guess.")
        return 1

    from fastapi.testclient import TestClient

    from app.core.config import settings
    from app.core.security import TokenService
    from app.db.client import db
    from app.main import app

    settings.SUPERVISED_SCREENING_REQUIRED = True

    run = uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc)

    # The lifespan connects the client on TestClient's own loop, which is the whole
    # reason this lives in its own process.
    with TestClient(app) as client:

        async def seed():
            clinician = await db.user.create(
                data={"phone": f"+9160{run}", "name": "Dr Socket", "role": "CLINICIAN"}
            )
            patient = await db.user.create(
                data={"phone": f"+9170{run}", "name": "Pat Socket", "role": "USER"}
            )
            outsider = await db.user.create(
                data={"phone": f"+9180{run}", "name": "Nosy", "role": "USER"}
            )
            category = await db.category.create(
                data={"name": "WS", "slug": f"ws-{run}", "status": "ACTIVE"}
            )
            service = await db.service.create(
                data={
                    "categoryId": category.id,
                    "name": "WS Service",
                    "slug": f"ws-svc-{run}",
                    "basePrice": 100.0,
                    "duration": "30 min",
                    "includedScreeningCount": 2,
                }
            )
            payment = await db.payment.create(
                data={
                    "userId": patient.id,
                    "totalAmount": 100.0,
                    "paidAmount": 100.0,
                    "remainingAmount": 0.0,
                    "status": "COMPLETED",
                }
            )
            booking = await db.booking.create(
                data={
                    "userId": patient.id,
                    "serviceId": service.id,
                    "paymentId": payment.id,
                    "clinicianId": clinician.id,
                    "totalAmount": 100.0,
                    "paidAmount": 100.0,
                    "remainingAmount": 0.0,
                    "time": now + timedelta(hours=1),
                    "status": "CONFIRMED",
                    "totalScreeningCount": 2,
                    "usedScreeningCount": 0,
                    "remainingScreeningCount": 2,
                }
            )
            return clinician, patient, outsider, booking

        # TestClient exposes its loop through the portal it already runs the app on.
        clinician, patient, outsider, booking = client.portal.call(seed)  # type: ignore[attr-defined]

        def auth(user):
            return {
                "Authorization": f"Bearer {TokenService.create_access_token(user.id, user.role)}"
            }

        created = client.post(
            "/api/video/sessions",
            headers=auth(clinician),
            json={"bookingId": booking.id},
        )
        check(created.status_code == 200, f"clinician opens consultation ({created.status_code})")
        if created.status_code != 200:
            print(created.text)
            return 1
        session_id = created.json()["data"]["id"]

        # Join over REST before unlocking anything. A consultation only becomes
        # WAITING/LIVE when somebody joins, and a screening cannot be unlocked on one
        # that is still merely SCHEDULED - opening the socket alone does not start the
        # appointment. The real client always calls join() before opening the socket.
        for user in (clinician, patient):
            joined = client.post(
                f"/api/video/sessions/{session_id}/join", headers=auth(user)
            )
            check(
                joined.status_code == 200,
                f"{user.name} joins the consultation ({joined.status_code})",
            )

        clinician_token = TokenService.create_access_token(clinician.id, clinician.role)
        patient_token = TokenService.create_access_token(patient.id, patient.role)
        outsider_token = TokenService.create_access_token(outsider.id, outsider.role)

        # ---- authorisation before accept ---------------------------------
        try:
            with client.websocket_connect(f"/api/video/ws/{session_id}"):
                check(False, "socket with no token is refused")
        except Exception:
            check(True, "socket with no token is refused")

        try:
            with client.websocket_connect(
                f"/api/video/ws/{session_id}?token=rubbish"
            ):
                check(False, "socket with an invalid token is refused")
        except Exception:
            check(True, "socket with an invalid token is refused")

        try:
            with client.websocket_connect(
                f"/api/video/ws/{session_id}?token={outsider_token}"
            ):
                check(False, "socket from a non-participant is refused")
        except Exception:
            check(True, "socket from a non-participant is refused")

        # ---- the mesh -----------------------------------------------------
        with client.websocket_connect(
            f"/api/video/ws/{session_id}?token={clinician_token}"
        ) as clinician_ws:
            state = clinician_ws.receive_json()
            check(state["type"] == "room-state", "first peer receives room-state")
            check(state["peers"] == [], "first peer sees an empty room")
            check(state["self"]["role"] == "CLINICIAN", "first peer's role is reported")
            clinician_connection = state["connectionId"]

            with client.websocket_connect(
                f"/api/video/ws/{session_id}?token={patient_token}"
            ) as patient_ws:
                patient_state = patient_ws.receive_json()
                check(
                    patient_state["type"] == "room-state",
                    "second peer receives room-state",
                )
                check(
                    patient_state["shouldOffer"] == [clinician_connection],
                    "the joining peer is told to offer to the peer already present",
                )

                joined = clinician_ws.receive_json()
                check(joined["type"] == "peer-joined", "the room is told somebody joined")
                patient_connection = joined["peer"]["connectionId"]
                check(joined["peer"]["role"] == "PATIENT", "the new peer's role is reported")

                # Offer relay, patient -> clinician.
                patient_ws.send_json(
                    {
                        "type": "offer",
                        "to": clinician_connection,
                        "payload": {"type": "offer", "sdp": "v=0 test-sdp"},
                    }
                )
                relayed = clinician_ws.receive_json()
                check(relayed["type"] == "offer", "an offer is relayed to the named peer")
                check(
                    relayed["from"] == patient_connection,
                    "the relayed offer carries the sender's connection id",
                )
                check(
                    relayed["payload"]["sdp"] == "v=0 test-sdp",
                    "the SDP survives the relay unchanged",
                )

                # Answer relay, clinician -> patient.
                clinician_ws.send_json(
                    {
                        "type": "answer",
                        "to": patient_connection,
                        "payload": {"type": "answer", "sdp": "v=0 answer-sdp"},
                    }
                )
                answered = patient_ws.receive_json()
                check(answered["type"] == "answer", "an answer is relayed back")

                # ICE candidate relay.
                patient_ws.send_json(
                    {
                        "type": "ice-candidate",
                        "to": clinician_connection,
                        "payload": {"candidate": "candidate:1 1 udp 1 1.2.3.4 1 typ host"},
                    }
                )
                candidate = clinician_ws.receive_json()
                check(
                    candidate["type"] == "ice-candidate",
                    "an ICE candidate is relayed",
                )

                # A relay addressed at nobody is reported rather than dropped silently.
                patient_ws.send_json(
                    {"type": "offer", "to": "does-not-exist", "payload": {}}
                )
                missing = patient_ws.receive_json()
                check(
                    missing["type"] == "peer-unavailable",
                    "an offer to a departed peer is reported back",
                )

                # A patient cannot send a staff-only control message.
                patient_ws.send_json({"type": "enable-screening"})
                forbidden = patient_ws.receive_json()
                check(
                    forbidden["type"] == "error" and forbidden["code"] == "forbidden",
                    "a patient cannot unlock a screening over the socket",
                )

                # Mute state reaches the other side.
                patient_ws.send_json(
                    {
                        "type": "media-state",
                        "payload": {"isAudioMuted": True, "isVideoMuted": False},
                    }
                )
                media = clinician_ws.receive_json()
                check(
                    media["type"] == "peer-media-state" and media["isAudioMuted"] is True,
                    "a mute is broadcast to the room",
                )

                # Chat reaches everybody, sender included.
                patient_ws.send_json({"type": "chat", "payload": {"text": "hello"}})
                check(
                    patient_ws.receive_json()["text"] == "hello",
                    "chat is echoed to the sender",
                )
                check(
                    clinician_ws.receive_json()["text"] == "hello",
                    "chat reaches the other peer",
                )

                # An unknown message type is refused, not forwarded.
                patient_ws.send_json({"type": "teleport"})
                unknown = patient_ws.receive_json()
                check(unknown["type"] == "error", "an unknown message type is refused")

                # Unlocking over REST is pushed down the socket to the patient, and the
                # token goes only to them.
                unlocked = client.post(
                    f"/api/video/sessions/{session_id}/enable-screening",
                    headers=auth(clinician),
                    json={"screeningType": "POSTURE"},
                )
                check(
                    unlocked.status_code == 200,
                    f"clinician unlocks a screening over REST ({unlocked.status_code})",
                )
                if unlocked.status_code != 200:
                    # Bail rather than block forever on a push that will never arrive.
                    print("   unlock failed:", unlocked.text)
                    return 1

                patient_messages = []
                for _ in range(2):
                    patient_messages.append(patient_ws.receive_json())
                types = {m["type"] for m in patient_messages}
                check(
                    "screening-authorisation" in types,
                    "the patient is told a screening was authorised",
                )
                check(
                    "screening-token" in types,
                    "the patient receives the one-shot token",
                )
                token = next(
                    m["token"] for m in patient_messages if m["type"] == "screening-token"
                )

                clinician_notice = clinician_ws.receive_json()
                check(
                    clinician_notice["type"] == "screening-authorisation",
                    "the clinician sees the authorisation too",
                )

                # And that token actually works against the capture endpoint.
                started = client.post(
                    "/api/posture/start-analysis",
                    headers=auth(patient),
                    json={"bookingId": booking.id, "screeningToken": token},
                )
                check(
                    started.status_code == 200,
                    f"the socket-delivered token starts a screening ({started.status_code})",
                )

        # ---- after both sockets close -------------------------------------
        async def inspect():
            participants = await db.videosessionparticipant.find_many(
                where={"sessionId": session_id}
            )
            events = await db.videosessionevent.find_many(where={"sessionId": session_id})
            return participants, events

        # Poll rather than read once.
        #
        # Closing the client socket does not wait for the server's handler to finish; its
        # `finally` block - which marks the participant as left and writes the audit row -
        # runs a moment later. Reading immediately is a race that fails about as often as
        # it passes, and would look like the cleanup never happening.
        import asyncio

        async def settle():
            for _ in range(40):
                participants, events = await inspect()
                if participants and all(p.leftAt is not None for p in participants):
                    return participants, events
                await asyncio.sleep(0.1)
            return await inspect()

        participants, events = client.portal.call(settle)  # type: ignore[attr-defined]
        check(len(participants) >= 2, f"both peers were recorded ({len(participants)})")
        check(
            all(p.leftAt is not None for p in participants),
            "every peer was marked as having left on disconnect",
        )
        event_types = {e.type for e in events}
        check("joined" in event_types, "joins are audited")
        check("left" in event_types, "leaves are audited")
        check("screening_enabled" in event_types, "the authorisation is audited")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("all signalling checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
