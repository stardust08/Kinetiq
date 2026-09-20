"""Gait Analysis Types - Data structures for gait metrics."""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any


@dataclass
class GaitMetrics:
    """All 32 gait analysis metrics + annotated visualization data."""
    calibration_date: str
    person_id: str

    # I. Temporal Parameters (6)
    cadence: float                # steps/minute (normal: 100-120)
    stride_time_left: float       # seconds (normal: 0.98-1.07)
    stride_time_right: float      # seconds
    stance_phase_percent: float   # % of gait cycle (normal: 60%)
    swing_phase_percent: float    # % of gait cycle (normal: 40%)
    double_support_time: float    # seconds (normal: 0.10-0.14)

    # II. Spatial Parameters (6)
    stride_length: float          # normalized 0-1
    step_length_left: float       # normalized
    step_length_right: float      # normalized
    step_width: float             # normalized
    walking_speed: float          # normalized units/sec
    step_length_symmetry: float   # 0-100% (100% = perfect symmetry)

    # III. Kinematic Parameters (12)
    hip_flexion_max: float              # degrees (normal: 20-30)
    hip_extension_max: float            # degrees (normal: 10-20)
    hip_flexion_rom: float              # degrees (normal: 40-50)
    knee_flexion_max: float             # degrees (normal: 55-65)
    knee_extension_min: float           # degrees near full extension
    knee_flexion_rom: float             # degrees (normal: 55-65)
    left_knee_angle_avg: float          # degrees
    right_knee_angle_avg: float         # degrees
    ankle_dorsiflexion_max: float       # degrees (normal: 10-15)
    foot_progression_angle_left: float  # degrees (normal: 5-15 outward)
    foot_progression_angle_right: float # degrees
    arm_swing_amplitude: float          # normalized pixels

    # IV. Trunk & Pelvis (4)
    trunk_lateral_sway: float    # normalized pixels (range)
    trunk_sagittal_lean: float   # degrees (normal: 0-5 forward)
    pelvic_obliquity_range: float # degrees (normal: 4-6)
    arm_swing_symmetry: float    # 0-100%

    # V. Functional Scores (4)
    gait_symmetry_index: float   # 0-100% (100% = perfect)
    step_regularity: float       # 0-1.0 (1.0 = perfectly regular)
    gait_quality_score: float    # 0-100 composite
    gait_cycle_count: int        # number of complete cycles analyzed

    # Annotated data for skeleton video playback
    annotated_views: Optional[Dict[str, Any]] = None
