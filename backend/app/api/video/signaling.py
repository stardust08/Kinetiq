"""
WebRTC signalling: the smallest server that lets two browsers find each other.

The video and audio of a consultation never reach this process. Two browsers cannot
begin talking directly without first exchanging a session description and a list of
candidate network paths, and they have no way to reach each other to do it - that
bootstrap is all this module does. Once the peers connect, every frame travels between
them (or via TURN), and the backend goes quiet for the rest of the call.

That is worth stating plainly because it decides what this file must get right. It is
not a media server, so it does not need to scale with video; it is an authorisation
boundary, so it does need to get every message's sender and recipient right.

**Topology.** Full mesh. A consultation is a patient, a clinician, and occasionally a
supervising admin or an observer - three or four peers, where mesh is simplest and best.
It does not survive a dozen participants, and it is not meant to: an SFU is the answer
to that question and this is not an SFU.

**What the server enforces, as opposed to relays.** Offers, answers and ICE candidates
are opaque and simply forwarded to the named peer. Control messages are not: a
`start-screening` arriving from a patient's socket is rejected here rather than
forwarded, because the authorisation to begin a capture is exactly the thing this
product must not let the client decide. The same check exists on the REST endpoint; a
patient who never opens the WebSocket still cannot start one.

**Lifetime.** Rooms live in this process's memory. A multi-process deployment needs a
Redis pub/sub fan-out behind `_Hub.broadcast` - the interface is shaped for it, and the
single-process assumption is stated in `RoomRegistry` rather than left to be discovered.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)

#: Message types a client may send that the server simply forwards to one other peer.
#: Deliberately a closed set: an unknown type is dropped rather than broadcast, so a
#: client cannot invent a message that reaches other participants unexamined.
RELAY_TYPES = frozenset({"offer", "answer", "ice-candidate", "renegotiate"})

#: Message types the server acts on rather than forwarding verbatim.
CONTROL_TYPES = frozenset(
    {
        "media-state",       # camera/mic toggled
        "chat",              # text message to the room
        "screen-share",      # started/stopped sharing
        "screening-started", # patient's capture began
        "screening-progress",# pose N of 4 captured
        "screening-finished",# capture complete, analysis id attached
        "leave",
        "ping",
    }
)

#: Control messages only staff may send. Enforced server-side; the UI hides the
#: buttons, but hiding a button is not a permission.
STAFF_ONLY_TYPES = frozenset({"enable-screening", "revoke-screening", "end-session"})

MAX_CHAT_LENGTH = 2000


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Peer:
    """One browser tab in one room."""

    connection_id: str
    user_id: str
    user_name: str
    role: str  # PATIENT | CLINICIAN | ADMIN | OBSERVER
    websocket: WebSocket
    is_audio_muted: bool = False
    is_video_muted: bool = False
    joined_at: str = field(default_factory=_now_iso)

    @property
    def is_staff(self) -> bool:
        return self.role in ("CLINICIAN", "ADMIN")

    def describe(self) -> Dict[str, Any]:
        return {
            "connectionId": self.connection_id,
            "userId": self.user_id,
            "userName": self.user_name,
            "role": self.role,
            "isAudioMuted": self.is_audio_muted,
            "isVideoMuted": self.is_video_muted,
            "joinedAt": self.joined_at,
        }


@dataclass
class Room:
    """The peers currently in one consultation."""

    session_id: str
    peers: Dict[str, Peer] = field(default_factory=dict)
    #: Bounded ring of recent chat, so a peer joining late sees the conversation so far.
    #: Not persisted: consultation chat is working talk, and keeping it would make it a
    #: medical record nobody agreed to create. Clinical notes are a separate, explicit
    #: field on the session.
    chat: List[Dict[str, Any]] = field(default_factory=list)

    def staff_present(self) -> bool:
        return any(p.is_staff for p in self.peers.values())


class RoomRegistry:
    """
    Every live room in this process.

    Single-process by design, and that is the constraint to know about before scaling
    horizontally: two workers each hold their own registry, so a patient landing on
    worker A and a clinician on worker B would each sit alone in a room of the same
    name. Sticky sessions on the WebSocket route solve it for two workers; a Redis
    pub/sub behind `broadcast` solves it properly.
    """

    def __init__(self) -> None:
        self._rooms: Dict[str, Room] = {}
        self._lock = asyncio.Lock()

    # -- membership ------------------------------------------------------

    async def join(self, session_id: str, peer: Peer) -> List[Peer]:
        """
        Add a peer and return everybody already present.

        The returned list is what drives the mesh: the joining peer sends an offer to
        each existing peer, and existing peers wait for it. Deciding who offers by
        arrival order - rather than both sides offering - is what avoids the glare
        condition where two peers send offers simultaneously and both connections stall.
        """
        async with self._lock:
            room = self._rooms.setdefault(session_id, Room(session_id=session_id))
            existing = [p for p in room.peers.values() if p.connection_id != peer.connection_id]
            room.peers[peer.connection_id] = peer
            return existing

    async def leave(self, session_id: str, connection_id: str) -> Optional[Peer]:
        async with self._lock:
            room = self._rooms.get(session_id)
            if room is None:
                return None
            peer = room.peers.pop(connection_id, None)
            if not room.peers:
                # Empty rooms are dropped rather than kept: a day of consultations
                # would otherwise leave a day of empty Room objects behind.
                self._rooms.pop(session_id, None)
            return peer

    def get(self, session_id: str) -> Optional[Room]:
        return self._rooms.get(session_id)

    def peers(self, session_id: str) -> List[Peer]:
        room = self._rooms.get(session_id)
        return list(room.peers.values()) if room else []

    def peer(self, session_id: str, connection_id: str) -> Optional[Peer]:
        room = self._rooms.get(session_id)
        return room.peers.get(connection_id) if room else None

    def room_count(self) -> int:
        return len(self._rooms)

    # -- delivery --------------------------------------------------------

    async def send_to(
        self, session_id: str, connection_id: str, message: Dict[str, Any]
    ) -> bool:
        """
        Deliver one message to one peer. False when that peer is gone.

        A send failure removes nothing here. The socket's own handler notices the
        disconnect and runs the full leave path, and tearing a peer down from inside an
        unrelated peer's send would drop its `peer-left` notification on the floor.
        """
        peer = self.peer(session_id, connection_id)
        if peer is None:
            return False
        try:
            await peer.websocket.send_text(json.dumps(message, default=str))
            return True
        except Exception:
            logger.debug("send to %s failed; peer presumed gone", connection_id)
            return False

    async def broadcast(
        self,
        session_id: str,
        message: Dict[str, Any],
        *,
        exclude: Optional[Set[str]] = None,
    ) -> None:
        """Deliver to everybody in the room except the excluded connection ids."""
        exclude = exclude or set()
        payload = json.dumps(message, default=str)
        for peer in self.peers(session_id):
            if peer.connection_id in exclude:
                continue
            try:
                await peer.websocket.send_text(payload)
            except Exception:
                logger.debug("broadcast to %s failed", peer.connection_id)


#: Process-wide registry. One per process, by the design note above.
registry = RoomRegistry()


# ---------------------------------------------------------------------------
# Message handling
# ---------------------------------------------------------------------------


def _error(message: str, *, code: str = "invalid_message") -> Dict[str, Any]:
    return {"type": "error", "code": code, "message": message, "at": _now_iso()}


async def handle_message(
    session_id: str,
    peer: Peer,
    raw: str,
    *,
    on_control=None,
) -> None:
    """
    Route one incoming frame.

    `on_control` is an optional coroutine the route supplies to persist audit events.
    Signalling does not import the service layer - it would be a cycle, and more to the
    point the relay must keep working when the database does not. A consultation whose
    audit insert fails should drop the audit line, not the call.
    """
    try:
        message = json.loads(raw)
    except (TypeError, ValueError):
        await registry.send_to(
            session_id, peer.connection_id, _error("Message was not valid JSON.")
        )
        return

    if not isinstance(message, dict):
        await registry.send_to(
            session_id, peer.connection_id, _error("Message must be an object.")
        )
        return

    msg_type = str(message.get("type") or "")

    # ---- Peer-to-peer negotiation: forwarded, never interpreted --------
    if msg_type in RELAY_TYPES:
        target = message.get("to")
        if not target:
            await registry.send_to(
                session_id,
                peer.connection_id,
                _error(f"'{msg_type}' must name the peer it is for in 'to'."),
            )
            return
        if registry.peer(session_id, str(target)) is None:
            # The target left between the offer being made and arriving. Telling the
            # sender is what lets its UI drop the pending tile instead of showing a
            # connecting spinner forever.
            await registry.send_to(
                session_id,
                peer.connection_id,
                {"type": "peer-unavailable", "connectionId": target, "at": _now_iso()},
            )
            return
        await registry.send_to(
            session_id,
            str(target),
            {
                "type": msg_type,
                "from": peer.connection_id,
                "fromUserId": peer.user_id,
                "payload": message.get("payload"),
                "at": _now_iso(),
            },
        )
        return

    # ---- Control messages the server acts on ---------------------------
    if msg_type == "ping":
        await registry.send_to(
            session_id, peer.connection_id, {"type": "pong", "at": _now_iso()}
        )
        return

    if msg_type == "media-state":
        payload = message.get("payload") or {}
        peer.is_audio_muted = bool(payload.get("isAudioMuted", peer.is_audio_muted))
        peer.is_video_muted = bool(payload.get("isVideoMuted", peer.is_video_muted))
        await registry.broadcast(
            session_id,
            {
                "type": "peer-media-state",
                "connectionId": peer.connection_id,
                "isAudioMuted": peer.is_audio_muted,
                "isVideoMuted": peer.is_video_muted,
                "at": _now_iso(),
            },
            exclude={peer.connection_id},
        )
        return

    if msg_type == "chat":
        text = str((message.get("payload") or {}).get("text") or "").strip()
        if not text:
            return
        if len(text) > MAX_CHAT_LENGTH:
            text = text[:MAX_CHAT_LENGTH]
        entry = {
            "type": "chat",
            "connectionId": peer.connection_id,
            "userId": peer.user_id,
            "userName": peer.user_name,
            "role": peer.role,
            "text": text,
            "at": _now_iso(),
        }
        room = registry.get(session_id)
        if room is not None:
            room.chat.append(entry)
            del room.chat[:-100]
        await registry.broadcast(session_id, entry)
        return

    if msg_type == "screen-share":
        payload = message.get("payload") or {}
        await registry.broadcast(
            session_id,
            {
                "type": "peer-screen-share",
                "connectionId": peer.connection_id,
                "isSharing": bool(payload.get("isSharing")),
                "at": _now_iso(),
            },
            exclude={peer.connection_id},
        )
        return

    if msg_type in ("screening-started", "screening-progress", "screening-finished"):
        # Progress of a capture the clinician is watching. The patient's browser is the
        # only thing that knows how many poses have been held, so it reports; the
        # server does not take the client's word for anything that matters, and none of
        # this is stored as a clinical fact.
        await registry.broadcast(
            session_id,
            {
                "type": msg_type,
                "connectionId": peer.connection_id,
                "userId": peer.user_id,
                "payload": message.get("payload"),
                "at": _now_iso(),
            },
            exclude={peer.connection_id},
        )
        if on_control is not None:
            await on_control(msg_type, message.get("payload"))
        return

    if msg_type in STAFF_ONLY_TYPES:
        # Every one of these has a REST endpoint that does the real work and writes the
        # audit row. Rejecting them here rather than forwarding means a patient cannot
        # even announce to the room that a screening was unlocked - which, arriving over
        # the same socket the real notification uses, a naive client would believe.
        if not peer.is_staff:
            await registry.send_to(
                session_id,
                peer.connection_id,
                _error(
                    "Only a clinician or administrator can do that.",
                    code="forbidden",
                ),
            )
            return
        await registry.send_to(
            session_id,
            peer.connection_id,
            _error(
                f"'{msg_type}' is not performed over the socket. "
                f"Call the corresponding /api/video endpoint.",
                code="use_rest_endpoint",
            ),
        )
        return

    if msg_type == "leave":
        # Handled by the socket closing; acknowledged so the client can close cleanly.
        await registry.send_to(
            session_id, peer.connection_id, {"type": "leave-ack", "at": _now_iso()}
        )
        return

    await registry.send_to(
        session_id, peer.connection_id, _error(f"Unknown message type '{msg_type}'.")
    )


async def announce_join(session_id: str, peer: Peer, existing: List[Peer]) -> None:
    """
    Tell the joining peer who is here, and tell everyone else who arrived.

    The joining peer is the one told to send offers (`shouldOffer: true` against each
    existing peer). Fixing the offerer by arrival order is what prevents both sides
    offering at once, which leaves both connections stuck in `have-local-offer`.
    """
    room = registry.get(session_id)
    await registry.send_to(
        session_id,
        peer.connection_id,
        {
            "type": "room-state",
            "connectionId": peer.connection_id,
            "self": peer.describe(),
            "peers": [p.describe() for p in existing],
            "shouldOffer": [p.connection_id for p in existing],
            "chat": list(room.chat) if room else [],
            "at": _now_iso(),
        },
    )
    await registry.broadcast(
        session_id,
        {"type": "peer-joined", "peer": peer.describe(), "at": _now_iso()},
        exclude={peer.connection_id},
    )


async def announce_leave(session_id: str, peer: Peer) -> None:
    await registry.broadcast(
        session_id,
        {
            "type": "peer-left",
            "connectionId": peer.connection_id,
            "userId": peer.user_id,
            "at": _now_iso(),
        },
    )


async def notify_screening_state(
    session_id: str,
    *,
    enabled: bool,
    screening_type: Optional[str],
    enabled_by: Optional[str] = None,
    token: Optional[str] = None,
    token_for_user_id: Optional[str] = None,
) -> None:
    """
    Push a change in screening authorisation into the live room.

    Called by the REST endpoints after the database row is updated, so the patient's
    browser learns it may begin without polling. The token is delivered only to the
    patient it was minted for - broadcasting it would hand the authorisation to every
    peer in the room, including an observer.
    """
    await registry.broadcast(
        session_id,
        {
            "type": "screening-authorisation",
            "enabled": enabled,
            "screeningType": screening_type,
            "enabledBy": enabled_by,
            "at": _now_iso(),
        },
    )
    if token and token_for_user_id:
        for peer in registry.peers(session_id):
            if peer.user_id == token_for_user_id:
                await registry.send_to(
                    session_id,
                    peer.connection_id,
                    {
                        "type": "screening-token",
                        "token": token,
                        "screeningType": screening_type,
                        "at": _now_iso(),
                    },
                )


async def notify_session_ended(session_id: str, ended_by: Optional[str] = None) -> None:
    await registry.broadcast(
        session_id,
        {"type": "session-ended", "endedBy": ended_by, "at": _now_iso()},
    )
