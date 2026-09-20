"""
Test for POST /payments/{id}/pay-remaining endpoint.

This test verifies that the remaining payment endpoint works correctly
for partial payment bookings.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.client import db


@pytest.mark.asyncio
async def test_pay_remaining_success(test_user_token, test_user_id):
    """Test successful remaining payment."""
    # Create a test payment record with partial payment
    payment = await db.payment.create(
        data={
            "userId": test_user_id,
            "totalAmount": 1000.0,
            "paidAmount": 300.0,
            "remainingAmount": 700.0,
            "status": "PARTIAL"
        }
    )
    
    # Create a test booking linked to the payment
    service = await db.service.find_first()
    booking = await db.booking.create(
        data={
            "userId": test_user_id,
            "serviceId": service.id,
            "paymentId": payment.id,
            "totalAmount": 1000.0,
            "paidAmount": 300.0,
            "remainingAmount": 700.0,
            "time": "2024-12-31T10:00:00Z",
            "status": "CONFIRMED"
        }
    )
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/payments/{payment.id}/pay-remaining",
            json={"transactionId": "TXN_REMAINING123"},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify response structure
    assert data["success"] is True
    assert data["message"] == "Remaining payment completed"
    assert "payment" in data
    
    # Verify payment details
    payment_data = data["payment"]
    assert payment_data["id"] == payment.id
    assert payment_data["paidAmount"] == 1000.0
    assert payment_data["remainingAmount"] == 0.0
    assert payment_data["status"] == "COMPLETED"
    assert payment_data["transactionId"] == "TXN_REMAINING123"
    assert payment_data["completedAt"] is not None
    
    # Verify booking was updated
    updated_booking = await db.booking.find_unique(where={"id": booking.id})
    assert updated_booking.paidAmount == 1000.0
    assert updated_booking.remainingAmount == 0.0
    
    # Cleanup
    await db.booking.delete(where={"id": booking.id})
    await db.payment.delete(where={"id": payment.id})


@pytest.mark.asyncio
async def test_pay_remaining_not_found(test_user_token):
    """Test remaining payment with non-existent payment ID."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/payments/non-existent-id/pay-remaining",
            json={"transactionId": "TXN_TEST123"},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
    
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_pay_remaining_no_remaining_amount(test_user_token, test_user_id):
    """Test remaining payment when there's no remaining amount."""
    # Create a fully paid payment record
    payment = await db.payment.create(
        data={
            "userId": test_user_id,
            "totalAmount": 500.0,
            "paidAmount": 500.0,
            "remainingAmount": 0.0,
            "status": "COMPLETED"
        }
    )
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/payments/{payment.id}/pay-remaining",
            json={"transactionId": "TXN_TEST123"},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
    
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "No remaining amount" in data["detail"]
    
    # Cleanup
    await db.payment.delete(where={"id": payment.id})


@pytest.mark.asyncio
async def test_pay_remaining_unauthorized():
    """Test remaining payment without authentication."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/payments/some-payment-id/pay-remaining",
            json={"transactionId": "TXN_TEST123"}
        )
    
    assert response.status_code == 403
