"""
Video consultation endpoints.

REST for the lifecycle, one WebSocket for signalling. The split matters: anything that
changes what a participant is *allowed* to do goes through REST, where it is
authorised against the database and written to the audit trail, and the socket only
learns about it afterwards. The socket carries negotiation and presence, which are
worthless to forge.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status

from app.api.video import signaling
from app.api.video.schemas import (
    CreateSessionRequest,
    EnableScreeningRequest,
    EndSessionRequest,
    SaveNotesRequest,
)
from app.api.video.service import VideoSessionService
from app.core.dependencies import get_current_active_user, get_current_staff
from app.core.exceptions import AppException
from app.core.roles import is_admin, is_clinician
from app.core.security import TokenService
from app.db.client import db

logger = logging.getLogger(__name__)

video_router = APIRouter(prefix="/video", tags=["video"])


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------


@video_router.post("/sessions", response_model=dict)
async def create_session(
    request: CreateSessionRequest, user=Depends(get_current_staff)
):
    """
    Open the consultation for a booking. Clinician or admin only.

    A patient never creates one. That is the product rule - an appointment starts when
    the clinician is ready for it - and it is also what makes the waiting room work:
    the patient polls for a session and waits until one appears.
    """
    session = await VideoSessionService.create_for_booking(
        user, request.bookingId, scheduled_at=request.scheduledAt
    )
    return {"data": VideoSessionService.serialise(session, viewer=user)}


@video_router.get("/sessions", response_model=dict)
async def list_sessions(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = 50,
    offset: int = 0,
    user=Depends(get_current_active_user),
):
    """Consultations this caller is party to. Scoped by role in authz.py."""
    sessions = await VideoSessionService.list_for_user(
        user, status=status_filter, limit=limit, offset=offset
    )
    return {
        "data": [VideoSessionService.serialise(s, viewer=user) for s in sessions]
    }


@video_router.get("/sessions/{session_id}", response_model=dict)
async def get_session(session_id: str, user=Depends(get_current_active_user)):
    session = await VideoSessionService.get_for_user(user, session_id)
    return {"data": VideoSessionService.serialise(session, viewer=user)}


@video_router.get("/bookings/{booking_id}/session", response_model=dict)
async def get_session_for_booking(
    booking_id: str, user=Depends(get_current_active_user)
):
    """
    The open consultation for a booking, or null.

    This is the patient's waiting room. Returning null rather than 404 is deliberate:
    "no call yet" is the expected answer for most of the time a patient has this page
    open, and a 404 would have the frontend's error interceptor treat normal waiting as
    a failure.
    """
    session = await VideoSessionService.get_active_for_booking(user, booking_id)
    return {
        "data": (
            VideoSessionService.serialise(session, viewer=user) if session else None
        )
    }


@video_router.post("/sessions/{session_id}/join", response_model=dict)
async def join_session(session_id: str, user=Depends(get_current_active_user)):
    """
    Enter the room: ICE configuration, permissions, current screening authorisation.

    Also the moment a session moves from SCHEDULED to WAITING (patient arrived first)
    or LIVE (staff arrived), which is what drives the clinician dashboard's
    "patient waiting" state.
    """
    result = await VideoSessionService.join(user, session_id)
    return {"data": result}


@video_router.post("/sessions/{session_id}/end", response_model=dict)
async def end_session(
    session_id: str,
    request: EndSessionRequest,
    user=Depends(get_current_staff),
):
    session = await VideoSessionService.end(
        user, session_id, notes=request.clinicalNotes
    )
    await signaling.notify_session_ended(session_id, ended_by=user.id)
    return {"data": VideoSessionService.serialise(session, viewer=user)}


@video_router.patch("/sessions/{session_id}/notes", response_model=dict)
async def save_notes(
    session_id: str, request: SaveNotesRequest, user=Depends(get_current_staff)
):
    session = await VideoSessionService.save_notes(
        user, session_id, request.clinicalNotes
    )
    return {"data": VideoSessionService.serialise(session, viewer=user)}


@video_router.get("/sessions/{session_id}/events", response_model=dict)
async def get_session_events(session_id: str, user=Depends(get_current_active_user)):
    """The consultation's audit trail: who joined, who authorised what, when."""
    events = await VideoSessionService.list_events(user, session_id)
    return {
        "data": [
            {
                "id": e.id,
                "type": e.type,
                "userId": e.userId,
                "payload": e.payload,
                "createdAt": e.createdAt,
            }
            for e in events
        ]
    }


# ---------------------------------------------------------------------------
# The screening gate
# ---------------------------------------------------------------------------


@video_router.post("/sessions/{session_id}/enable-screening", response_model=dict)
async def enable_screening(
    session_id: str,
    request: EnableScreeningRequest,
    user=Depends(get_current_staff),
):
    """
    Authorise the patient in this consultation to perform one screening.

    The single most important endpoint in this module. `get_current_staff` is the role
    half of the rule; VideoSessionService.enable_screening enforces the rest (the
    consultation must be running, the booking must have a screening left) and mints a
    one-shot token. The patient's browser receives that token over the socket and hands
    it to /start-analysis, where app/core/screening_gate.py checks it again.
    """
    result = await VideoSessionService.enable_screening(
        user, session_id, request.screeningType
    )
    session_payload = result["session"]

    await signaling.notify_screening_state(
        session_id,
        enabled=True,
        screening_type=result["screeningType"],
        enabled_by=user.id,
        token=result["screeningToken"],
        # Only the patient this consultation belongs to receives the token.
        token_for_user_id=(session_payload.get("patient") or {}).get("id"),
    )
    return {"data": result}


