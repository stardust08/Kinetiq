from fastapi import APIRouter, HTTPException
from app.api.user.users import UserService
from app.api.user.schemas import UserCreate

user_router = APIRouter(prefix="/users", tags=["users"])

@user_router.post("/create")
async def create_user(payload: UserCreate):
    user = await UserService.checkUser(payload)
    if user and len(user) > 0:
        print(user[0])
        raise HTTPException(status_code=400, detail="Userrrrrrrr already exists")
    # if user:
    #     print(user[0])
    #     raise HTTPException(status_code=400, detail="User already exists")
    else:
        return {"response": "User doesnnot exist","user":user}    
