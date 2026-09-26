"""
The three roles, in one place.

`UserRole` in the Prisma schema spells the patient role `USER`. That name predates
there being anything else in the system, and renaming it would rewrite the role column
on every existing row and invalidate every JWT already issued. So the stored value
stays `USER` and this module is the only place that knows it means "patient":

    >>> Role.PATIENT.value
    'USER'
    >>> Role.PATIENT.label
    'Patient'

Everything downstream - dependencies, services, response payloads - compares against
these members rather than against bare strings. A bare `role == "CLINICIAN"` scattered
through twelve modules is how an authorisation check ends up spelled `"Clinician"` in
one of them and silently passes nobody.
"""

from __future__ import annotations

from enum import Enum
from typing import Iterable, Tuple


class Role(str, Enum):
    """A role as stored in User.role."""

    PATIENT = "USER"
    CLINICIAN = "CLINICIAN"
    ADMIN = "ADMIN"

    @property
    def label(self) -> str:
        """Human-facing name. `USER` must never be shown to a user as "User"."""
        return {
            Role.PATIENT: "Patient",
            Role.CLINICIAN: "Clinician",
            Role.ADMIN: "Administrator",
        }[self]

    @classmethod
    def parse(cls, value: object) -> "Role":
        """
        Coerce whatever the database or a request handed us into a Role.

        Accepts the stored value (`USER`), the member name (`PATIENT`), and the
        friendlier aliases a client is likely to send (`patient`, `doctor`). Raises
        ValueError for anything else rather than defaulting - defaulting an unparseable
        role to PATIENT would grant access to a request that asked for something we do
        not understand.
        """
        if isinstance(value, cls):
            return value
        if value is None:
            raise ValueError("role is required")
        raw = str(getattr(value, "value", value)).strip().upper()
        aliases = {
            "USER": cls.PATIENT,
            "PATIENT": cls.PATIENT,
            "CLINICIAN": cls.CLINICIAN,
            # Clinicians are called doctors by roughly every patient and half the
            # product copy, so accept it on input. Never emit it.
            "DOCTOR": cls.CLINICIAN,
            "PHYSIO": cls.CLINICIAN,
            "PHYSIOTHERAPIST": cls.CLINICIAN,
            "ADMIN": cls.ADMIN,
            "ADMINISTRATOR": cls.ADMIN,
        }
        try:
            return aliases[raw]
        except KeyError:
            raise ValueError(f"Unknown role: {value!r}")


#: Roles that may act on another person's clinical record. The distinction that matters
#: across the whole codebase is not "admin vs clinician" but "staff vs patient": a
#: patient may only ever reach their own data, and staff may reach a patient's.
STAFF_ROLES: Tuple[Role, ...] = (Role.CLINICIAN, Role.ADMIN)

#: Roles that may start a screening. Same membership as STAFF_ROLES today, named
#: separately because it answers a different question and will not necessarily move
#: with it - a read-only auditor role would be staff without being able to start one.
SCREENING_INITIATOR_ROLES: Tuple[Role, ...] = (Role.CLINICIAN, Role.ADMIN)


def role_values(roles: Iterable[Role]) -> Tuple[str, ...]:
    """Stored values for a set of roles, for use in a database `in` filter."""
    return tuple(r.value for r in roles)


def is_staff(user) -> bool:
    """True when this user may act on somebody else's record."""
    try:
        return Role.parse(user.role) in STAFF_ROLES
    except (AttributeError, ValueError):
        return False


def is_patient(user) -> bool:
    try:
        return Role.parse(user.role) is Role.PATIENT
    except (AttributeError, ValueError):
        return False


def is_admin(user) -> bool:
    try:
        return Role.parse(user.role) is Role.ADMIN
    except (AttributeError, ValueError):
        return False


def is_clinician(user) -> bool:
    try:
        return Role.parse(user.role) is Role.CLINICIAN
    except (AttributeError, ValueError):
        return False
