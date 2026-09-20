"""
Test for full payment checkout flow.

This test verifies the complete checkout flow for services with FULL payment type,
including cart validation, booking creation, payment initiation, and verification.
"""

import pytest
import json
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timedelta
from app.main import app
from app.db.client import db


@pytest.mark.asyncio
async def test_full_payment_checkout_success(test_user_token, test_user_id):
    """Test successful full payment checkout flow."""
    import uuid
    unique_slug = f"test-category-{uuid.uuid4().hex[:8]}"
    
    # Setup: Create a category and service with FULL payment type
    category = await db.category.create(
        data={
            "name": "Test Category",
            "slug": unique_slug,
            "description": "Test category for full payment"
        }
    )
    
    service_slug = f"full-payment-service-{uuid.uuid4().hex[:8]}"
    service = await db.service.create(
        data={
            "name": "Full Payment Service",
            "slug": service_slug,
            "description": "Service with full payment",
            "basePrice": 500.0,
            "paymentType": "FULL",
            "categoryId": category.id
        }
    )
    
    # Add service to cart using CartService
    from app.api.cart.service import CartService
    cart = await CartService.add_item(test_user_id, service.id, 1)
    
    # Test checkout
    scheduled_time = datetime.utcnow() + timedelta(days=7)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time.isoformat()},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
    
    assert response.status_code == 200
    data = response.json()["data"]
    
    # Verify payment details
    assert data["payment"]["totalAmount"] == 500.0
    assert data["payment"]["paidAmount"] == 500.0
    assert data["payment"]["remainingAmount"] == 0.0
    assert data["payment"]["status"] == "PENDING"
    
    # Verify bookings created
    assert len(data["bookings"]) == 1
    booking = data["bookings"][0]
    assert booking["totalAmount"] == 500.0
    assert booking["paidAmount"] == 500.0
    assert booking["remainingAmount"] == 0.0
    assert booking["status"] == "PENDING"
    
    # Verify payment details for gateway
    assert "paymentDetails" in data
    assert data["paymentDetails"]["amount"] == 500.0
    assert "transactionId" in data["paymentDetails"]
    assert "gatewayUrl" in data["paymentDetails"]
    
    # Test payment verification
    payment_id = data["payment"]["id"]
    transaction_id = data["paymentDetails"]["transactionId"]
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        verify_response = await client.post(
            "/api/payments/verify",
            json={
                "paymentId": payment_id,
                "transactionId": transaction_id,
                "status": "success"
            }
        )
    
    assert verify_response.status_code == 200
    verify_data = verify_response.json()
    assert verify_data["success"] is True
    assert verify_data["message"] == "Payment verified"
    
    # Verify payment status updated to COMPLETED
    payment = await db.payment.find_unique(where={"id": payment_id})
    assert payment.status == "COMPLETED"
    assert payment.transactionId == transaction_id
    assert payment.completedAt is not None
    
    # Verify booking status updated to CONFIRMED
    booking_record = await db.booking.find_first(where={"paymentId": payment_id})
    assert booking_record.status == "CONFIRMED"
    
    # Verify cart cleared
    updated_cart = await db.cart.find_first(where={"userId": test_user_id})
    assert updated_cart.items == []
    assert updated_cart.cartValue == 0
    
    # Cleanup
    await db.booking.delete(where={"id": booking_record.id})
    await db.payment.delete(where={"id": payment_id})
    await db.service.delete(where={"id": service.id})
    await db.category.delete(where={"id": category.id})


@pytest.mark.asyncio
async def test_checkout_empty_cart(test_user_token, test_user_id):
    """Test checkout with empty cart."""
    # Ensure cart is empty using CartService
    from app.api.cart.service import CartService
    await CartService.clear_cart(test_user_id)
    
    scheduled_time = datetime.utcnow() + timedelta(days=7)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time.isoformat()},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
    
    assert response.status_code == 400
    assert "Cart is empty" in response.json()["detail"]


@pytest.mark.asyncio
async def test_checkout_unauthorized():
    """Test checkout without authentication."""
    scheduled_time = datetime.utcnow() + timedelta(days=7)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time.isoformat()}
        )
    
    assert response.status_code == 401
