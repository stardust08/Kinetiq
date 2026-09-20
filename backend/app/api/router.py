from fastapi import APIRouter
from app.api.user.routes import user_router
from app.api.auth.routes import auth_router
from app.api.category.routes import category_router
from app.api.service.routes import service_router
from app.api.cart.routes import cart_router
from app.api.booking.routes import booking_router
from app.api.payment.routes import payment_router
from app.api.posture.routes import posture_router
from app.api.slot.routes import router as slot_router
from app.api.gait.routes import gait_router
from app.api.rom.routes import rom_router
# from app.api.pose.routes import router as pose_router

api_router = APIRouter(prefix="/api", tags=["api"])

api_router.include_router(user_router)
api_router.include_router(auth_router)
api_router.include_router(category_router)
api_router.include_router(service_router)
api_router.include_router(cart_router)
api_router.include_router(booking_router)
api_router.include_router(payment_router)
api_router.include_router(posture_router)
api_router.include_router(slot_router)
api_router.include_router(gait_router)
api_router.include_router(rom_router)
# api_router.include_router(pose_router)