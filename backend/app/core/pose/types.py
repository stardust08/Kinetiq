# app/core/pose/types.py - Shared Types for Pose Processing
"""
Shared type definitions for pose processing modules.

This module defines common dataclasses and types used across:
- BodyCalibrator (calibration.py)
- AdvancedROMCalculator (rom_calculator.py)

Provides type safety and consistency across the pose analysis system.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any
from enum import Enum
from datetime import datetime


# ==================== LANDMARK TYPES ====================

@dataclass
class Landmark:
    """
    Single landmark point with 3D coordinates and visibility.
    
    Attributes:
        x: X coordinate (pixel or normalized)
        y: Y coordinate (pixel or normalized)
        z: Z coordinate (depth, pixel or normalized)
        visibility: Visibility score (0.0 to 1.0)
    """
    x: float
    y: float
    z: float
    visibility: float = 1.0
    
    def to_tuple(self) -> Tuple[float, float, float, float]:
        """Convert to tuple format (x, y, z, visibility)"""
        return (self.x, self.y, self.z, self.visibility)
    
    def to_pixel_tuple(self) -> Tuple[int, int, float, float]:
        """Convert to pixel tuple format (x, y, z, visibility)"""
        return (int(self.x), int(self.y), self.z, self.visibility)
    
    @classmethod
    def from_tuple(cls, data: Tuple) -> 'Landmark':
        """Create Landmark from tuple (x, y, z, visibility)"""
        if len(data) >= 4:
            return cls(x=data[0], y=data[1], z=data[2], visibility=data[3])
        elif len(data) == 3:
            return cls(x=data[0], y=data[1], z=data[2], visibility=1.0)
        else:
            raise ValueError(f"Invalid tuple length: {len(data)}")


@dataclass
class LandmarkSet:
    """
    Collection of landmarks for a specific body part.
    
    Attributes:
        landmarks: Dictionary mapping landmark index to Landmark object
        landmark_type: Type of landmarks (pose, face, left_hand, right_hand)
    """
    landmarks: Dict[int, Landmark] = field(default_factory=dict)
    landmark_type: str = "pose"
    
    def get(self, index: int) -> Optional[Landmark]:
        """Get landmark by index"""
        return self.landmarks.get(index)
    
    def get_tuple(self, index: int) -> Optional[Tuple[float, float, float, float]]:
        """Get landmark as tuple by index"""
        lm = self.landmarks.get(index)
        return lm.to_tuple() if lm else None
    
    def has_landmark(self, index: int) -> bool:
        """Check if landmark exists"""
        return index in self.landmarks
    
    def add_landmark(self, index: int, landmark: Landmark) -> None:
        """Add or update landmark"""
        self.landmarks[index] = landmark
    
    def get_visible_count(self, threshold: float = 0.6) -> int:
        """Count landmarks above visibility threshold"""
        return sum(1 for lm in self.landmarks.values() if lm.visibility >= threshold)


@dataclass
class ExtractedLandmarks:
    """
    Complete set of extracted landmarks from MediaPipe Holistic.
    
    Includes:
    - Pose landmarks (0-32 standard + 33 virtual neck)
    - Face mesh (0-467)
    - Left hand (0-20)
    - Right hand (0-20)
    """
    pose: LandmarkSet = field(default_factory=lambda: LandmarkSet(landmark_type="pose"))
    face: LandmarkSet = field(default_factory=lambda: LandmarkSet(landmark_type="face"))
    left_hand: LandmarkSet = field(default_factory=lambda: LandmarkSet(landmark_type="left_hand"))
    right_hand: LandmarkSet = field(default_factory=lambda: LandmarkSet(landmark_type="right_hand"))
    
    def to_dict(self) -> Dict[str, Dict[int, Tuple]]:
        """
        Convert to dictionary format for backward compatibility.
        
        Returns:
            Dictionary with structure:
            {
                "pose": {0-33: (x, y, z, visibility)},
                "face": {0-467: (x, y, z)},
                "left_hand": {0-20: (x, y, z, visibility)},
                "right_hand": {0-20: (x, y, z, visibility)}
            }
        """
        return {
            "pose": {idx: lm.to_tuple() for idx, lm in self.pose.landmarks.items()},
            "face": {idx: lm.to_tuple()[:3] for idx, lm in self.face.landmarks.items()},
            "left_hand": {idx: lm.to_tuple() for idx, lm in self.left_hand.landmarks.items()},
            "right_hand": {idx: lm.to_tuple() for idx, lm in self.right_hand.landmarks.items()}
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Dict[int, Tuple]]) -> 'ExtractedLandmarks':
        """Create ExtractedLandmarks from dictionary format"""
        extracted = cls()
        
        # Convert pose landmarks
        if "pose" in data:
            for idx, coords in data["pose"].items():
                extracted.pose.add_landmark(idx, Landmark.from_tuple(coords))
        
        # Convert face landmarks
        if "face" in data:
            for idx, coords in data["face"].items():
                # Face landmarks may not have visibility
                if len(coords) == 3:
                    extracted.face.add_landmark(idx, Landmark(coords[0], coords[1], coords[2], 1.0))
                else:
                    extracted.face.add_landmark(idx, Landmark.from_tuple(coords))
        
        # Convert hand landmarks
        if "left_hand" in data:
            for idx, coords in data["left_hand"].items():
                extracted.left_hand.add_landmark(idx, Landmark.from_tuple(coords))
        
        if "right_hand" in data:
            for idx, coords in data["right_hand"].items():
                extracted.right_hand.add_landmark(idx, Landmark.from_tuple(coords))
        
        return extracted


# ==================== CALIBRATION TYPES ====================

@dataclass
class BodyCalibration:
    """
    Store comprehensive clinical posture metrics (33 total).
    
    This is the primary output of the BodyCalibrator.finalize_calibration() method.
    All angles are in degrees, distances in pixels.
    """
    calibration_date: str
    person_id: str

    # I. GLOBAL POSTURE (HEAD & SPINE) - 8 metrics
    fhd_pixels: float  # Forward Head Distance
    cervical_angle: float  # Head tilt
    head_lateral_flexion: float  # Lateral head tilt
    head_rotation: float  # Head rotation (yaw)
    thoracic_kyphosis_angle: float  # Upper back curvature
    lumbar_lordosis_angle: float  # Lower back curvature
    trunk_lateral_shift: float  # Trunk side shift
    trunk_angle: float  # Trunk lean angle

    # II. SHOULDER & ARM - 6 metrics
    left_shoulder_angle: float
    right_shoulder_angle: float
    shoulder_height_diff: float  # Shoulder asymmetry
    rounded_shoulder_angle: float  # Forward shoulder posture
    left_elbow_angle: float
    right_elbow_angle: float

    # III. PELVIS & HIP - 5 metrics
    left_hip_angle: float
    right_hip_angle: float
    pelvic_obliquity: float  # Hip height difference
    pelvic_tilt_angle: float  # Pelvic tilt
    hip_height_diff: float  # Hip asymmetry

    # IV. LOWER EXTREMITY - 9 metrics
    left_knee_angle: float
    right_knee_angle: float
    knee_varus_valgus: float  # Knee alignment
    knee_flexion_neutral: float  # Knee flexion in neutral stance
    q_angle_left: float  # Q-angle left
    q_angle_right: float  # Q-angle right
    foot_progression_angle: float  # Foot angle
    pronation_supination_left: float  # Left foot pronation
    pronation_supination_right: float  # Right foot pronation

    # V. BODY PROPORTIONS - 7 metrics
    shoulder_width: float
    hip_width: float
    torso_length: float
    left_arm_length: float
    right_arm_length: float
    left_leg_length: float
    right_leg_length: float

    # Raw landmark data for visualization
    landmarks_data: Optional[Dict] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "calibration_date": self.calibration_date,
            "person_id": self.person_id,
            # Global Posture
            "fhd_pixels": self.fhd_pixels,
            "cervical_angle": self.cervical_angle,
            "head_lateral_flexion": self.head_lateral_flexion,
            "head_rotation": self.head_rotation,
            "thoracic_kyphosis_angle": self.thoracic_kyphosis_angle,
            "lumbar_lordosis_angle": self.lumbar_lordosis_angle,
            "trunk_lateral_shift": self.trunk_lateral_shift,
            "trunk_angle": self.trunk_angle,
            # Shoulder & Arm
            "left_shoulder_angle": self.left_shoulder_angle,
            "right_shoulder_angle": self.right_shoulder_angle,
            "shoulder_height_diff": self.shoulder_height_diff,
            "rounded_shoulder_angle": self.rounded_shoulder_angle,
            "left_elbow_angle": self.left_elbow_angle,
            "right_elbow_angle": self.right_elbow_angle,
            # Pelvis & Hip
            "left_hip_angle": self.left_hip_angle,
            "right_hip_angle": self.right_hip_angle,
            "pelvic_obliquity": self.pelvic_obliquity,
            "pelvic_tilt_angle": self.pelvic_tilt_angle,
            "hip_height_diff": self.hip_height_diff,
            # Lower Extremity
            "left_knee_angle": self.left_knee_angle,
            "right_knee_angle": self.right_knee_angle,
            "knee_varus_valgus": self.knee_varus_valgus,
            "knee_flexion_neutral": self.knee_flexion_neutral,
            "q_angle_left": self.q_angle_left,
            "q_angle_right": self.q_angle_right,
            "foot_progression_angle": self.foot_progression_angle,
            "pronation_supination_left": self.pronation_supination_left,
            "pronation_supination_right": self.pronation_supination_right,
            # Body Proportions
            "shoulder_width": self.shoulder_width,
            "hip_width": self.hip_width,
            "torso_length": self.torso_length,
            "left_arm_length": self.left_arm_length,
            "right_arm_length": self.right_arm_length,
            "left_leg_length": self.left_leg_length,
            "right_leg_length": self.right_leg_length,
            # Raw data
            "landmarks_data": self.landmarks_data
        }


# ==================== ROM TYPES ====================

class ExerciseView(Enum):
    """Exercise camera view types"""
    FRONT = "front"
    SIDE = "side"
    BACK = "back"
    TOP = "top"


class ExercisePosture(Enum):
    """Exercise posture types"""
    STANDING = "standing"
    SITTING = "sitting"
    LYING_SUPINE = "lying_supine"  # Face up
    LYING_PRONE = "lying_prone"    # Face down
    LYING_SIDE = "lying_side"
    KNEELING = "kneeling"
    QUADRUPED = "quadruped"  # On hands and knees


@dataclass
class ROMResult:
    """
    Result of Range of Motion (ROM) calculation.
    
    Attributes:
        angle: Current angle measurement in degrees
        rom_current: Current ROM value
        rom_max: Maximum expected ROM
        rom_min: Minimum expected ROM
        symmetry_score: Symmetry score (0-100, 100 = perfect)
        form_quality: Form quality score (0-100, 100 = perfect)
        compensation_detected: Whether compensation pattern detected
        compensation_type: Type of compensation (if detected)
        additional_metrics: Additional measurement data
    """
    angle: Optional[float]
    rom_current: Optional[float]
    rom_max: Optional[float]
    rom_min: Optional[float]
    symmetry_score: Optional[float]  # 0-100, 100 = perfect symmetry
    form_quality: Optional[float]    # 0-100, 100 = perfect form
    compensation_detected: bool
    compensation_type: Optional[str]
    additional_metrics: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "angle": self.angle,
            "rom_current": self.rom_current,
            "rom_max": self.rom_max,
            "rom_min": self.rom_min,
            "symmetry_score": self.symmetry_score,
            "form_quality": self.form_quality,
            "compensation_detected": self.compensation_detected,
            "compensation_type": self.compensation_type,
            "additional_metrics": self.additional_metrics
        }


# ==================== VISIBILITY & VALIDATION TYPES ====================

@dataclass
class VisibilityCheck:
    """
    Result of landmark visibility validation.
    
    Attributes:
        all_visible: Whether all required landmarks are visible
        missing_landmarks: List of missing landmark names
        low_visibility_landmarks: List of landmarks with low visibility
        visibility_score: Overall visibility score (0.0 to 1.0)
    """
    all_visible: bool
    missing_landmarks: List[str] = field(default_factory=list)
    low_visibility_landmarks: List[str] = field(default_factory=list)
    visibility_score: float = 1.0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "all_visible": self.all_visible,
            "missing_landmarks": self.missing_landmarks,
            "low_visibility_landmarks": self.low_visibility_landmarks,
            "visibility_score": self.visibility_score
        }


# ==================== PROCESSING CONFIGURATION ====================

@dataclass
class CalibrationConfig:
    """
    Configuration for BodyCalibrator.
    
    Attributes:
        required_samples: Number of samples needed for calibration
        sample_rate_fps: Expected frame rate for sample collection
        duration_seconds: Expected duration of calibration
    """
    required_samples: int = 240  # 60 frames × 4 poses (Front, Left Side, Right Side, Back)
    sample_rate_fps: int = 30
    duration_seconds: float = 8.0  # 2 seconds × 4 poses


# ==================== LANDMARK INDEX CONSTANTS ====================

class PoseLandmark:
    """MediaPipe Pose landmark indices (0-32 + 33 virtual neck)"""
    NOSE = 0
    LEFT_EYE_INNER = 1
    LEFT_EYE = 2
    LEFT_EYE_OUTER = 3
    RIGHT_EYE_INNER = 4
    RIGHT_EYE = 5
    RIGHT_EYE_OUTER = 6
    LEFT_EAR = 7
    RIGHT_EAR = 8
    MOUTH_LEFT = 9
    MOUTH_RIGHT = 10
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    LEFT_PINKY = 17
    RIGHT_PINKY = 18
    LEFT_INDEX = 19
    RIGHT_INDEX = 20
    LEFT_THUMB = 21
    RIGHT_THUMB = 22
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_KNEE = 25
    RIGHT_KNEE = 26
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
    LEFT_HEEL = 29
    RIGHT_HEEL = 30
    LEFT_FOOT_INDEX = 31
    RIGHT_FOOT_INDEX = 32
    VIRTUAL_NECK = 33  # Custom landmark


class HandLandmark:
    """MediaPipe Hand landmark indices (0-20)"""
    WRIST = 0
    THUMB_CMC = 1
    THUMB_MCP = 2
    THUMB_IP = 3
    THUMB_TIP = 4
    INDEX_FINGER_MCP = 5
    INDEX_FINGER_PIP = 6
    INDEX_FINGER_DIP = 7
    INDEX_FINGER_TIP = 8
    MIDDLE_FINGER_MCP = 9
    MIDDLE_FINGER_PIP = 10
    MIDDLE_FINGER_DIP = 11
    MIDDLE_FINGER_TIP = 12
    RING_FINGER_MCP = 13
    RING_FINGER_PIP = 14
    RING_FINGER_DIP = 15
    RING_FINGER_TIP = 16
    PINKY_MCP = 17
    PINKY_PIP = 18
    PINKY_DIP = 19
    PINKY_TIP = 20


# ==================== UTILITY FUNCTIONS ====================

def create_landmark_mapping(landmark_names: List[str]) -> Dict[str, str]:
    """
    Create landmark mapping for visibility checking.
    
    Args:
        landmark_names: List of landmark names to map
        
    Returns:
        Dictionary mapping landmark names to tags (e.g., {"nose": "pose:0"})
    """
    mapping = {}
    
    # Common mappings
    common_mappings = {
        "nose": f"pose:{PoseLandmark.NOSE}",
        "left_ear": f"pose:{PoseLandmark.LEFT_EAR}",
        "right_ear": f"pose:{PoseLandmark.RIGHT_EAR}",
        "left_shoulder": f"pose:{PoseLandmark.LEFT_SHOULDER}",
        "right_shoulder": f"pose:{PoseLandmark.RIGHT_SHOULDER}",
        "left_elbow": f"pose:{PoseLandmark.LEFT_ELBOW}",
        "right_elbow": f"pose:{PoseLandmark.RIGHT_ELBOW}",
        "left_wrist": f"pose:{PoseLandmark.LEFT_WRIST}",
        "right_wrist": f"pose:{PoseLandmark.RIGHT_WRIST}",
        "left_hip": f"pose:{PoseLandmark.LEFT_HIP}",
        "right_hip": f"pose:{PoseLandmark.RIGHT_HIP}",
        "left_knee": f"pose:{PoseLandmark.LEFT_KNEE}",
        "right_knee": f"pose:{PoseLandmark.RIGHT_KNEE}",
        "left_ankle": f"pose:{PoseLandmark.LEFT_ANKLE}",
        "right_ankle": f"pose:{PoseLandmark.RIGHT_ANKLE}",
        "virtual_neck": f"pose:{PoseLandmark.VIRTUAL_NECK}"
    }
    
    for name in landmark_names:
        if name in common_mappings:
            mapping[name] = common_mappings[name]
    
    return mapping


def get_landmark_name(landmark_type: str, index: int) -> str:
    """
    Get human-readable name for a landmark.
    
    Args:
        landmark_type: Type of landmark ("pose", "face", "left_hand", "right_hand")
        index: Landmark index
        
    Returns:
        Human-readable landmark name
    """
    if landmark_type == "pose":
        pose_names = {
            0: "Nose", 7: "Left Ear", 8: "Right Ear",
            11: "Left Shoulder", 12: "Right Shoulder",
            13: "Left Elbow", 14: "Right Elbow",
            15: "Left Wrist", 16: "Right Wrist",
            23: "Left Hip", 24: "Right Hip",
            25: "Left Knee", 26: "Right Knee",
            27: "Left Ankle", 28: "Right Ankle",
            33: "Virtual Neck"
        }
        return pose_names.get(index, f"Pose Landmark {index}")
    
    elif landmark_type in ["left_hand", "right_hand"]:
        hand_names = {
            0: "Wrist", 4: "Thumb Tip", 8: "Index Tip",
            12: "Middle Tip", 16: "Ring Tip", 20: "Pinky Tip"
        }
        prefix = "Left" if landmark_type == "left_hand" else "Right"
        return f"{prefix} {hand_names.get(index, f'Hand Landmark {index}')}"
    
    elif landmark_type == "face":
        return f"Face Landmark {index}"
    
    return f"Unknown Landmark {index}"
