"""Range-of-motion API schemas."""

from typing import Any, Dict

from pydantic import BaseModel, Field


class StartROMRequest(BaseModel):
    bookingId: str = Field(..., description="Booking with remaining screening counts")


class FinalizeROMRequest(BaseModel):
    sessionId: str
    bookingId: str
    romData: Dict[str, Any] = Field(
        ...,
        description="""
        One entry per movement, each an end-range hold captured from the view that
        movement's plane requires:

        {
          'movements': {
            'shoulder_abduction': {
              'view': 'front',
              'samples': [{'pose': {'11': [x, y, z, visibility], ...},
                           'pose_world': {'11': [x, y, z, visibility], ...}}],
              'frameCount': 60
            },
            'knee_flexion_right': { 'view': 'rightside', 'samples': [...] }
          },
          'coordinateSpace': 'normalized',
          'imageWidth': 1280,
          'imageHeight': 720
        }

        Landmark NUMBERS only - pose estimation runs in the browser, so no video and no
        per-frame images reach this endpoint.
        """,
    )


class CancelROMRequest(BaseModel):
    sessionId: str
