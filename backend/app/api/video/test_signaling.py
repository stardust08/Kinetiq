"""
Tests for the WebRTC signalling hub.

Signalling is a relay, so most of what could go wrong here is about *who* a message
reaches rather than what it says. Two properties carry the weight:

  1. A message addressed to a peer goes to that peer and to nobody else. Offers and ICE
     candidates are opaque to the server, so a mis-addressed relay is invisible - it
     shows up as a call that will not connect, or as one participant receiving another
     consultation's negotiation.

  2. A patient cannot send a control message that only staff may send. The UI hides the
     button; hiding a button is not a permission.

The WebSocket itself is faked. A real socket would test starlette, not this module.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest

from app.api.video import signaling
from app.api.video.signaling import Peer, RoomRegistry


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Override the project-wide autouse fixture; nothing here touches a database."""
    yield


class FakeSocket:
    """Collects what the server sent, and can be told to fail like a dead socket."""

    def __init__(self, fail: bool = False):
        self.sent: List[Dict[str, Any]] = []
        self.fail = fail

    async def send_text(self, text: str) -> None:
        if self.fail:
            raise RuntimeError("socket is gone")
        self.sent.append(json.loads(text))

    def types(self) -> List[str]:
        return [m.get("type") for m in self.sent]

    def last(self) -> Dict[str, Any]:
        assert self.sent, "nothing was sent to this peer"
        return self.sent[-1]


def a_peer(connection_id: str, role: str = "PATIENT", user_id: str = None) -> Peer:
    return Peer(
        connection_id=connection_id,
        user_id=user_id or f"user_{connection_id}",
        user_name=f"Name {connection_id}",
        role=role,
        websocket=FakeSocket(),
    )


@pytest.fixture
def registry(monkeypatch):
    """
    A registry per test.

    The module holds a process-wide one; sharing it between tests would let a peer left
    behind by one test receive another's broadcasts.
    """
    fresh = RoomRegistry()
    monkeypatch.setattr(signaling, "registry", fresh)
    return fresh


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------


class TestMembership:
    async def test_joining_returns_whoever_is_already_there(self, registry):
        """
        Drives the mesh: the joining peer offers to each existing peer and they wait.
        Fixing the offerer by arrival order is what avoids both sides offering at once
        and leaving both connections stuck.
        """
        clinician = a_peer("c1", "CLINICIAN")
        assert await registry.join("s1", clinician) == []

        patient = a_peer("p1", "PATIENT")
        existing = await registry.join("s1", patient)

        assert [p.connection_id for p in existing] == ["c1"]

    async def test_a_peer_does_not_see_itself_in_the_existing_list(self, registry):
        peer = a_peer("p1")
        await registry.join("s1", peer)
        again = await registry.join("s1", peer)
        assert again == []

    async def test_leaving_removes_the_peer(self, registry):
        await registry.join("s1", a_peer("p1"))
        await registry.join("s1", a_peer("c1", "CLINICIAN"))

        left = await registry.leave("s1", "p1")

        assert left.connection_id == "p1"
        assert [p.connection_id for p in registry.peers("s1")] == ["c1"]

    async def test_an_empty_room_is_dropped(self, registry):
        """A day of consultations would otherwise leave a day of empty rooms behind."""
        await registry.join("s1", a_peer("p1"))
        await registry.leave("s1", "p1")
        assert registry.get("s1") is None
        assert registry.room_count() == 0

    async def test_leaving_a_room_that_does_not_exist_is_harmless(self, registry):
        assert await registry.leave("nope", "p1") is None

    async def test_rooms_are_isolated_from_each_other(self, registry):
        await registry.join("s1", a_peer("p1"))
        await registry.join("s2", a_peer("p2"))
        assert [p.connection_id for p in registry.peers("s1")] == ["p1"]
        assert [p.connection_id for p in registry.peers("s2")] == ["p2"]


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------


