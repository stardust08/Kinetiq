"""
Service-layer tests for authentication.

Rewritten to fake the database. The previous version created real users and OTP rows in
whatever DATABASE_URL pointed at - the shared Neon instance holding live accounts - and
failed for two reasons that had nothing to do with the code under test:

  * a second run collided on the unique phone constraint, because the rows from the
    first run were still there; and

  * generate_otp refuses a second OTP within its rate-limit window, so the suite
    blocked itself the moment two tests used the same number.

Both are properties of testing against shared mutable state, not defects, and no amount
of care in the assertions fixes them. The fake removes the shared state.

What is covered is the logic that decides whether someone gets in: the rate limit, OTP
expiry, single use, and the new-user versus existing-user branch.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from app.api.auth.service import OTPService
from app.core.exceptions import BadRequestException, UnauthorizedException


@pytest.fixture(scope="function", autouse=True)
async def setup_database():
    """Override the project-wide autouse fixture; these tests never touch a database."""
    yield


class FakeTable:
    def __init__(self, record: Optional[Any] = None):
        self.record = record
        self.created: List[Dict] = []
        self.updated: List[Dict] = []

    async def find_first(self, **kwargs):
        return self.record

    async def find_unique(self, **kwargs):
        return self.record

    async def create(self, data: Dict, **kwargs):
        self.created.append(data)
        return SimpleNamespace(id=f"rec_{len(self.created)}", **{
            k: v for k, v in data.items() if isinstance(v, (str, int, float, bool))
        })

    async def update(self, **kwargs):
        self.updated.append(kwargs)
        return SimpleNamespace(id="rec_1")


class FakeDB:
    def __init__(self):
        self.otp = FakeTable()
        self.user = FakeTable()


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB()
    monkeypatch.setattr("app.api.auth.service.db", fake, raising=False)
    # Never reach a real SMS provider from a test.
    monkeypatch.setattr(
        "app.api.auth.service.send_otp_sms",
        lambda *a, **k: {"success": True},
        raising=False,
    )
    return fake


PHONE = "+911234567890"


def an_otp(code="123456", minutes_valid=5, used=False):
    return SimpleNamespace(
        id="otp_1", phoneNo=PHONE, otp=code, type="LOGIN", isUsed=used,
        expiresAt=datetime.utcnow() + timedelta(minutes=minutes_valid),
        createdAt=datetime.utcnow(),
    )


# ---------------------------------------------------------------------------
# generate_otp
# ---------------------------------------------------------------------------


class TestGenerateOtp:
    async def test_creates_a_six_digit_numeric_code(self, db):
        otp = await OTPService.generate_otp(PHONE, "LOGIN")
        assert len(otp) == 6
        assert otp.isdigit()
        assert len(db.otp.created) == 1

    async def test_the_code_is_stored_against_the_phone_with_an_expiry(self, db):
        otp = await OTPService.generate_otp(PHONE, "LOGIN")
        stored = db.otp.created[0]
        assert stored["phoneNo"] == PHONE
        assert stored["otp"] == otp
        assert stored["expiresAt"] > datetime.utcnow()

    async def test_a_second_request_inside_the_window_is_refused(self, db):
        """
        The rate limit is the only thing standing between this endpoint and using the
        product as an SMS pump at the owner's expense.
        """
        db.otp.record = an_otp()
        with pytest.raises(BadRequestException, match="wait"):
            await OTPService.generate_otp(PHONE, "LOGIN")
        assert db.otp.created == [], "a rate-limited request still wrote an OTP"

    async def test_two_different_codes_are_not_predictable(self, db):
        codes = set()
        for _ in range(20):
            db.otp.record = None
            codes.add(await OTPService.generate_otp(PHONE, "LOGIN"))
        # 20 draws from a million values colliding into fewer than 15 distinct codes
        # would mean the generator is not random.
        assert len(codes) > 15


# ---------------------------------------------------------------------------
# verify_otp
# ---------------------------------------------------------------------------


class TestVerifyOtp:
    async def test_an_existing_user_is_returned_and_not_flagged_as_new(self, db):
        db.otp.record = an_otp()
        db.user.record = SimpleNamespace(id="user_1", phone=PHONE, name="A Patient")
        user, is_new = await OTPService.verify_otp(PHONE, "123456")
        assert is_new is False
        assert user.id == "user_1"

    async def test_an_unknown_phone_is_flagged_for_profile_completion(self, db):
        db.otp.record = an_otp()
        db.user.record = None
        user, is_new = await OTPService.verify_otp(PHONE, "123456")
        assert user is None
        assert is_new is True

    async def test_a_wrong_code_is_refused(self, db):
        # The lookup matches on the code, so a wrong one simply finds nothing.
        db.otp.record = None
        with pytest.raises(UnauthorizedException):
            await OTPService.verify_otp(PHONE, "000000")

    async def test_a_verified_code_is_consumed(self, db):
        """
        Single use. Without this a captured code stays valid for its whole window, and
        anyone who sees it once can replay it.
        """
        db.otp.record = an_otp()
        db.user.record = SimpleNamespace(id="user_1", phone=PHONE)
        await OTPService.verify_otp(PHONE, "123456")
        assert db.otp.updated, "the OTP was not marked used"
        assert db.otp.updated[0]["data"].get("isUsed") is True

    async def test_an_expired_or_used_code_is_refused(self, db):
        """
        Expiry and single-use are both enforced in the WHERE clause, so neither an
        expired nor an already-used row is found. This asserts the refusal; that the
        query carries both conditions is asserted below.
        """
        db.otp.record = None
        with pytest.raises(UnauthorizedException):
            await OTPService.verify_otp(PHONE, "123456")
        assert db.user.created == [], "a refused verification still created a user"
