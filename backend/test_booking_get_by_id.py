"""
Manual endpoint testing script for GET /bookings/{id} endpoint.

This script tests the booking details endpoint by making HTTP requests
to a running FastAPI server. Run the server first with:
    uvicorn app.main:app --reload

Then run this script:
    python test_booking_get_by_id.py
"""

import requests
import json
from typing import Optional

# Base URL for the API
BASE_URL = "http://localhost:8000/api"

# Colors for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"


def print_test(name: str):
    """Print test name."""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST: {name}{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")


def print_success(message: str):
    """Print success message."""
    print(f"{GREEN}✓ {message}{RESET}")


def print_error(message: str):
    """Print error message."""
    print(f"{RED}✗ {message}{RESET}")


def print_info(message: str):
    """Print info message."""
    print(f"{YELLOW}ℹ {message}{RESET}")


def get_auth_token() -> Optional[str]:
    """Get authentication token by sending and verifying OTP."""
    print_test("Authentication Setup")
    
    # Send OTP
    phone = "+1234567890"
    payload = {"phone": phone, "type": "LOGIN"}
    
    print_info(f"Sending OTP to {phone}...")
    response = requests.post(f"{BASE_URL}/auth/send-otp", json=payload)
    
    if response.status_code != 200:
        print_error(f"Failed to send OTP: {response.json()}")
        return None
    
    print_success("OTP sent successfully")
    print_info("Check the server console for the OTP code")
    otp = input(f"{YELLOW}Enter the OTP from server console: {RESET}")
    
    # Verify OTP
    verify_payload = {"phone": phone, "otp": otp}
    response = requests.post(f"{BASE_URL}/auth/verify-otp", json=verify_payload)
    
    if response.status_code != 200:
        print_error(f"Failed to verify OTP: {response.json()}")
        return None
    
    data = response.json()
    token = data.get("token")
    
    if token:
        print_success("Authentication successful")
        return token
    else:
        print_error("No token in response")
        return None


def test_get_booking_details(token: str, booking_id: str):
    """Test GET /bookings/{id} endpoint."""
    print_test(f"GET /bookings/{booking_id} - Get Booking Details")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    print_info(f"Request: GET {BASE_URL}/bookings/{booking_id}")
    print_info(f"Headers: Authorization: Bearer {token[:20]}...")
    
    try:
        response = requests.get(f"{BASE_URL}/bookings/{booking_id}", headers=headers)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            booking = data.get("data")
            
            if booking:
                # Verify booking structure
                required_fields = ["id", "userId", "serviceId", "paymentId", 
                                 "totalAmount", "paidAmount", "remainingAmount",
                                 "time", "status", "service", "payment"]
                
                missing_fields = [field for field in required_fields if field not in booking]
                
                if missing_fields:
                    print_error(f"Missing required fields: {missing_fields}")
                    return False
                
                # Verify service details
                if "service" in booking:
                    service = booking["service"]
                    print_success(f"Service: {service.get('name', 'N/A')}")
                    print_info(f"  - Base Price: ${service.get('basePrice', 0)}")
                    print_info(f"  - Payment Type: {service.get('paymentType', 'N/A')}")
                
                # Verify payment details
                if "payment" in booking:
                    payment = booking["payment"]
                    print_success(f"Payment Status: {payment.get('status', 'N/A')}")
                    print_info(f"  - Total: ${payment.get('totalAmount', 0)}")
                    print_info(f"  - Paid: ${payment.get('paidAmount', 0)}")
                    print_info(f"  - Remaining: ${payment.get('remainingAmount', 0)}")
                
                # Verify booking details
                print_success(f"Booking Status: {booking.get('status', 'N/A')}")
                print_info(f"  - Total Amount: ${booking.get('totalAmount', 0)}")
                print_info(f"  - Paid Amount: ${booking.get('paidAmount', 0)}")
                print_info(f"  - Remaining Amount: ${booking.get('remainingAmount', 0)}")
                print_info(f"  - Scheduled Time: {booking.get('time', 'N/A')}")
                
                if booking.get("clinicianId"):
                    print_info(f"  - Clinician ID: {booking['clinicianId']}")
                else:
                    print_info("  - Clinician: Not assigned")
                
                print_success("Booking details retrieved successfully")
                return True
            else:
                print_error("No booking data in response")
                return False
        else:
            print_error(f"Failed with status {response.status_code}: {response.json()}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_get_booking_not_found(token: str):
    """Test GET /bookings/{id} with non-existent booking ID."""
    print_test("GET /bookings/{id} - Non-existent Booking")
    
    fake_id = "non-existent-booking-id"
    headers = {"Authorization": f"Bearer {token}"}
    
    print_info(f"Request: GET {BASE_URL}/bookings/{fake_id}")
    
    try:
        response = requests.get(f"{BASE_URL}/bookings/{fake_id}", headers=headers)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("data") is None:
                print_success("Returns null for non-existent booking as expected")
                return True
            else:
                print_error("Expected null data for non-existent booking")
                return False
        else:
            print_error(f"Unexpected status code: {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_get_booking_no_auth():
    """Test GET /bookings/{id} without authentication."""
    print_test("GET /bookings/{id} - No Authentication")
    
    booking_id = "some-booking-id"
    
    print_info(f"Request: GET {BASE_URL}/bookings/{booking_id}")
    print_info("Headers: (no Authorization header)")
    
    try:
        response = requests.get(f"{BASE_URL}/bookings/{booking_id}")
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 403:
            print_success("Forbidden error returned as expected")
            return True
        else:
            print_error(f"Expected 403, got {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def get_user_bookings(token: str) -> Optional[list]:
    """Get list of user's bookings."""
    print_test("GET /bookings - Get User Bookings")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    print_info(f"Request: GET {BASE_URL}/bookings")
    
    try:
        response = requests.get(f"{BASE_URL}/bookings", headers=headers)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            bookings = data.get("data", [])
            print_success(f"Found {len(bookings)} booking(s)")
            return bookings
        else:
            print_error(f"Failed to get bookings: {response.json()}")
            return None
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return None


def main():
    """Run all endpoint tests."""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}GET /bookings/{{id}} Endpoint Testing{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")
    print_info("Make sure the server is running: uvicorn app.main:app --reload")
    print_info("Testing against: " + BASE_URL)
    
    results = []
    
    # Get authentication token
    token = get_auth_token()
    if not token:
        print_error("Failed to authenticate. Cannot proceed with tests.")
        return
    
    # Test 1: Get user's bookings to find a valid booking ID
    bookings = get_user_bookings(token)
    
    if bookings and len(bookings) > 0:
        # Test 2: Get booking details with valid ID
        booking_id = bookings[0]["id"]
        results.append(("Get Booking Details - Valid ID", 
                       test_get_booking_details(token, booking_id)))
    else:
        print_info("\nNo bookings found for this user.")
        print_info("To test this endpoint, you need to:")
        print_info("1. Add items to cart")
        print_info("2. Complete checkout to create bookings")
        print_info("\nSkipping valid booking ID test...")
        results.append(("Get Booking Details - Valid ID", None))
    
    # Test 3: Get booking with non-existent ID
    results.append(("Get Booking Details - Non-existent ID", 
                   test_get_booking_not_found(token)))
    
    # Test 4: Get booking without authentication
    results.append(("Get Booking Details - No Auth", 
                   test_get_booking_no_auth()))
    
    # Print summary
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST SUMMARY{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")
    
    passed = sum(1 for _, result in results if result is True)
    skipped = sum(1 for _, result in results if result is None)
    failed = sum(1 for _, result in results if result is False)
    total = len(results)
    
    for name, result in results:
        if result is True:
            status = f"{GREEN}PASSED{RESET}"
        elif result is None:
            status = f"{YELLOW}SKIPPED{RESET}"
        else:
            status = f"{RED}FAILED{RESET}"
        print(f"{name:.<50} {status}")
    
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"Passed: {passed}/{total}")
    print(f"Failed: {failed}/{total}")
    print(f"Skipped: {skipped}/{total}")
    
    if failed == 0 and passed > 0:
        print(f"{GREEN}All executed tests passed!{RESET}")
    elif failed > 0:
        print(f"{YELLOW}Some tests failed{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Testing interrupted by user{RESET}")
    except Exception as e:
        print(f"\n{RED}Unexpected error: {str(e)}{RESET}")