class TestDelivery:
    async def test_a_broadcast_reaches_everyone_but_the_excluded(self, registry):
        a, b, c = a_peer("a"), a_peer("b"), a_peer("c")
        for peer in (a, b, c):
            await registry.join("s1", peer)

        await registry.broadcast("s1", {"type": "hello"}, exclude={"a"})

        assert a.websocket.sent == []
        assert b.websocket.types() == ["hello"]
        assert c.websocket.types() == ["hello"]

    async def test_a_dead_socket_does_not_stop_the_broadcast(self, registry):
        """
        One participant dropping their connection must not silence the others. Before
        this the first failing send aborted the loop, so a stale peer stopped everybody
        after it from hearing that a screening had been authorised.
        """
        dead = a_peer("dead")
        dead.websocket = FakeSocket(fail=True)
        alive = a_peer("alive")
        await registry.join("s1", dead)
        await registry.join("s1", alive)

        await registry.broadcast("s1", {"type": "hello"})

        assert alive.websocket.types() == ["hello"]

    async def test_sending_to_an_absent_peer_reports_failure(self, registry):
        await registry.join("s1", a_peer("p1"))
        assert await registry.send_to("s1", "ghost", {"type": "x"}) is False

    async def test_a_failed_send_does_not_evict_the_peer(self, registry):
        """
        Cleanup belongs to the socket's own handler, which runs the full leave path.
        Evicting from inside an unrelated peer's send would drop its `peer-left`
        notification on the floor.
        """
        dead = a_peer("dead")
        dead.websocket = FakeSocket(fail=True)
        await registry.join("s1", dead)

        assert await registry.send_to("s1", "dead", {"type": "x"}) is False
        assert registry.peer("s1", "dead") is not None


# ---------------------------------------------------------------------------
# Relay
# ---------------------------------------------------------------------------


class TestRelay:
    @pytest.mark.parametrize("kind", ["offer", "answer", "ice-candidate"])
    async def test_negotiation_reaches_only_the_named_peer(self, registry, kind):
        sender = a_peer("p1")
        target = a_peer("c1", "CLINICIAN")
        bystander = a_peer("a1", "ADMIN")
        for peer in (sender, target, bystander):
            await registry.join("s1", peer)

        await signaling.handle_message(
            "s1",
            sender,
            json.dumps({"type": kind, "to": "c1", "payload": {"sdp": "..."}}),
        )

        assert target.websocket.types() == [kind]
        assert target.websocket.last()["from"] == "p1"
        # The bystander must not see another pair's negotiation.
        assert bystander.websocket.sent == []

    async def test_a_relay_cannot_cross_rooms(self, registry):
        """
        `to` resolves within the sender's own room only, so a connection id lifted from
        another consultation resolves to nothing.
        """
        sender = a_peer("p1")
        await registry.join("s1", sender)
        outsider = a_peer("x1")
        await registry.join("s2", outsider)

        await signaling.handle_message(
            "s1", sender, json.dumps({"type": "offer", "to": "x1", "payload": {}})
        )

        assert outsider.websocket.sent == []
        assert sender.websocket.last()["type"] == "peer-unavailable"

    async def test_a_relay_with_no_recipient_is_refused(self, registry):
        sender = a_peer("p1")
        await registry.join("s1", sender)

        await signaling.handle_message(
            "s1", sender, json.dumps({"type": "offer", "payload": {}})
        )

        assert sender.websocket.last()["type"] == "error"

    async def test_a_departed_target_is_reported_so_the_tile_can_be_dropped(
        self, registry
    ):
        sender = a_peer("p1")
        await registry.join("s1", sender)

        await signaling.handle_message(
            "s1", sender, json.dumps({"type": "offer", "to": "gone", "payload": {}})
        )

        message = sender.websocket.last()
        assert message["type"] == "peer-unavailable"
        assert message["connectionId"] == "gone"


# ---------------------------------------------------------------------------
# Control messages
# ---------------------------------------------------------------------------


