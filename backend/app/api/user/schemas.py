from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
from enum import Enum
from datetime import datetime


# =========================
# Enums (MATCH PRISMA)
# =========================

class UserRole(str, Enum):
    USER = "USER"
    CLINICIAN = "CLINICIAN"
    ADMIN = "ADMIN"


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    BLOCKED = "BLOCKED"


# =========================
# Base Schema (shared)
# =========================

class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    phone: str
    profileImage: Optional[str] = None


# =========================
# Create User (API INPUT)
# =========================

class UserCreate(UserBase):
    """
    Fields client is allowed to send.
    Everything else is set by backend.
    """
    password: Optional[str] = None  # will be hashed
    notificationPreference: Optional[Dict[str, Any]] = None


# =========================
# Internal DB Schema
# (matches Prisma exactly)
# =========================

class UserDB(UserBase):
    id: str
    role: UserRole
    status: UserStatus
    passwordHash: Optional[str]
    sessionCount: int
    notificationPreference: Optional[Dict[str, Any]]
    createdAt: datetime


# =========================
# API Response Schema
# =========================

class UserOut(UserBase):
    id: str
    role: UserRole
    status: UserStatus
    sessionCount: int
    createdAt: datetime


# from pydantic import BaseModel
# from typing import Optional
# from enum import Enum as enum

# class UserRole(str,enum):
#     ADMIN = "ADMIN"
#     USER = "USER"
#     CLINICIAN="CLINICIAN"

# class UserStatus(str,enum):
#     ACTIVE = "ACTIVE"
#     INACTIVE = "INACTIVE"
#     BLOCKED = "BLOCKED"

# class UserModel(BaseModel):
#     id: str
#     email: Optional[str]
#     name: Optional[str]
#     role: UserRole
#     phone: Optional[str]
#     status: UserStatus
#     profileImage: str
#     sessionCount: int
#     notificationPreference: object

# class UserCreate(BaseModel):
#   email: Optional[str]
#   name: Optional[str]
#   phone: Optional[str]
# #   status: UserStatus    
#   profileImage: Optional[str]
#   sessionCount: Optional[int]
#   notificationPreference: Optional[object]


# class UserOut(BaseModel):
#     id: str
#     email: Optional[str]
#     name: Optional[str]
#     phone: Optional[str]