@video_router.post("/sessions/{session_id}/revoke-screening", response_model=dict)
async def revoke_screening(session_id: str, user=Depends(get_current_staff)):
    session = await VideoSessionService.revoke_screening(user, session_id)
    await signaling.notify_screening_state(
        session_id, enabled=False, screening_type=None, enabled_by=user.id
    )
    return {"data": VideoSessionService.serialise(session, viewer=user)}


# ---------------------------------------------------------------------------
# Signalling socket
# ---------------------------------------------------------------------------


async def _authenticate_socket(token: str):
    """
    Resolve a WebSocket's bearer token to a user.

    The token arrives as a query parameter because the browser WebSocket API cannot set
    an Authorization header. That is a real weakness - query strings land in access logs
    - and it is mitigated the only way it can be: these are the same short-lived JWTs
    the REST API uses, and the room name they grant access to is itself unguessable.
    A production deployment should issue a separate, single-use socket ticket here.
    """
    payload = TokenService.verify_token(token)
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = await db.user.find_unique(where={"id": user_id})
    if user is None or user.status != "ACTIVE":
        return None
    return user


@video_router.websocket("/ws/{session_id}")
async def signalling_socket(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(..., description="JWT access token"),
):
    """
    The signalling channel for one consultation.

    Protocol, client to server:
      {"type":"offer"|"answer"|"ice-candidate","to":"<connectionId>","payload":{...}}
      {"type":"media-state","payload":{"isAudioMuted":bool,"isVideoMuted":bool}}
      {"type":"chat","payload":{"text":"..."}}
      {"type":"screen-share","payload":{"isSharing":bool}}
      {"type":"screening-started"|"screening-progress"|"screening-finished","payload":{...}}
      {"type":"ping"}

    Server to client:
      {"type":"room-state","self":{...},"peers":[...],"shouldOffer":[...],"chat":[...]}
      {"type":"peer-joined"|"peer-left"|"peer-media-state"|"peer-screen-share",...}
      {"type":"offer"|"answer"|"ice-candidate","from":"<connectionId>","payload":{...}}
      {"type":"screening-authorisation","enabled":bool,"screeningType":"..."}
      {"type":"screening-token","token":"..."}   <- to the authorised patient only
      {"type":"session-ended"} {"type":"error","code":"...","message":"..."}

    Authorisation happens once, here, before the socket is accepted: membership of the
    consultation is checked against the same scope filter the REST endpoints use. After
    that the peer is trusted to relay to peers in its own room and nowhere else -
    `to` is resolved within this room only, so a connection id from another
    consultation resolves to nothing.
    """
    try:
        user = await _authenticate_socket(token)
    except Exception:
        user = None

    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorised")
        return

    try:
        session = await VideoSessionService.get_for_user(user, session_id)
    except AppException:
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION, reason="Not a participant"
        )
        return

    if session.status in ("ENDED", "CANCELLED"):
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION, reason="Consultation has ended"
        )
        return

    await websocket.accept()

    connection_id = secrets.token_hex(8)
    role = "ADMIN" if is_admin(user) else "CLINICIAN" if is_clinician(user) else "PATIENT"
    peer = signaling.Peer(
        connection_id=connection_id,
        user_id=user.id,
        user_name=user.name or "Participant",
        role=role,
        websocket=websocket,
    )

    existing = await signaling.registry.join(session_id, peer)
    await VideoSessionService.register_participant(session_id, user, connection_id)
    await VideoSessionService.record_event(
        session_id, user.id, "joined", {"role": role, "connectionId": connection_id}
    )
    await signaling.announce_join(session_id, peer, existing)

    async def _on_control(msg_type: str, payload):
        await VideoSessionService.record_event(session_id, user.id, msg_type, payload)

    async def _cleanup() -> None:
        """
        Remove the peer from the room and close out its records.

        Every step is an await, which is the whole problem this function exists to solve -
        see the shield below.
        """
        await signaling.registry.leave(session_id, connection_id)
        await signaling.announce_leave(session_id, peer)
        await VideoSessionService.mark_participant_left(session_id, connection_id)
        await VideoSessionService.record_event(
            session_id, user.id, "left", {"connectionId": connection_id}
        )

    try:
        while True:
            raw = await websocket.receive_text()
            await signaling.handle_message(
                session_id, peer, raw, on_control=_on_control
            )
    except WebSocketDisconnect:
        pass
    except Exception:  # pragma: no cover - defensive; a socket error must still clean up
        logger.exception("signalling socket failed for session %s", session_id)
    finally:
        # Cleanup has to survive CANCELLATION, not just a clean disconnect.
        #
        # A plain `await` in a `finally` is skipped when the task is being cancelled - the
        # first await re-raises CancelledError immediately and nothing after it runs. That
        # is not a rare path: it is what happens when a client aborts, when a connection
        # dies without a close frame, and on server shutdown. The symptom was a peer left
        # in the room forever, which every other participant keeps trying to send offers
        # to, plus a participant row never marked as having left.
        #
        # Shielding lets the cleanup run to completion as its own task even though this
        # one is going away. The CancelledError still propagates here, as it must - a
        # cancelled task has to end - so it is caught and dropped after the shield has
        # taken ownership of the work.
        cleanup = asyncio.ensure_future(_cleanup())
        try:
            await asyncio.shield(cleanup)
        except asyncio.CancelledError:
            # The shielded task keeps running; we are simply not allowed to wait for it.
            pass
        except Exception:  # pragma: no cover
            logger.exception("signalling cleanup failed for session %s", session_id)
