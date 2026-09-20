"""
Integration tests for Module 5: Booking & Payment System.

This test suite verifies the complete booking and payment flow including:
- Full payment checkout
- Partial payment checkout
- Payment verification
- Remaining payment
- Booking list and details
- Clinician assignment
- Error handling
"""

import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timedelta
from app.main import app
from app.db.client import db
from app.core.security import TokenService


@pytest.fixture
async def admin_user():
    """Create an admin user for testing."""
    import uuid
    admin = await db.user.create(
        data={
            "phone": f"+admin{uuid.uuid4().hex[:8]}",
            "name": "Admin User",
            "role": "ADMIN"
        }
    )
    yield admin
    try:
        await db.user.delete(where={"id": admin.id})
    except:
        pass


@pytest.fixture
def admin_token(admin_user):
    """Generate admin token."""
    return TokenService.create_access_token(admin_user.id, "ADMIN")


@pytest.fixture
async def clinician_user():
    """Create a clinician user for testing."""
    import uuid
    clinician = await db.user.create(
        data={
            "phone": f"+clinician{uuid.uuid4().hex[:8]}",
            "name": "Clinician User",
            "role": "CLINICIAN"
        }
    )
    yield clinician
    try:
        await db.user.delete(where={"id": clinician.id})
    except:
        pass


@pytest.fixture
async def test_service_full():
    """Create a test service with FULL payment type."""
    import uuid
    category = await db.category.create(
        data={
            "name": "Test Category Full",
            "slug": f"test-cat-full-{uuid.uuid4().hex[:8]}",
            "description": "Test category"
        }
    )
    
    service = await db.service.create(
        data={
            "name": "Full Payment Service",
            "slug": f"full-service-{uuid.uuid4().hex[:8]}",
            "description": "Service with full payment",
            "basePrice": 500.0,
            "paymentType": "FULL",
            "categoryId": category.id
        }
    )
    
    yield service
    
    try:
        await db.service.delete(where={"id": service.id})
        await db.category.delete(where={"id": category.id})
    except:
        pass


@pytest.fixture
async def test_service_partial():
    """Create a test service with PARTIAL payment type."""
    import uuid
    category = await db.category.create(
        data={
            "name": "Test Category Partial",
            "slug": f"test-cat-partial-{uuid.uuid4().hex[:8]}",
            "description": "Test category"
        }
    )
    
    service = await db.service.create(
        data={
            "name": "Partial Payment Service",
            "slug": f"partial-service-{uuid.uuid4().hex[:8]}",
            "description": "Service with partial payment",
            "basePrice": 400.0,
            "paymentType": "PARTIAL",
            "advancePercent": 50.0,
            "categoryId": category.id
        }
    )
    
    yield service
    
    try:
        await db.service.delete(where={"id": service.id})
        await db.category.delete(where={"id": category.id})
    except:
        pass


