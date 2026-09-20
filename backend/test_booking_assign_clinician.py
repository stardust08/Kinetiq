"""
Manual endpoint testing script for PATCH /bookings/{id}/assign-clinician endpoint.

This script tests the clinician assignment endpoint by making HTTP requests
to a running FastAPI server. Run the server first with:
    uvicorn app.main:app --reload

Then run this script:
    python test_booking_assign_clinician.py
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


def get_auth_token(phone: str) -> Optional[str]:
    """Get authentication token by sending and verifying OTP."""
    print_test(f"Authentication Setup for {phone}")
    
    # Send OTP
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


def get_user_bookings(token: str) -> Optional[list]:
    """Get list of user's bookings."""
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(f"{BASE_URL}/bookings", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            bookings = data.get("data", [])
            return bookings
        else:
            return None
    except Exception:
        return None


def test_assign_clinician_as_admin(admin_token: str, booking_id: str, clinician_id: str):
    """Test PATCH /bookings/{id}/assign-clinician as admin."""
    print_test(f"PATCH /bookings/{booking_id}/assign-clinician - As Admin")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {"clinicianId": clinician_id}
    
    print_info(f"Request: PATCH {BASE_URL}/bookings/{booking_id}/assign-clinician")
    print_info(f"Headers: Authorization: Bearer {admin_token[:20]}...")
    print_info(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.patch(
            f"{BASE_URL}/bookings/{booking_id}/assign-clinician",
            headers=headers,
            json=payload
        )
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            booking = data.get("data")
            
            if booking and booking.get("clinicianId") == clinician_id:
                print_success(f"Clinician assigned successfully")
                print_info(f"  - Booking ID: {booking['id']}")
                print_info(f"  - Clinician ID: {booking['clinicianId']}")
                print_info(f"  - Status: {booking['status']}")
                return True
            else:
                print_error("Clinician ID not updated in booking")
                return False
        else:
            print_error(f"Failed with status {response.status_code}: {response.json()}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_assign_clinician_as_user(user_token: str, booking_id: str, clinician_id: str):
    """Test PATCH /bookings/{id}/assign-clinician as regular user (should fail)."""
    print_test(f"PATCH /bookings/{booking_id}/assign-clinician - As Regular User")
    
    headers = {"Authorization": f"Bearer {user_token}"}
    payload = {"clinicianId": clinician_id}
    
    print_info(f"Request: PATCH {BASE_URL}/bookings/{booking_id}/assign-clinician")
    print_info(f"Headers: Authorization: Bearer {user_token[:20]}...")
    print_info(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.patch(
            f"{BASE_URL}/bookings/{booking_id}/assign-clinician",
            headers=headers,
            json=payload
        )
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 403:
            print_success("Forbidden error returned as expected (admin access required)")
            return True
        else:
            print_error(f"Expected 403, got {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_assign_invalid_clinician(admin_token: str, booking_id: str):
    """Test PATCH /bookings/{id}/assign-clinician with invalid clinician ID."""
    print_test(f"PATCH /bookings/{booking_id}/assign-clinician - Invalid Clinician")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {"clinicianId": "non-existent-clinician-id"}
    
    print_info(f"Request: PATCH {BASE_URL}/bookings/{booking_id}/assign-clinician")
    print_info(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.patch(
            f"{BASE_URL}/bookings/{booking_id}/assign-clinician",
            headers=headers,
            json=payload
        )
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 400:
            print_success("Bad request error returned as expected")
            return True
        else:
            print_error(f"Expected 400, got {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_assign_clinician_no_auth(booking_id: str, clinician_id: str):
    """Test PATCH /bookings/{id}/assign-clinician without authentication."""
    print_test(f"PATCH /bookings/{booking_id}/assign-clinician - No Authentication")
    
    payload = {"clinicianId": clinician_id}
    
    print_info(f"Request: PATCH {BASE_URL}/bookings/{booking_id}/assign-clinician")
    print_info("Headers: (no Authorization header)")
    print_info(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.patch(
            f"{BASE_URL}/bookings/{booking_id}/assign-clinician",
            json=payload
        )
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


def main():
    """Run all endpoint tests."""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}PATCH /bookings/{{id}}/assign-clinician Endpoint Testing{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")
    print_info("Make sure the server is running: uvicorn app.main:app --reload")
    print_info("Testing against: " + BASE_URL)
    
    print_info("\nThis test requires:")
    print_info("1. An admin user account")
    print_info("2. A regular user account with bookings")
    print_info("3. A clinician user account")
    
    results = []
    
    # Get admin authentication token
    print_info("\n--- Admin Authentication ---")
    admin_phone = input(f"{YELLOW}Enter admin phone number: {RESET}")
    admin_token = get_auth_token(admin_phone)
    if not admin_token:
        print_error("Failed to authenticate admin. Cannot proceed with tests.")
        return
    
    # Get regular user authentication token
    print_info("\n--- Regular User Authentication ---")
    user_phone = input(f"{YELLOW}Enter regular user phone number: {RESET}")
    user_token = get_auth_token(user_phone)
    if not user_token:
        print_error("Failed to authenticate user. Cannot proceed with tests.")
        return
    
    # Get user's bookings
    print_info("\n--- Getting User Bookings ---")
    bookings = get_user_bookings(user_token)
    
    if not bookings or len(bookings) == 0:
        print_error("No bookings found for this user.")
        print_info("To test this endpoint, you need to:")
        print_info("1. Add items to cart")
        print_info("2. Complete checkout to create bookings")
        return
    
    booking_id = bookings[0]["id"]
    print_success(f"Found booking: {booking_id}")
    
    # Get clinician ID
    clinician_id = input(f"{YELLOW}Enter clinician user ID: {RESET}")
    
    # Test 1: Assign clinician as admin
    results.append(("Assign Clinician - As Admin", 
                   test_assign_clinician_as_admin(admin_token, booking_id, clinician_id)))
    
    # Test 2: Assign clinician as regular user (should fail)
    results.append(("Assign Clinician - As Regular User", 
                   test_assign_clinician_as_user(user_token, booking_id, clinician_id)))
    
    # Test 3: Assign invalid clinician
    results.append(("Assign Clinician - Invalid Clinician", 
                   test_assign_invalid_clinician(admin_token, booking_id)))
    
    # Test 4: Assign clinician without authentication
    results.append(("Assign Clinician - No Auth", 
                   test_assign_clinician_no_auth(booking_id, clinician_id)))
    
    # Print summary
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST SUMMARY{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")
    
    passed = sum(1 for _, result in results if result is True)
    failed = sum(1 for _, result in results if result is False)
    total = len(results)
    
    for name, result in results:
        status = f"{GREEN}PASSED{RESET}" if result else f"{RED}FAILED{RESET}"
        print(f"{name:.<50} {status}")
    
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"Passed: {passed}/{total}")
    print(f"Failed: {failed}/{total}")
    
    if failed == 0:
        print(f"{GREEN}All tests passed!{RESET}")
    else:
        print(f"{YELLOW}Some tests failed{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Testing interrupted by user{RESET}")
    except Exception as e:
        print(f"\n{RED}Unexpected error: {str(e)}{RESET}")
