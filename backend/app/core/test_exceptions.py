"""
Unit tests for custom exception classes.
"""
import pytest
from app.core.exceptions import (
    AppException,
    BadRequestException,
    NotFoundException,
    UnauthorizedException,
)


class TestAppException:
    """Test cases for the base AppException class."""
    
    def test_app_exception_default_status_code(self):
        """Test that AppException defaults to status code 500."""
        exc = AppException("Something went wrong")
        assert exc.message == "Something went wrong"
        assert exc.status_code == 500
        assert str(exc) == "Something went wrong"
    
    def test_app_exception_custom_status_code(self):
        """Test that AppException accepts custom status codes."""
        exc = AppException("Custom error", 503)
        assert exc.message == "Custom error"
        assert exc.status_code == 503
    
    def test_app_exception_is_exception(self):
        """Test that AppException is an instance of Exception."""
        exc = AppException("Error")
        assert isinstance(exc, Exception)


class TestBadRequestException:
    """Test cases for BadRequestException."""
    
    def test_bad_request_exception_status_code(self):
        """Test that BadRequestException has status code 400."""
        exc = BadRequestException("Invalid input")
        assert exc.message == "Invalid input"
        assert exc.status_code == 400
    
    def test_bad_request_exception_inheritance(self):
        """Test that BadRequestException inherits from AppException."""
        exc = BadRequestException("Invalid input")
        assert isinstance(exc, AppException)
        assert isinstance(exc, Exception)


class TestNotFoundException:
    """Test cases for NotFoundException."""
    
    def test_not_found_exception_status_code(self):
        """Test that NotFoundException has status code 404."""
        exc = NotFoundException("Resource not found")
        assert exc.message == "Resource not found"
        assert exc.status_code == 404
    
    def test_not_found_exception_inheritance(self):
        """Test that NotFoundException inherits from AppException."""
        exc = NotFoundException("Not found")
        assert isinstance(exc, AppException)
        assert isinstance(exc, Exception)


class TestUnauthorizedException:
    """Test cases for UnauthorizedException."""
    
    def test_unauthorized_exception_status_code(self):
        """Test that UnauthorizedException has status code 401."""
        exc = UnauthorizedException("Access denied")
        assert exc.message == "Access denied"
        assert exc.status_code == 401
    
    def test_unauthorized_exception_inheritance(self):
        """Test that UnauthorizedException inherits from AppException."""
        exc = UnauthorizedException("Unauthorized")
        assert isinstance(exc, AppException)
        assert isinstance(exc, Exception)


class TestExceptionRaising:
    """Test cases for raising and catching exceptions."""
    
    def test_raise_bad_request_exception(self):
        """Test that BadRequestException can be raised and caught."""
        with pytest.raises(BadRequestException) as exc_info:
            raise BadRequestException("Invalid data")
        
        assert exc_info.value.message == "Invalid data"
        assert exc_info.value.status_code == 400
    
    def test_raise_not_found_exception(self):
        """Test that NotFoundException can be raised and caught."""
        with pytest.raises(NotFoundException) as exc_info:
            raise NotFoundException("User not found")
        
        assert exc_info.value.message == "User not found"
        assert exc_info.value.status_code == 404
    
    def test_raise_unauthorized_exception(self):
        """Test that UnauthorizedException can be raised and caught."""
        with pytest.raises(UnauthorizedException) as exc_info:
            raise UnauthorizedException("Invalid token")
        
        assert exc_info.value.message == "Invalid token"
        assert exc_info.value.status_code == 401
    
    def test_catch_as_app_exception(self):
        """Test that custom exceptions can be caught as AppException."""
        with pytest.raises(AppException) as exc_info:
            raise BadRequestException("Bad request")
        
        assert exc_info.value.status_code == 400
    
    def test_catch_as_base_exception(self):
        """Test that custom exceptions can be caught as base Exception."""
        with pytest.raises(Exception) as exc_info:
            raise NotFoundException("Not found")
        
        assert isinstance(exc_info.value, AppException)
