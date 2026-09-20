"""
Posture Analysis API module.

This module provides endpoints for clinical posture analysis with
booking-based screening count management.
"""

from app.api.posture.routes import posture_router

__all__ = ["posture_router"]
