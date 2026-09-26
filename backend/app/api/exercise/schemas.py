"""Request shapes for the exercise catalogue and prescription API."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class UpdateExerciseRequest(BaseModel):
    """
    Admin edit of a catalogue entry.

    Only deployment-owned fields appear here. Instructions, cautions and citations come
    from app/core/exercise/library.py and are not editable through the API - an exercise
    whose instructions can be changed by an HTTP call is an exercise whose instructions
    nobody reviewed.
    """

    videoUrl: Optional[str] = None
    videoProvider: Optional[str] = Field(
        None, description="youtube | vimeo | mp4 | hls. Chooses the player."
    )
    thumbnailUrl: Optional[str] = None
    durationSeconds: Optional[int] = None
    isActive: Optional[bool] = None
    equipment: Optional[str] = Field(None, description="Comma-separated.")
    defaultSets: Optional[int] = None
    defaultReps: Optional[int] = None
    defaultHoldSeconds: Optional[int] = None
    defaultFrequencyPerWeek: Optional[int] = None


class UpdatePlanRequest(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    clinicianNotes: Optional[str] = None
    durationWeeks: Optional[int] = Field(None, ge=1, le=52)


class ActivatePlanRequest(BaseModel):
    clinicianNotes: Optional[str] = Field(
        None,
        description="Saved onto the plan as it is prescribed. Shown to the patient.",
    )


class UpdatePlanStatusRequest(BaseModel):
    status: str = Field(..., description="ACTIVE | COMPLETED | ARCHIVED")


class AddPlanItemRequest(BaseModel):
    exerciseId: Optional[str] = Field(None, description="Catalogue id or slug.")
    exerciseSlug: Optional[str] = None
    sets: Optional[int] = Field(None, ge=1, le=10)
    reps: Optional[int] = Field(None, ge=1, le=100)
    holdSeconds: Optional[int] = Field(None, ge=1, le=600)
    frequencyPerWeek: Optional[int] = Field(None, ge=1, le=21)
    reason: Optional[str] = None
    clinicianNote: Optional[str] = None


class UpdatePlanItemRequest(BaseModel):
    sets: Optional[int] = Field(None, ge=1, le=10)
    reps: Optional[int] = Field(None, ge=1, le=100)
    holdSeconds: Optional[int] = Field(None, ge=1, le=600)
    frequencyPerWeek: Optional[int] = Field(None, ge=1, le=21)
    durationWeeks: Optional[int] = Field(None, ge=1, le=52)
    displayOrder: Optional[int] = None
    clinicianNote: Optional[str] = None
    isRemoved: Optional[bool] = None


class LogCompletionRequest(BaseModel):
    setsDone: Optional[int] = Field(None, ge=0, le=20)
    repsDone: Optional[int] = Field(None, ge=0, le=500)
    painScore: Optional[int] = Field(
        None, ge=0, le=10, description="0-10 numeric rating scale."
    )
    difficultyRating: Optional[int] = Field(
        None, ge=1, le=5, description="1-5. Flags an exercise progressed too fast."
    )
    notes: Optional[str] = None
