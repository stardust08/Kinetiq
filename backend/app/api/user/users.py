from prisma import Json
from app.db.client import db
from app.api.user.schemas import UserCreate, UserRole, UserStatus

class UserService:
    def __init__(self):
        self.db = db

    @staticmethod
    async def checkUser(payload: UserCreate):
        return await db.query_raw(
        '''SELECT id, email, phone, role, status FROM "User" WHERE email = $1 OR phone = $2 LIMIT 1''',
        payload.email,payload.phone
        )

    @staticmethod
    async def createUser(payload: UserCreate):
        return await db.user.create(
            data={
                "email": payload.email,
                "name": payload.name,
                "phone": payload.phone,
                "role": UserRole.USER.value,
                "status": UserStatus.ACTIVE.value,
                "passwordHash": None,
                "sessionCount": 0,
                "profileImage": payload.profileImage,
                "notificationPreference": (
                    Json(payload.notificationPreference)
                    if payload.notificationPreference is not None
                    else None
                ),
            }
        )