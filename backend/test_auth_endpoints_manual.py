"""
Manual endpoint testing script for authentication endpoints.

This script tests all authentication endpoints by making HTTP requests
to a running FastAPI server. Run the server first with:
    uvicorn app.main:app --reload

Then run this script:
    python test_auth_endpoints_manual.py
"""

import requests
import json
import time
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


def test_send_otp():
    """Test POST /auth/send-otp endpoint."""
    print_test("POST /auth/send-otp - Send OTP")
    
    # Test with valid phone number
    payload = {
        "phone": "+1234567890",
        "type": "LOGIN"
    }
    
    print_info(f"Request: POST {BASE_URL}/auth/send-otp")
    print_info(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(f"{BASE_URL}/auth/send-otp", json=payload)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("message") == "OTP sent successfully":
                print_success("OTP sent successfully")
                return True
            else:
                print_error(f"Unexpected response: {data}")
                return False
        else:
            print_error(f"Failed with status {response.status_code}: {response.json()}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_send_otp_invalid_phone():
    """Test POST /auth/send-otp with invalid phone."""
    print_test("POST /auth/send-otp - Invalid Phone Format")
    
    payload = {
        "phone": "invalid",
        "type": "LOGIN"
    }
    
    print_info(f"Request: POST {BASE_URL}/auth/send-otp")
    print_info(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(f"{BASE_URL}/auth/send-otp", json=payload)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 422:
            print_success("Validation error returned as expected")
            return True
        else:
            print_error(f"Expected 422, got {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_verify_otp(phone: str, otp: str) -> Optional[dict]:
    """Test POST /auth/verify-otp endpoint."""
    print_test("POST /auth/verify-otp - Verify OTP")
    
    payload = {
        "phone": phone,
        "otp": otp
    }
    
    print_info(f"Request: POST {BASE_URL}/auth/verify-otp")
    print_info(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(f"{BASE_URL}/auth/verify-otp", json=payload)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                print_success("OTP verified successfully, token received")
                return data
            else:
                print_error(f"Missing token or user in response: {data}")
                return None
        else:
            print_error(f"Failed with status {response.status_code}: {response.json()}")
            return None
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return None


def test_verify_otp_invalid():
    """Test POST /auth/verify-otp with invalid OTP."""
    print_test("POST /auth/verify-otp - Invalid OTP")
    
    payload = {
        "phone": "+1234567890",
        "otp": "999999"
    }
    
    print_info(f"Request: POST {BASE_URL}/auth/verify-otp")
    print_info(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(f"{BASE_URL}/auth/verify-otp", json=payload)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 401:
            print_success("Unauthorized error returned as expected")
            return True
        else:
            print_error(f"Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_get_me(token: str):
    """Test GET /auth/me endpoint."""
    print_test("GET /auth/me - Get Current User")
    
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    print_info(f"Request: GET {BASE_URL}/auth/me")
    print_info(f"Headers: Authorization: Bearer {token[:20]}...")
    
    try:
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            if "id" in data and "phone" in data and "role" in data:
                print_success("User info retrieved successfully")
                return True
            else:
                print_error(f"Missing required fields in response: {data}")
                return False
        else:
            print_error(f"Failed with status {response.status_code}: {response.json()}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_get_me_no_token():
    """Test GET /auth/me without token."""
    print_test("GET /auth/me - No Token")
    
    print_info(f"Request: GET {BASE_URL}/auth/me")
    print_info("Headers: (no Authorization header)")
    
    try:
        response = requests.get(f"{BASE_URL}/auth/me")
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 403:  # HTTPBearer returns 403 when no credentials
            print_success("Forbidden error returned as expected")
            return True
        else:
            print_error(f"Expected 403, got {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_get_me_invalid_token():
    """Test GET /auth/me with invalid token."""
    print_test("GET /auth/me - Invalid Token")
    
    headers = {
        "Authorization": "Bearer invalid_token_12345"
    }
    
    print_info(f"Request: GET {BASE_URL}/auth/me")
    print_info("Headers: Authorization: Bearer invalid_token_12345")
    
    try:
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 401:
            print_success("Unauthorized error returned as expected")
            return True
        else:
            print_error(f"Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_logout(token: str):
    """Test POST /auth/logout endpoint."""
    print_test("POST /auth/logout - Logout")
    
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    print_info(f"Request: POST {BASE_URL}/auth/logout")
    print_info(f"Headers: Authorization: Bearer {token[:20]}...")
    
    try:
        response = requests.post(f"{BASE_URL}/auth/logout", headers=headers)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("message") == "Logged out successfully":
                print_success("Logout successful")
                return True
            else:
                print_error(f"Unexpected response: {data}")
                return False
        else:
            print_error(f"Failed with status {response.status_code}: {response.json()}")
            return False
    except Exception as e:
        print_error(f"Exception occurred: {str(e)}")
        return False


def test_logout_no_token():
    """Test POST /auth/logout without token."""
    print_test("POST /auth/logout - No Token")
    
    print_info(f"Request: POST {BASE_URL}/auth/logout")
    print_info("Headers: (no Authorization header)")
    
    try:
        response = requests.post(f"{BASE_URL}/auth/logout")
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 403:  # HTTPBearer returns 403 when no credentials
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
    print(f"{BLUE}Authentication Endpoints Manual Testing{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")
    print_info("Make sure the server is running: uvicorn app.main:app --reload")
    print_info("Testing against: " + BASE_URL)
    
    results = []
    token = None
    
    # Test 1: Send OTP
    results.append(("Send OTP", test_send_otp()))
    
    # Wait a bit to avoid rate limiting
    time.sleep(2)
    
    # Test 2: Send OTP with invalid phone
    results.append(("Send OTP - Invalid Phone", test_send_otp_invalid_phone()))
    
    # Test 3: Verify OTP with invalid code
    results.append(("Verify OTP - Invalid", test_verify_otp_invalid()))
    
    # Test 4: Get OTP from console and verify
    print_info("\n" + "="*60)
    print_info("Check the server console for the OTP code")
    print_info("The OTP should be printed like: [DEV] OTP for +1234567890: 123456")
    otp = input(f"{YELLOW}Enter the OTP from server console: {RESET}")
    
    auth_data = test_verify_otp("+1234567890", otp)
    if auth_data:
        results.append(("Verify OTP", True))
        token = auth_data.get("token")
    else:
        results.append(("Verify OTP", False))
    
    # Test 5: Get current user with valid token
    if token:
        results.append(("Get Me - Valid Token", test_get_me(token)))
    else:
        print_error("Skipping Get Me test - no token available")
        results.append(("Get Me - Valid Token", False))
    
    # Test 6: Get current user without token
    results.append(("Get Me - No Token", test_get_me_no_token()))
    
    # Test 7: Get current user with invalid token
    results.append(("Get Me - Invalid Token", test_get_me_invalid_token()))
    
    # Test 8: Logout with valid token
    if token:
        results.append(("Logout - Valid Token", test_logout(token)))
    else:
        print_error("Skipping Logout test - no token available")
        results.append(("Logout - Valid Token", False))
    
    # Test 9: Logout without token
    results.append(("Logout - No Token", test_logout_no_token()))
    
    # Print summary
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}TEST SUMMARY{RESET}")
    print(f"{BLUE}{'='*60}{RESET}")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = f"{GREEN}PASSED{RESET}" if result else f"{RED}FAILED{RESET}"
        print(f"{name:.<50} {status}")
    
    print(f"\n{BLUE}{'='*60}{RESET}")
    if passed == total:
        print(f"{GREEN}All tests passed! ({passed}/{total}){RESET}")
    else:
        print(f"{YELLOW}Some tests failed: {passed}/{total} passed{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Testing interrupted by user{RESET}")
    except Exception as e:
        print(f"\n{RED}Unexpected error: {str(e)}{RESET}")