class TestControlMessages:
    async def test_muting_updates_state_and_tells_the_room(self, registry):
        patient = a_peer("p1")
        clinician = a_peer("c1", "CLINICIAN")
        await registry.join("s1", patient)
        await registry.join("s1", clinician)

        await signaling.handle_message(
            "s1",
            patient,
            json.dumps(
                {
                    "type": "media-state",
                    "payload": {"isAudioMuted": True, "isVideoMuted": False},
                }
            ),
        )

        assert patient.is_audio_muted is True
        assert clinician.websocket.last()["type"] == "peer-media-state"
        assert clinician.websocket.last()["isAudioMuted"] is True
        # The sender does not need to be told what it just did.
        assert patient.websocket.sent == []

    async def test_chat_reaches_the_whole_room_including_the_sender(self, registry):
        """
        Echoed back so the sender's transcript is built from the same stream everyone
        else sees, rather than optimistically on the client where it can diverge.
        """
        patient = a_peer("p1")
        clinician = a_peer("c1", "CLINICIAN")
        await registry.join("s1", patient)
        await registry.join("s1", clinician)

        await signaling.handle_message(
            "s1", patient, json.dumps({"type": "chat", "payload": {"text": "hello"}})
        )

        assert patient.websocket.last()["text"] == "hello"
        assert clinician.websocket.last()["text"] == "hello"

    async def test_an_empty_chat_message_is_dropped(self, registry):
        patient = a_peer("p1")
        await registry.join("s1", patient)

        await signaling.handle_message(
            "s1", patient, json.dumps({"type": "chat", "payload": {"text": "   "}})
        )

        assert patient.websocket.sent == []

    async def test_a_very_long_chat_message_is_truncated_not_rejected(self, registry):
        patient = a_peer("p1")
        await registry.join("s1", patient)

        await signaling.handle_message(
            "s1",
            patient,
            json.dumps({"type": "chat", "payload": {"text": "x" * 50_000}}),
        )

        assert len(patient.websocket.last()["text"]) == signaling.MAX_CHAT_LENGTH

    async def test_chat_history_is_bounded(self, registry):
        patient = a_peer("p1")
        await registry.join("s1", patient)

        for i in range(150):
            await signaling.handle_message(
                "s1", patient, json.dumps({"type": "chat", "payload": {"text": str(i)}})
            )

        room = registry.get("s1")
        assert len(room.chat) == 100
        assert room.chat[-1]["text"] == "149"

    async def test_ping_is_answered(self, registry):
        peer = a_peer("p1")
        await registry.join("s1", peer)
        await signaling.handle_message("s1", peer, json.dumps({"type": "ping"}))
        assert peer.websocket.last()["type"] == "pong"

    async def test_screening_progress_is_relayed_to_the_watching_clinician(
        self, registry
    ):
        """
        The patient's browser is the only thing that knows how many poses have been
        held, so it reports progress and the clinician's view follows along.
        """
        patient = a_peer("p1")
        clinician = a_peer("c1", "CLINICIAN")
        await registry.join("s1", patient)
        await registry.join("s1", clinician)

        recorded = []

        async def on_control(kind, payload):
            recorded.append((kind, payload))

        await signaling.handle_message(
            "s1",
            patient,
            json.dumps({"type": "screening-progress", "payload": {"pose": 2, "of": 4}}),
            on_control=on_control,
        )

        assert clinician.websocket.last()["type"] == "screening-progress"
        assert clinician.websocket.last()["payload"] == {"pose": 2, "of": 4}
        assert recorded == [("screening-progress", {"pose": 2, "of": 4})]


class TestStaffOnlyMessages:
    @pytest.mark.parametrize(
        "kind", ["enable-screening", "revoke-screening", "end-session"]
    )
    async def test_a_patient_cannot_send_a_staff_control_message(self, registry, kind):
        """
        The rule that matters. A patient announcing over the socket that a screening
        was unlocked would, arriving on the same channel the real notification uses, be
        believed by a naive client.
        """
        patient = a_peer("p1")
        await registry.join("s1", patient)

        await signaling.handle_message("s1", patient, json.dumps({"type": kind}))

        message = patient.websocket.last()
        assert message["type"] == "error"
        assert message["code"] == "forbidden"

    @pytest.mark.parametrize(
        "kind", ["enable-screening", "revoke-screening", "end-session"]
    )
    async def test_even_staff_are_sent_to_the_rest_endpoint(self, registry, kind):
        """
        These actions write a database row and an audit event. Doing that over the
        socket would put the authorisation somewhere it cannot be re-checked.
        """
        clinician = a_peer("c1", "CLINICIAN")
        await registry.join("s1", clinician)

        await signaling.handle_message("s1", clinician, json.dumps({"type": kind}))

        message = clinician.websocket.last()
        assert message["type"] == "error"
        assert message["code"] == "use_rest_endpoint"

    async def test_a_patient_cannot_forge_a_screening_authorisation(self, registry):
        """
        `screening-authorisation` is server-generated. A patient sending one is an
        unknown type, so it is dropped rather than broadcast.
        """
        patient = a_peer("p1")
        clinician = a_peer("c1", "CLINICIAN")
        await registry.join("s1", patient)
        await registry.join("s1", clinician)

        await signaling.handle_message(
            "s1",
            patient,
            json.dumps({"type": "screening-authorisation", "enabled": True}),
        )

        assert clinician.websocket.sent == []
        assert patient.websocket.last()["type"] == "error"


