# app/core/pose/rom_calculator.py - Advanced ROM Calculator
"""
Range of Motion (ROM) Calculator for clinical posture analysis.

Migrated from PoseDetection/core/rom_calculator.py
Provides 3D angle calculations and ROM measurements for all major joints.
"""

from typing import Dict, Optional, Tuple, List
import numpy as np
from dataclasses import dataclass
from enum import Enum


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
    """Result of ROM calculation"""
    angle: Optional[float]
    rom_current: Optional[float]
    rom_max: Optional[float]
    rom_min: Optional[float]
    symmetry_score: Optional[float]  # 0-100, 100 = perfect symmetry
    form_quality: Optional[float]    # 0-100, 100 = perfect form
    compensation_detected: bool
    compensation_type: Optional[str]
    additional_metrics: Dict[str, float]


class AdvancedROMCalculator:
    """
    World-class ROM calculator supporting all exercise types, views, and postures.
    Based on clinical MSK metrics from research papers.
    
    Provides:
    - 3D angle calculations
    - Cervical spine ROM (flexion/extension, lateral flexion, rotation)
    - Shoulder ROM (flexion, abduction)
    - Hip/Knee ROM
    - Squat analysis with compensation detection
    - Symmetry scoring
    """
    
    def __init__(self, calibration=None):
        """
        Initialize ROM calculator.
        
        Args:
            calibration: Optional BodyCalibration object for baseline comparisons
        """
        self.calibration = calibration
        
    def calculate_angle_3d(self, a: Tuple, b: Tuple, c: Tuple) -> Optional[float]:
        """
        Calculate 3D angle at point b formed by a-b-c using proper vector math.
        
        Args:
            a: First point (x, y, z) or (x, y, z, visibility)
            b: Vertex point (x, y, z) or (x, y, z, visibility)
            c: Third point (x, y, z) or (x, y, z, visibility)
            
        Returns:
            Angle in degrees, or None if calculation fails
        """
        try:
            # Convert to numpy arrays, handle different tuple lengths
            a = np.array(a[:3]) if len(a) >= 3 else np.array([a[0], a[1], 0])
            b = np.array(b[:3]) if len(b) >= 3 else np.array([b[0], b[1], 0])
            c = np.array(c[:3]) if len(c) >= 3 else np.array([c[0], c[1], 0])
            
            # Scale z-coordinate for better 3D stability
            a[2] *= 1000
            b[2] *= 1000
            c[2] *= 1000
            
            ba = a - b
            bc = c - b
            
            denom = np.linalg.norm(ba) * np.linalg.norm(bc)
            if denom < 1e-6:
                return None
                
            cos_angle = np.dot(ba, bc) / denom
            cos_angle = np.clip(cos_angle, -1.0, 1.0)
            angle = np.arccos(cos_angle)
            return float(np.degrees(angle))
        except Exception as e:
            print(f"[WARN] Angle calculation error: {e}")
            return None
    
    def calculate_2d_angle(self, a: Tuple, b: Tuple, c: Tuple) -> Optional[float]:
        """
        Calculate 2D angle (when 3D data unreliable).
        
        Args:
            a: First point (x, y)
            b: Vertex point (x, y)
            c: Third point (x, y)
            
        Returns:
            Angle in degrees, or None if calculation fails
        """
        try:
            a = np.array(a[:2])
            b = np.array(b[:2])
            c = np.array(c[:2])
            
            ba = a - b
            bc = c - b
            
            denom = np.linalg.norm(ba) * np.linalg.norm(bc)
            if denom < 1e-6:
                return None
                
            cos_angle = np.dot(ba, bc) / denom
            cos_angle = np.clip(cos_angle, -1.0, 1.0)
            angle = np.arccos(cos_angle)
            return float(np.degrees(angle))
        except:
            return None
    
    def distance_3d(self, a: Tuple, b: Tuple) -> Optional[float]:
        """
        Calculate 3D Euclidean distance.
        
        Args:
            a: First point (x, y, z)
            b: Second point (x, y, z)
            
        Returns:
            Distance in pixels, or None if calculation fails
        """
        try:
            a = np.array(a[:3])
            b = np.array(b[:3])
            return float(np.linalg.norm(a - b))
        except:
            return None
    
    # ==================== CERVICAL SPINE ====================
    
    def cervical_flexion_extension(self, extracted: Dict, view: str = "side") -> ROMResult:
        """
        Cervical flexion/extension ROM measurement.
        
        Uses: nose, mid_shoulder, mid_hip
        Normal ROM: 50-60° flexion, 60-70° extension
        
        Args:
            extracted: Dictionary with pose landmarks
            view: Camera view ("side" recommended)
            
        Returns:
            ROMResult with angle and compensation detection
        """
        pose = extracted["pose"]
        
        if 0 not in pose or 11 not in pose or 12 not in pose:
            return self._empty_result()
        
        nose = pose[0]
        l_shoulder = pose[11]
        r_shoulder = pose[12]
        l_hip = pose[23] if 23 in pose else None
        r_hip = pose[24] if 24 in pose else None
        
        mid_shoulder = self._midpoint(l_shoulder, r_shoulder)
        
        if l_hip and r_hip:
            mid_hip = self._midpoint(l_hip, r_hip)
            # Angle from nose to mid_shoulder to mid_hip
            angle = self.calculate_angle_3d(nose, mid_shoulder, mid_hip)
        else:
            # If hips not visible, use vertical reference
            vertical_point = (mid_shoulder[0], mid_shoulder[1] - 100, mid_shoulder[2])
            angle = self.calculate_angle_3d(nose, mid_shoulder, vertical_point)
        
        # Compensation detection - shoulder shrugging
        compensation = False
        comp_type = None
        shoulder_height_diff = abs(l_shoulder[1] - r_shoulder[1])
        
        if self.calibration:
            if shoulder_height_diff > self.calibration.shoulder_height_diff * 1.5:
                compensation = True
                comp_type = "shoulder_elevation"
        
        return ROMResult(
            angle=angle,
            rom_current=abs(angle - 90) if angle else None,  # Deviation from neutral
            rom_max=70.0,  # Max expected
            rom_min=0.0,
            symmetry_score=None,
            form_quality=100.0 - (shoulder_height_diff * 2) if angle else None,
            compensation_detected=compensation,
            compensation_type=comp_type,
            additional_metrics={"shoulder_height_diff": shoulder_height_diff}
        )
    
    def cervical_lateral_flexion(self, extracted: Dict, view: str = "front") -> ROMResult:
        """
        Cervical lateral flexion ROM measurement.
        
        Normal ROM: 45° each side
        
        Args:
            extracted: Dictionary with pose landmarks
            view: Camera view ("front" recommended)
            
        Returns:
            ROMResult with angle and side information
        """
        pose = extracted["pose"]
        
        if 0 not in pose or 11 not in pose or 12 not in pose:
            return self._empty_result()
        
        nose = pose[0]
        l_shoulder = pose[11]
        r_shoulder = pose[12]
        
        mid_shoulder = self._midpoint(l_shoulder, r_shoulder)
        
        # Create vertical reference point
        vertical_ref = (mid_shoulder[0], mid_shoulder[1] - 100, mid_shoulder[2])
        
        # Angle from vertical to nose
        angle = self.calculate_angle_3d(vertical_ref, mid_shoulder, nose)
        
        # Detect which direction (left or right tilt)
        nose_offset = nose[0] - mid_shoulder[0]
        side = "left" if nose_offset < 0 else "right"
        
        return ROMResult(
            angle=angle,
            rom_current=angle,
            rom_max=45.0,
            rom_min=0.0,
            symmetry_score=None,
            form_quality=100.0 if angle and angle < 50 else 70.0,
            compensation_detected=False,
            compensation_type=None,
            additional_metrics={"side": side}
        )
    
    def cervical_rotation(self, extracted: Dict, view: str = "top") -> ROMResult:
        """
        Cervical rotation ROM measurement.
        
        Normal ROM: 70-80° each side
        
        Args:
            extracted: Dictionary with pose and face landmarks
            view: Camera view ("top" recommended)
            
        Returns:
            ROMResult with rotation angle
        """
        face = extracted.get("face", {})
        pose = extracted["pose"]
        
        if not face or 11 not in pose or 12 not in pose:
            return self._empty_result()
        
        # Use nose tip and face center points
        nose_tip = face.get(1)  # Nose tip
        left_face = face.get(234)  # Left face edge
        right_face = face.get(454)  # Right face edge
        
        if not (nose_tip and left_face and right_face):
            return self._empty_result()
        
        # Calculate face orientation angle
        face_center = self._midpoint(left_face, right_face)
        l_shoulder = pose[11]
        r_shoulder = pose[12]
        shoulder_center = self._midpoint(l_shoulder, r_shoulder)
        
        # Rotation angle based on nose position relative to shoulders
        angle = self.calculate_2d_angle(left_face, face_center, right_face)
        
        return ROMResult(
            angle=angle,
            rom_current=angle,
            rom_max=80.0,
            rom_min=0.0,
            symmetry_score=None,
            form_quality=100.0 if angle else None,
            compensation_detected=False,
            compensation_type=None,
            additional_metrics={}
        )
    
    # ==================== SHOULDER COMPLEX ====================
    
    def shoulder_flexion(self, extracted: Dict, side: str = "right", view: str = "side") -> ROMResult:
        """
        Shoulder flexion (forward raise) ROM measurement.
        
        Normal ROM: 180°
        
        Args:
            extracted: Dictionary with pose landmarks
            side: "right" or "left"
            view: Camera view ("side" recommended)
            
        Returns:
            ROMResult with angle and trunk compensation detection
        """
        pose = extracted["pose"]
        
        shoulder_idx = 12 if side == "right" else 11
        elbow_idx = 14 if side == "right" else 13
        wrist_idx = 16 if side == "right" else 15
        hip_idx = 24 if side == "right" else 23
        
        if not all(idx in pose for idx in [shoulder_idx, elbow_idx, wrist_idx, hip_idx]):
            return self._empty_result()
        
        shoulder = pose[shoulder_idx]
        elbow = pose[elbow_idx]
        wrist = pose[wrist_idx]
        hip = pose[hip_idx]
        
        # Angle from hip to shoulder to wrist (measures arm elevation)
        angle = self.calculate_angle_3d(hip, shoulder, elbow)
        
        # Detect compensation - trunk lean
        l_shoulder = pose[11]
        r_shoulder = pose[12]
        l_hip = pose[23]
        r_hip = pose[24]
        
        mid_shoulder = self._midpoint(l_shoulder, r_shoulder)
        mid_hip = self._midpoint(l_hip, r_hip)
        
        trunk_angle = self.calculate_angle_3d(
            (mid_shoulder[0], 0, mid_shoulder[2]),
            mid_shoulder,
            mid_hip
        )
        
        compensation = False
        comp_type = None
        if trunk_angle and abs(trunk_angle - 90) > 15:  # More than 15° trunk lean
            compensation = True
            comp_type = "trunk_lean"
        
        return ROMResult(
            angle=angle,
            rom_current=abs(180 - angle) if angle else None,
            rom_max=180.0,
            rom_min=0.0,
            symmetry_score=None,
            form_quality=100.0 - abs(trunk_angle - 90) if trunk_angle else None,
            compensation_detected=compensation,
            compensation_type=comp_type,
            additional_metrics={"trunk_angle": trunk_angle}
        )
    
    def shoulder_abduction(self, extracted: Dict, side: str = "right", view: str = "front") -> ROMResult:
        """
        Shoulder abduction (lateral raise) ROM measurement.
        
        Normal ROM: 180°
        
        Args:
            extracted: Dictionary with pose landmarks
            side: "right" or "left"
            view: Camera view ("front" recommended)
            
        Returns:
            ROMResult with abduction angle
        """
        pose = extracted["pose"]
        
        shoulder_idx = 12 if side == "right" else 11
        elbow_idx = 14 if side == "right" else 13
        hip_idx = 24 if side == "right" else 23
        
        if not all(idx in pose for idx in [shoulder_idx, elbow_idx, hip_idx]):
            return self._empty_result()
        
        shoulder = pose[shoulder_idx]
        elbow = pose[elbow_idx]
        hip = pose[hip_idx]
        
        # Calculate abduction angle
        angle = self.calculate_angle_3d(hip, shoulder, elbow)
        
        return ROMResult(
            angle=angle,
            rom_current=abs(180 - angle) if angle else None,
            rom_max=180.0,
            rom_min=0.0,
            symmetry_score=None,
            form_quality=100.0 if angle else None,
            compensation_detected=False,
            compensation_type=None,
            additional_metrics={}
        )
    
    # ==================== HIP & KNEE ====================
    
    def hip_flexion(self, extracted: Dict, side: str = "right", view: str = "side") -> ROMResult:
        """
        Hip flexion ROM measurement.
        
        Normal ROM: 120° (standing), 135° (supine)
        
        Args:
            extracted: Dictionary with pose landmarks
            side: "right" or "left"
            view: Camera view ("side" or "front")
            
        Returns:
            ROMResult with hip angle and knee valgus/varus detection
        """
        pose = extracted["pose"]
        
        shoulder_idx = 12 if side == "right" else 11
        hip_idx = 24 if side == "right" else 23
        knee_idx = 26 if side == "right" else 25
        ankle_idx = 28 if side == "right" else 27
        
        if not all(idx in pose for idx in [shoulder_idx, hip_idx, knee_idx]):
            return self._empty_result()
        
        shoulder = pose[shoulder_idx]
        hip = pose[hip_idx]
        knee = pose[knee_idx]
        
        # Hip angle: shoulder-hip-knee
        angle = self.calculate_angle_3d(shoulder, hip, knee)
        
        # Check knee valgus/varus if front view
        compensation = False
        comp_type = None
        
        if view == "front" and ankle_idx in pose:
            ankle = pose[ankle_idx]
            # Check knee alignment
            knee_x = knee[0]
            hip_ankle_mid_x = (hip[0] + ankle[0]) / 2
            valgus_amount = abs(knee_x - hip_ankle_mid_x)
            
            if valgus_amount > 20:  # Threshold in pixels
                compensation = True
                comp_type = "knee_valgus" if knee_x < hip_ankle_mid_x else "knee_varus"
        
        return ROMResult(
            angle=angle,
            rom_current=abs(180 - angle) if angle else None,
            rom_max=120.0,
            rom_min=0.0,
            symmetry_score=None,
            form_quality=100.0 if not compensation else 70.0,
            compensation_detected=compensation,
            compensation_type=comp_type,
            additional_metrics={}
        )
    
    def knee_flexion_extension(self, extracted: Dict, side: str = "right") -> ROMResult:
        """
        Knee flexion/extension ROM measurement.
        
        Normal ROM: 135° flexion, 0° extension
        
        Args:
            extracted: Dictionary with pose landmarks
            side: "right" or "left"
            
        Returns:
            ROMResult with knee angle
        """
        pose = extracted["pose"]
        
        hip_idx = 24 if side == "right" else 23
        knee_idx = 26 if side == "right" else 25
        ankle_idx = 28 if side == "right" else 27
        
        if not all(idx in pose for idx in [hip_idx, knee_idx, ankle_idx]):
            return self._empty_result()
        
        hip = pose[hip_idx]
        knee = pose[knee_idx]
        ankle = pose[ankle_idx]
        
        # Knee angle: hip-knee-ankle
        angle = self.calculate_angle_3d(hip, knee, ankle)
        
        return ROMResult(
            angle=angle,
            rom_current=abs(180 - angle) if angle else None,
            rom_max=135.0,
            rom_min=0.0,
            symmetry_score=None,
            form_quality=100.0 if angle else None,
            compensation_detected=False,
            compensation_type=None,
            additional_metrics={}
        )
    
    def squat_analysis(self, extracted: Dict, view: str = "side") -> ROMResult:
        """
        Comprehensive squat analysis.
        
        Measures: hip flexion, knee flexion, trunk angle, knee valgus
        
        Args:
            extracted: Dictionary with pose landmarks
            view: Camera view ("side" or "front")
            
        Returns:
            ROMResult with comprehensive squat metrics and compensations
        """
        pose = extracted["pose"]
        
        required = [11, 12, 23, 24, 25, 26, 27, 28]
        if not all(idx in pose for idx in required):
            return self._empty_result()
        
        # Right side measurements
        r_hip = pose[24]
        r_knee = pose[26]
        r_ankle = pose[28]
        
        # Knee angle
        knee_angle = self.calculate_angle_3d(r_hip, r_knee, r_ankle)
        
        # Trunk angle
        l_shoulder = pose[11]
        r_shoulder = pose[12]
        l_hip = pose[23]
        r_hip_l = pose[24]
        
        mid_shoulder = self._midpoint(l_shoulder, r_shoulder)
        mid_hip = self._midpoint(l_hip, r_hip_l)
        
        trunk_angle = self.calculate_angle_3d(
            (mid_hip[0], mid_hip[1] - 100, mid_hip[2]),
            mid_hip,
            mid_shoulder
        )
        
        # Check for compensations
        compensations = []
        
        # Excessive forward lean (trunk angle > 45° from vertical)
        if trunk_angle and abs(trunk_angle - 90) > 45:
            compensations.append("excessive_forward_lean")
        
        # Knee valgus check (front view)
        if view == "front":
            knee_x = r_knee[0]
            hip_ankle_mid = (r_hip[0] + r_ankle[0]) / 2
            if abs(knee_x - hip_ankle_mid) > 30:
                compensations.append("knee_valgus")
        
        # Heels lifting (ankle elevation)
        l_ankle = pose[27]
        ankle_height_diff = abs(r_ankle[1] - l_ankle[1])
        if ankle_height_diff > 50:
            compensations.append("asymmetric_depth")
        
        form_quality = 100.0
        if compensations:
            form_quality -= len(compensations) * 15.0
        
        return ROMResult(
            angle=knee_angle,
            rom_current=abs(180 - knee_angle) if knee_angle else None,
            rom_max=135.0,
            rom_min=90.0,  # Typical squat depth
            symmetry_score=None,
            form_quality=max(0.0, form_quality),
            compensation_detected=len(compensations) > 0,
            compensation_type=",".join(compensations) if compensations else None,
            additional_metrics={
                "trunk_angle": trunk_angle,
                "compensations": compensations
            }
        )
    
    # ==================== HELPER METHODS ====================
    
    def _midpoint(self, a: Tuple, b: Tuple) -> Tuple:
        """Calculate midpoint between two landmarks"""
        a_arr = np.array(a[:3])
        b_arr = np.array(b[:3])
        mid = (a_arr + b_arr) / 2
        return tuple(mid)
    
    def _empty_result(self) -> ROMResult:
        """Return empty result when calculation fails"""
        return ROMResult(
            angle=None,
            rom_current=None,
            rom_max=None,
            rom_min=None,
            symmetry_score=None,
            form_quality=None,
            compensation_detected=False,
            compensation_type=None,
            additional_metrics={}
        )
    
    def calculate_symmetry(self, left_angle: float, right_angle: float) -> float:
        """
        Calculate symmetry score (0-100).
        
        100 = perfect symmetry
        
        Args:
            left_angle: Angle measurement from left side
            right_angle: Angle measurement from right side
            
        Returns:
            Symmetry score (0-100), or None if angles are invalid
        """
        if left_angle is None or right_angle is None:
            return None
        
        diff = abs(left_angle - right_angle)
        avg = (left_angle + right_angle) / 2
        
        if avg == 0:
            return 100.0
        
        asymmetry_pct = (diff / avg) * 100
        symmetry_score = max(0.0, 100.0 - asymmetry_pct * 2)
        
        return symmetry_score