# Task 7.1: Test full payment checkout
@pytest.mark.asyncio
async def test_full_payment_checkout(test_user_token, test_user_id, test_service_full):
    """Test complete full payment checkout flow."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", follow_redirects=True) as client:
        # Add service to cart
        add_response = await client.post(
            "/api/cart/items",
            json={"serviceId": test_service_full.id, "quantity": 1},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        assert add_response.status_code == 200
        
        # Checkout
        scheduled_time = (datetime.utcnow() + timedelta(days=7)).isoformat()
        checkout_response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        assert checkout_response.status_code == 200
        data = checkout_response.json()["data"]
        
        # Verify payment details
        assert data["payment"]["totalAmount"] == 500.0
        assert data["payment"]["paidAmount"] == 500.0
        assert data["payment"]["remainingAmount"] == 0.0
        assert data["payment"]["status"] == "PENDING"
        
        # Verify bookings
        assert len(data["bookings"]) == 1
        booking = data["bookings"][0]
        assert booking["totalAmount"] == 500.0
        assert booking["paidAmount"] == 500.0
        assert booking["remainingAmount"] == 0.0
        
        # Verify payment gateway details
        assert "paymentDetails" in data
        assert data["paymentDetails"]["amount"] == 500.0
        
        # Verify payment
        payment_id = data["payment"]["id"]
        transaction_id = data["paymentDetails"]["transactionId"]
        
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
        
        # Verify payment status updated
        payment = await db.payment.find_unique(where={"id": payment_id})
        assert payment.status == "COMPLETED"
        assert payment.completedAt is not None
        
        # Verify booking status
        booking_record = await db.booking.find_first(where={"paymentId": payment_id})
        assert booking_record.status == "CONFIRMED"
        
        # Cleanup
        await db.booking.delete(where={"id": booking_record.id})
        await db.payment.delete(where={"id": payment_id})


# Task 7.2: Test partial payment checkout
@pytest.mark.asyncio
async def test_partial_payment_checkout(test_user_token, test_user_id, test_service_partial):
    """Test complete partial payment checkout flow."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", follow_redirects=True) as client:
        # Add service to cart
        add_response = await client.post(
            "/api/cart/items",
            json={"serviceId": test_service_partial.id, "quantity": 1},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        assert add_response.status_code == 200
        
        # Checkout
        scheduled_time = (datetime.utcnow() + timedelta(days=7)).isoformat()
        checkout_response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        assert checkout_response.status_code == 200
        data = checkout_response.json()["data"]
        
        # Verify payment details for partial payment
        assert data["payment"]["totalAmount"] == 400.0
        assert data["payment"]["paidAmount"] == 200.0  # 50% advance
        assert data["payment"]["remainingAmount"] == 200.0
        assert data["payment"]["status"] == "PENDING"
        
        # Verify bookings
        assert len(data["bookings"]) == 1
        booking = data["bookings"][0]
        assert booking["totalAmount"] == 400.0
        assert booking["paidAmount"] == 200.0
        assert booking["remainingAmount"] == 200.0
        
        # Verify payment
        payment_id = data["payment"]["id"]
        transaction_id = data["paymentDetails"]["transactionId"]
        
        verify_response = await client.post(
            "/api/payments/verify",
            json={
                "paymentId": payment_id,
                "transactionId": transaction_id,
                "status": "success"
            }
        )
        
        assert verify_response.status_code == 200
        
        # Verify payment status is PARTIAL (not COMPLETED)
        payment = await db.payment.find_unique(where={"id": payment_id})
        assert payment.status == "PARTIAL"
        assert payment.completedAt is None
        
        # Cleanup
        booking_record = await db.booking.find_first(where={"paymentId": payment_id})
        await db.booking.delete(where={"id": booking_record.id})
        await db.payment.delete(where={"id": payment_id})


# Task 7.3: Test payment verification
@pytest.mark.asyncio
async def test_payment_verification_failure(test_user_token, test_user_id, test_service_full):
    """Test payment verification with failed status."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", follow_redirects=True) as client:
        # Add service and checkout
        await client.post(
            "/api/cart/items",
            json={"serviceId": test_service_full.id, "quantity": 1},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        scheduled_time = (datetime.utcnow() + timedelta(days=7)).isoformat()
        checkout_response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        data = checkout_response.json()["data"]
        payment_id = data["payment"]["id"]
        transaction_id = data["paymentDetails"]["transactionId"]
        
        # Verify with failed status
        verify_response = await client.post(
            "/api/payments/verify",
            json={
                "paymentId": payment_id,
                "transactionId": transaction_id,
                "status": "failed"
            }
        )
        
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data["success"] is False
        
        # Verify payment status is FAILED
        payment = await db.payment.find_unique(where={"id": payment_id})
        assert payment.status == "FAILED"
        
        # Cleanup
        booking_record = await db.booking.find_first(where={"paymentId": payment_id})
        await db.booking.delete(where={"id": booking_record.id})
        await db.payment.delete(where={"id": payment_id})


# Task 7.4: Test remaining payment
@pytest.mark.asyncio
async def test_remaining_payment(test_user_token, test_user_id, test_service_partial):
    """Test paying remaining amount for partial payment."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", follow_redirects=True) as client:
        # Setup: Create partial payment booking
        await client.post(
            "/api/cart/items",
            json={"serviceId": test_service_partial.id, "quantity": 1},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        scheduled_time = (datetime.utcnow() + timedelta(days=7)).isoformat()
        checkout_response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        data = checkout_response.json()["data"]
        payment_id = data["payment"]["id"]
        
        # Verify initial payment
        await client.post(
            "/api/payments/verify",
            json={
                "paymentId": payment_id,
                "transactionId": data["paymentDetails"]["transactionId"],
                "status": "success"
            }
        )
        
        # Pay remaining amount
        remaining_response = await client.post(
            f"/api/payments/{payment_id}/pay-remaining",
            json={"transactionId": "TXN_REMAINING_123"},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        assert remaining_response.status_code == 200
        remaining_data = remaining_response.json()
        assert remaining_data["success"] is True
        
        # Verify payment is now COMPLETED
        payment = await db.payment.find_unique(where={"id": payment_id})
        assert payment.status == "COMPLETED"
        assert payment.paidAmount == 400.0
        assert payment.remainingAmount == 0.0
        assert payment.completedAt is not None
        
        # Cleanup
        booking_record = await db.booking.find_first(where={"paymentId": payment_id})
        await db.booking.delete(where={"id": booking_record.id})
        await db.payment.delete(where={"id": payment_id})


# Task 7.5: Test booking list
@pytest.mark.asyncio
async def test_booking_list(test_user_token, test_user_id, test_service_full):
    """Test retrieving user's booking list."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", follow_redirects=True) as client:
        # Create a booking
        await client.post(
            "/api/cart/items",
            json={"serviceId": test_service_full.id, "quantity": 1},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        scheduled_time = (datetime.utcnow() + timedelta(days=7)).isoformat()
        checkout_response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        data = checkout_response.json()["data"]
        payment_id = data["payment"]["id"]
        
        # Get booking list
        list_response = await client.get(
            "/api/bookings",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        assert list_response.status_code == 200
        bookings = list_response.json()["data"]
        assert len(bookings) > 0
        
        # Verify booking details in list
        booking = bookings[0]
        assert "id" in booking
        assert "service" in booking
        assert "payment" in booking
        assert booking["totalAmount"] == 500.0
        
        # Cleanup
        booking_record = await db.booking.find_first(where={"paymentId": payment_id})
        await db.booking.delete(where={"id": booking_record.id})
        await db.payment.delete(where={"id": payment_id})


# Task 7.6: Test booking details
@pytest.mark.asyncio
async def test_booking_details(test_user_token, test_user_id, test_service_full):
    """Test retrieving specific booking details."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", follow_redirects=True) as client:
        # Create a booking
        await client.post(
            "/api/cart/items",
            json={"serviceId": test_service_full.id, "quantity": 1},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        scheduled_time = (datetime.utcnow() + timedelta(days=7)).isoformat()
        checkout_response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        data = checkout_response.json()["data"]
        booking_id = data["bookings"][0]["id"]
        payment_id = data["payment"]["id"]
        
        # Get booking details
        details_response = await client.get(
            f"/api/bookings/{booking_id}",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        assert details_response.status_code == 200
        booking = details_response.json()["data"]
        assert booking["id"] == booking_id
        assert "service" in booking
        assert "payment" in booking
        assert booking["service"]["name"] == "Full Payment Service"
        
        # Cleanup
        await db.booking.delete(where={"id": booking_id})
        await db.payment.delete(where={"id": payment_id})


# Task 7.7: Test clinician assignment
@pytest.mark.asyncio
async def test_clinician_assignment(admin_token, test_user_token, test_user_id, test_service_full, clinician_user):
    """Test assigning clinician to booking (admin only)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", follow_redirects=True) as client:
        # Create a booking
        await client.post(
            "/api/cart/items",
            json={"serviceId": test_service_full.id, "quantity": 1},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        scheduled_time = (datetime.utcnow() + timedelta(days=7)).isoformat()
        checkout_response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        
        data = checkout_response.json()["data"]
        booking_id = data["bookings"][0]["id"]
        payment_id = data["payment"]["id"]
        
        # Assign clinician (as admin)
        assign_response = await client.patch(
            f"/api/bookings/{booking_id}/assign-clinician",
            json={"clinicianId": clinician_user.id},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert assign_response.status_code == 200
        updated_booking = assign_response.json()["data"]
        assert updated_booking["clinicianId"] == clinician_user.id
        
        # Verify non-admin cannot assign
        assign_fail_response = await client.patch(
            f"/api/bookings/{booking_id}/assign-clinician",
            json={"clinicianId": clinician_user.id},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        assert assign_fail_response.status_code == 403
        
        # Cleanup
        await db.booking.delete(where={"id": booking_id})
        await db.payment.delete(where={"id": payment_id})


# Task 7.8: Test error cases
@pytest.mark.asyncio
async def test_error_cases(test_user_token, test_user_id):
    """Test various error scenarios."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", follow_redirects=True) as client:
        # Test checkout with empty cart
        scheduled_time = (datetime.utcnow() + timedelta(days=7)).isoformat()
        empty_cart_response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        assert empty_cart_response.status_code == 400
        response_json = empty_cart_response.json()
        assert "Cart is empty" in (response_json.get("detail") or response_json.get("message") or str(response_json))
        
        # Test checkout without authentication
        no_auth_response = await client.post(
            "/api/bookings/checkout",
            json={"scheduledTime": scheduled_time}
        )
        assert no_auth_response.status_code == 401
        
        # Test payment verification with invalid payment ID
        verify_invalid_response = await client.post(
            "/api/payments/verify",
            json={
                "paymentId": "invalid-id",
                "transactionId": "TXN_123",
                "status": "success"
            }
        )
        assert verify_invalid_response.status_code == 404
        
        # Test remaining payment with no remaining amount
        payment = await db.payment.create(
            data={
                "userId": test_user_id,
                "totalAmount": 100.0,
                "paidAmount": 100.0,
                "remainingAmount": 0.0,
                "status": "COMPLETED"
            }
        )
        
        no_remaining_response = await client.post(
            f"/api/payments/{payment.id}/pay-remaining",
            json={"transactionId": "TXN_123"},
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        assert no_remaining_response.status_code == 400
        
        # Cleanup
        await db.payment.delete(where={"id": payment.id})