class TestMalformedInput:
    @pytest.mark.parametrize(
        "raw", ["not json", "", "[1,2,3]", '"a string"', "null", "123"]
    )
    async def test_rubbish_produces_an_error_not_a_crash(self, registry, raw):
        peer = a_peer("p1")
        await registry.join("s1", peer)

        await signaling.handle_message("s1", peer, raw)

        assert peer.websocket.last()["type"] == "error"

    async def test_an_unknown_type_is_reported(self, registry):
        peer = a_peer("p1")
        await registry.join("s1", peer)
        await signaling.handle_message("s1", peer, json.dumps({"type": "teleport"}))
        assert peer.websocket.last()["type"] == "error"
        assert "teleport" in peer.websocket.last()["message"]

    async def test_a_message_with_no_type_is_reported(self, registry):
        peer = a_peer("p1")
        await registry.join("s1", peer)
        await signaling.handle_message("s1", peer, json.dumps({"payload": {}}))
        assert peer.websocket.last()["type"] == "error"


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------


class TestAnnouncements:
    async def test_the_joiner_is_told_who_to_offer_to(self, registry):
        clinician = a_peer("c1", "CLINICIAN")
        await registry.join("s1", clinician)
        patient = a_peer("p1")
        existing = await registry.join("s1", patient)

        await signaling.announce_join("s1", patient, existing)

        state = patient.websocket.sent[0]
        assert state["type"] == "room-state"
        assert state["shouldOffer"] == ["c1"]
        assert state["self"]["connectionId"] == "p1"
        assert [p["connectionId"] for p in state["peers"]] == ["c1"]
        # And the room is told somebody arrived.
        assert clinician.websocket.last()["type"] == "peer-joined"

    async def test_a_late_joiner_receives_the_conversation_so_far(self, registry):
        first = a_peer("c1", "CLINICIAN")
        await registry.join("s1", first)
        await signaling.handle_message(
            "s1", first, json.dumps({"type": "chat", "payload": {"text": "earlier"}})
        )

        latecomer = a_peer("p1")
        existing = await registry.join("s1", latecomer)
        await signaling.announce_join("s1", latecomer, existing)

        state = latecomer.websocket.sent[0]
        assert [m["text"] for m in state["chat"]] == ["earlier"]

    async def test_leaving_is_announced(self, registry):
        patient = a_peer("p1")
        clinician = a_peer("c1", "CLINICIAN")
        await registry.join("s1", patient)
        await registry.join("s1", clinician)

        await registry.leave("s1", "p1")
        await signaling.announce_leave("s1", patient)

        assert clinician.websocket.last()["type"] == "peer-left"
        assert clinician.websocket.last()["connectionId"] == "p1"


class TestScreeningNotification:
    async def test_the_token_goes_only_to_the_patient_it_was_minted_for(self, registry):
        """
        The authorisation is bound to one patient. Broadcasting the token would hand it
        to every peer in the room, including an observer.
        """
        patient = a_peer("p1", "PATIENT", user_id="patient_1")
        clinician = a_peer("c1", "CLINICIAN", user_id="clin_1")
        observer = a_peer("o1", "OBSERVER", user_id="obs_1")
        for peer in (patient, clinician, observer):
            await registry.join("s1", peer)

        await signaling.notify_screening_state(
            "s1",
            enabled=True,
            screening_type="POSTURE",
            enabled_by="clin_1",
            token="secret-token",
            token_for_user_id="patient_1",
        )

        # Everybody learns a screening was authorised...
        for peer in (patient, clinician, observer):
            assert "screening-authorisation" in peer.websocket.types()

        # ...but only the patient receives the token.
        assert "screening-token" in patient.websocket.types()
        assert patient.websocket.last()["token"] == "secret-token"
        assert "screening-token" not in clinician.websocket.types()
        assert "screening-token" not in observer.websocket.types()

    async def test_revoking_broadcasts_without_a_token(self, registry):
        patient = a_peer("p1", "PATIENT", user_id="patient_1")
        await registry.join("s1", patient)

        await signaling.notify_screening_state(
            "s1", enabled=False, screening_type=None, enabled_by="clin_1"
        )

        assert patient.websocket.last()["type"] == "screening-authorisation"
        assert patient.websocket.last()["enabled"] is False
        assert "screening-token" not in patient.websocket.types()

    async def test_ending_the_session_tells_the_room(self, registry):
        patient = a_peer("p1")
        await registry.join("s1", patient)

        await signaling.notify_session_ended("s1", ended_by="clin_1")

        assert patient.websocket.last()["type"] == "session-ended"
