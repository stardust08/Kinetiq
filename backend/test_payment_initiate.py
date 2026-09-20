"""
Test for POST /payments/initiate endpoint.

This test verifies that the payment initiation endpoint works correctly
by creating a payment record and initiating it through the payment gateway.
"""

import pytest
from httpx import AsyncClient
from app.main import app
from app.db.client import db
from datetime import datetime


@pytest.mark.asyncio
async def test_initiate_payment_success(test_user_token, test_user_id):
    """Test successful payment initiation."""
    # Create a test payment record
    payment = await db.payment.create(
        data={
            "userId": test_user_id,
            "totalAmount": 500.0,
            "paidAmount": 500.0,
            "remainingAmount": 0.0,
            "status": "PENDING"
        }
    )
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/payments/initiate",
            json={"paymentId": payment.id},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
    
    assert response.status_code == 200
    response_json = response.json()
    data = response_json["data"]
    
    # Verify response structure
    assert "paymentId" in data
    assert "amount" in data
    assert "transactionId" in data
    assert "gatewayUrl" in data
    
    # Verify values
    assert data["paymentId"] == payment.id
    assert data["amount"] == 500.0
    assert data["transactionId"].startswith("TXN_")
    assert data["gatewayUrl"] == "https://mock-gateway.com/pay"
    
    # Cleanup
    await db.payment.delete(where={"id": payment.id})


@pytest.mark.asyncio
async def test_initiate_payment_not_found(test_user_token):
    """Test payment initiation with non-existent payment ID."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/payments/initiate",
            json={"paymentId": "non-existent-payment-id"},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
    
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_initiate_payment_unauthorized():
    """Test payment initiation without authentication."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/payments/initiate",
            json={"paymentId": "some-payment-id"}
        )
    
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_initiate_payment_partial_payment(test_user_token, test_user_id):
    """Test payment initiation for partial payment."""
    # Create a test payment record with partial payment
    payment = await db.payment.create(
        data={
            "userId": test_user_id,
            "totalAmount": 1000.0,
            "paidAmount": 300.0,
            "remainingAmount": 700.0,
            "status": "PENDING"
        }
    )
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/payments/initiate",
            json={"paymentId": payment.id},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
    
    assert response.status_code == 200
    response_json = response.json()
    data = response_json["data"]
    
    # Verify that paidAmount is returned (not totalAmount)
    assert data["amount"] == 300.0
    assert data["paymentId"] == payment.id
    
    # Cleanup
    await db.payment.delete(where={"id": payment.id})
