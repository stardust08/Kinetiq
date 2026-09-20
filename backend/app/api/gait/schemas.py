"""Gait Analysis Pydantic schemas for request/response validation."""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime


class StartGaitRequest(BaseModel):
    bookingId: str = Field(..., description="Booking ID with remaining screening counts")


class FinalizeGaitRequest(BaseModel):
    sessionId: str
    bookingId: str
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
