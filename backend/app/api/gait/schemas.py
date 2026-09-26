"""Gait Analysis Pydantic schemas for request/response validation."""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime


class StartGaitRequest(BaseModel):
    bookingId: str = Field(..., description="Booking ID with remaining screening counts")
    screeningToken: Optional[str] = Field(
        None,
        description=(
            "One-shot authorisation minted when a clinician unlocks the capture in a "
            "video consultation. Required for a patient starting their own screening; "
            "ignored when a clinician or admin starts one."
        ),
    )
    patientId: Optional[str] = Field(
        None,
        description="Staff only: whose screening this is. Defaults to the booking owner.",
    )


class FinalizeGaitRequest(BaseModel):
    sessionId: str
    bookingId: str
    screeningToken: Optional[str] = Field(
        None,
        description=(
            "One-shot authorisation minted when a clinician unlocks the capture in a "
            "video consultation. Required for a patient starting their own screening; "
            "ignored when a clinician or admin starts one."
        ),
    )
    patientId: Optional[str] = Field(
        None,
        description="Staff only: whose screening this is. Defaults to the booking owner.",
    )
    gaitData: Dict[str, Any] = Field(
        ...,
        description="""
        {
          'views': {
            'front': {
              'timeSeries': [{'frameIndex': 0, 'landmarks': {'0': [x,y,z,v], ...}, 'timestamp': 0}],
              'backgroundImage': 'data:image/jpeg;base64,...',
              'frameCount': 150
            },
            'leftside': { ... },
            'rightside': { ... }
          },
          'totalFrames': 450,
          'capturedViews': 'front,leftside,rightside',
          'fps': 30
        }
        """
    )


class CancelGaitRequest(BaseModel):
    sessionId: str
