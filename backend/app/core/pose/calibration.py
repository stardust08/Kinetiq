# app/core/pose/calibration.py - Clinical Posture Analysis Calibration Engine
"""
BodyCalibrator - SUPERSEDED. Use app.core.pose.calibration_v2.PostureCalibrator.

Retained only so historical v1 analyses can be reproduced and so the validation
harness can measure the old behaviour against ground truth. It is no longer on any
request path.

Do not extend or reuse this module. Measured against the synthetic harness it has
three defects that make its output clinically unusable:

  1. `add_calibration_sample` accepts a `view` argument and discards it. Front,
     leftside, rightside and back samples are pooled and their landmark positions
     averaged, so left and right side views cancel. A 45-degree bent knee is reported
     as 179.8 degrees - a straight leg.
  2. `_angle_vs_vertical` measures against the DOWNWARD image axis using an unsigned
     arccos, so an upright trunk returns ~180 degrees rather than 0, and a forward lean
     is indistinguishable from a backward lean of the same size.
  3. Several metrics are not the quantity their name claims: `pelvic_tilt_angle` is
     thigh inclination, `q_angle_*` is the femorotibial angle, `cervical_angle`
     duplicates head tilt, and `knee_flexion_neutral` is hardcoded to 0.0.

See app/core/validation/test_harness.py for the regression tests that pin the
replacement's behaviour.
"""

from typing import Dict, List, Optional
import numpy as np
from dataclasses import dataclass
import time
from math import degrees
from datetime import datetime


@dataclass
class BodyCalibration:
    """Store comprehensive clinical posture metrics (33 total)."""
    calibration_date: str
    person_id: str

    # I. GLOBAL POSTURE (HEAD & SPINE) - 8 metrics
    fhd_pixels: float
    cervical_angle: float
    head_lateral_flexion: float
    head_rotation: float
    thoracic_kyphosis_angle: float
    lumbar_lordosis_angle: float
    trunk_lateral_shift: float
    trunk_angle: float

    # II. SHOULDER & ARM - 6 metrics
    left_shoulder_angle: float
    right_shoulder_angle: float
    shoulder_height_diff: float
    rounded_shoulder_angle: float
    left_elbow_angle: float
    right_elbow_angle: float

    # III. PELVIS & HIP - 5 metrics
    left_hip_angle: float
    right_hip_angle: float
    pelvic_obliquity: float
    pelvic_tilt_angle: float
    hip_height_diff: float

    # IV. LOWER EXTREMITY - 9 metrics
    left_knee_angle: float
    right_knee_angle: float
    knee_varus_valgus: float
    knee_flexion_neutral: float
    q_angle_left: float
    q_angle_right: float
    foot_progression_angle: float
    pronation_supination_left: float
    pronation_supination_right: float

    # V. BODY PROPORTIONS - 7 metrics
    shoulder_width: float
    hip_width: float
    torso_length: float
    left_arm_length: float
    right_arm_length: float
    left_leg_length: float
    right_leg_length: float

    landmarks_data: Optional[Dict] = None


class BodyCalibrator:
    """
    Clinical posture analysis engine.
    
    Collects 150 pose samples over 5 seconds (30 FPS) and calculates
    33 clinical metrics by averaging landmarks across all samples.
    
    Usage:
        calibrator = BodyCalibrator()
        
        # Collect samples (150 frames)
        for frame in frames:
            extracted = pose_processor.extract_landmarks(results, frame.shape)
            calibrator.add_calibration_sample(extracted, view="front")
        
        # Calculate metrics
        calibration = calibrator.finalize_calibration(person_id="user_123")
    """
    
    def __init__(self):
        """Initialize calibrator with empty sample collection."""
        self.samples: List[Dict] = []
        self.required_samples = 240  # 60 frames × 4 poses (Front, Left Side, Right Side, Back)
        # Standardize pixel scale (assuming 640x480 for calculation consistency)
        self.W, self.H = 640, 480
    
    def add_calibration_sample(self, extracted: Dict, view: str = "front") -> bool:
        """
        Add a pose sample to the collection.
        
        Args:
            extracted: Dictionary with "pose" key containing landmark data
            view: View type (default "front")
        
        Returns:
            True if sample was added successfully, False otherwise
        """
        if "pose" in extracted:
            pose_data = extracted["pose"]
            # Debug: Check what's in pose_data
            if len(self.samples) < 3:  # Only log first few
                print(f"add_calibration_sample: extracted type: {type(extracted)}")
                print(f"add_calibration_sample: extracted keys: {list(extracted.keys())}")
                print(f"add_calibration_sample: pose_data type: {type(pose_data)}")
                print(f"add_calibration_sample: pose_data keys (first 10): {list(pose_data.keys())[:10]}")
                # Check for specific landmarks
                for idx in [0, 11, 12, 23, 24, 25, 26, 27, 28]:
                    key = str(idx)
                    if idx in pose_data:
                        print(f"  Landmark {idx} (int): FOUND - {pose_data[idx][:2] if isinstance(pose_data[idx], (list, tuple)) else 'unknown format'}")
                    elif key in pose_data:
                        print(f"  Landmark {idx} (str): FOUND - {pose_data[key][:2] if isinstance(pose_data[key], (list, tuple)) else 'unknown format'}")
                    else:
                        print(f"  Landmark {idx}: NOT FOUND")
            
            # Store the pose data, not the full extracted dict
            # Debug: Check what we're about to store
            if len(self.samples) < 3:
                print(f"add_calibration_sample: About to store pose_data with {len(pose_data)} landmarks")
                print(f"add_calibration_sample: First 3 keys of pose_data: {list(pose_data.keys())[:3]}")
            
            self.samples.append(pose_data)
            
            # Debug: Check what was actually stored
            if len(self.samples) < 3:
                print(f"add_calibration_sample: Stored sample {len(self.samples)-1} with {len(self.samples[-1])} landmarks")
                print(f"add_calibration_sample: First 3 keys of stored sample: {list(self.samples[-1].keys())[:3]}")
            
            return True
        else:
            print(f"add_calibration_sample: No 'pose' key in extracted. Extracted keys: {list(extracted.keys()) if extracted else 'None'}")
        return False
    
    def get_progress(self) -> float:
        """
        Get calibration progress.
        
        Returns:
            Progress value between 0.0 and 1.0
        """
        return min(1.0, len(self.samples) / self.required_samples)
    
    # --- MATH HELPER METHODS ---
    
    def _vec(self, a, b) -> np.ndarray:
        """Calculate 2D vector from point a to point b."""
        return np.array(b[:2]) - np.array(a[:2])
    
    def _dist_pixels(self, a, b) -> float:
        """Calculate pixel distance between two points."""
        return float(np.linalg.norm(self._vec(a, b)))
    
    def _angle_3pt(self, a, b, c) -> float:
        """
        Calculate angle at point b formed by points a-b-c.
        
        Args:
            a, b, c: Points as tuples/arrays with at least (x, y) coordinates
        
        Returns:
            Angle in degrees
        """
        ba = self._vec(b, a)
        bc = self._vec(b, c)
        cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
        return float(degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))
    
    def _angle_deviation_from_180(self, a, b, c) -> float:
        """
        Calculate deviation from straight line (180 degrees).
        
        Useful for kyphosis, lordosis, and knee alignment where 180° is neutral.
        
        Returns:
            Absolute deviation from 180 degrees
        """
        angle = self._angle_3pt(a, b, c)
        return float(abs(180 - angle))
    
    def _angle_vs_vertical(self, a, b) -> float:
        """
        Calculate angle of vector a->b relative to vertical axis.
        
        Returns:
            Angle in degrees (0° = perfectly vertical)
        """
        v = self._vec(a, b)
        vertical = np.array([0, 1])
        cosine = np.dot(v, vertical) / (np.linalg.norm(v) + 1e-6)
        return float(degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))
    
    def _angle_vs_horizontal(self, a, b) -> float:
        """
        Calculate angle of vector a->b relative to horizontal axis.
        
        Returns:
            Angle in degrees (0° = perfectly horizontal)
        """
        v = self._vec(a, b)
        horiz = np.array([1, 0])
        cosine = np.dot(v, horiz) / (np.linalg.norm(v) + 1e-6)
        return float(degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))
    
    def finalize_calibration(self, person_id: str) -> Optional[BodyCalibration]:
        """
        Calculate all 33 clinical metrics from collected samples.
        
        Process:
        1. Average all landmark positions across samples
        2. Calculate each metric using averaged landmarks
        3. Return BodyCalibration object with all metrics
        
        Args:
            person_id: User/person identifier
        
        Returns:
            BodyCalibration object with all 33 metrics, or None if no samples
        """
        if not self.samples:
            print("DEBUG: No samples in calibrator!")
            return None
        
        print(f"DEBUG: Calibrator has {len(self.samples)} samples")
        if self.samples:
            print(f"DEBUG: First sample type: {type(self.samples[0])}")
            print(f"DEBUG: First sample keys: {list(self.samples[0].keys())}")
            print(f"DEBUG: Number of keys in first sample: {len(self.samples[0])}")
            
            # Check if this looks like pose data or full sample
            if 'pose' in self.samples[0]:
                print(f"DEBUG: First sample contains 'pose' key - this is a FULL sample, not pose data!")
                print(f"DEBUG: self.samples[0]['pose'] type: {type(self.samples[0]['pose'])}")
                print(f"DEBUG: self.samples[0]['pose'] keys (first 5): {list(self.samples[0]['pose'].keys())[:5]}")
            else:
                print(f"DEBUG: First sample does NOT contain 'pose' key - this should be pose data")
                # Check if it has numeric keys
                numeric_keys = [k for k in self.samples[0].keys() if isinstance(k, (int, str)) and str(k).isdigit()]
                print(f"DEBUG: First sample has {len(numeric_keys)} numeric keys (first 5): {numeric_keys[:5]}")
        
        def get_avg_lm(idx):
            """Get averaged landmark position across all samples."""
            # Try both string and integer keys since JSON keys might be strings
            coords = []
            found_count = 0
            for i, s in enumerate(self.samples):
                landmark = None
                # Try integer key first
                if idx in s:
                    landmark = s[idx]
                # Try string key
                elif str(idx) in s:
                    landmark = s[str(idx)]
                
                if landmark is not None:
                    found_count += 1
                    # Convert to numpy array if needed
                    if isinstance(landmark, (list, tuple)):
                        coords.append(np.array(landmark))
                    else:
                        coords.append(landmark)
                elif i < 3:  # Debug why not found
                    print(f"  Sample {i}: idx={idx}, s type={type(s)}, s keys (first 5)={list(s.keys())[:5] if s else 'empty'}")
                    print(f"  Sample {i}: idx in s = {idx in s}, str(idx) in s = {str(idx) in s}")
                
                # Debug first few samples
                if i < 3 and idx in [0, 11, 12, 23, 24, 25, 26, 27, 28]:
                    print(f"  Sample {i}, looking for landmark {idx}: {'FOUND' if landmark is not None else 'NOT FOUND'}")
            
            print(f"get_avg_lm({idx}): found in {found_count}/{len(self.samples)} samples")
            if not coords:
                return None
            return np.mean(coords, axis=0)
        
        # Extract averaged landmarks (MediaPipe Pose indices)
        nose = get_avg_lm(0)
        l_ear, r_ear = get_avg_lm(7), get_avg_lm(8)
        l_sh, r_sh = get_avg_lm(11), get_avg_lm(12)
        l_elb, r_elb = get_avg_lm(13), get_avg_lm(14)
        l_wri, r_wri = get_avg_lm(15), get_avg_lm(16)
        l_hip, r_hip = get_avg_lm(23), get_avg_lm(24)
        l_knee, r_knee = get_avg_lm(25), get_avg_lm(26)
        l_ank, r_ank = get_avg_lm(27), get_avg_lm(28)
        l_heel, r_heel = get_avg_lm(29), get_avg_lm(30)
        l_foot, r_foot = get_avg_lm(31), get_avg_lm(32)
        
        # Debug: Check which landmarks are missing
        print(f"DEBUG - Landmarks found:")
        print(f"  Nose: {'Yes' if nose is not None else 'No'}")
        print(f"  Left hip: {'Yes' if l_hip is not None else 'No'} (index 23)")
        print(f"  Right hip: {'Yes' if r_hip is not None else 'No'} (index 24)")
        print(f"  Left knee: {'Yes' if l_knee is not None else 'No'} (index 25)")
        print(f"  Right knee: {'Yes' if r_knee is not None else 'No'} (index 26)")
        print(f"  Left ankle: {'Yes' if l_ank is not None else 'No'} (index 27)")
        print(f"  Right ankle: {'Yes' if r_ank is not None else 'No'} (index 28)")
        print(f"  Total samples: {len(self.samples)}")
        
        # Debug: Check what landmarks are actually in the first sample
        if self.samples:
            first_sample = self.samples[0]
            print(f"DEBUG - First sample keys (first 20): {list(first_sample.keys())[:20]}")
            
            # Check for specific landmarks
            for idx in [0, 23, 24, 25, 26, 27, 28]:
                if idx in first_sample:
                    print(f"  Landmark {idx} (int): FOUND")
                elif str(idx) in first_sample:
                    print(f"  Landmark {idx} (str): FOUND")
                else:
                    print(f"  Landmark {idx}: NOT FOUND")
        
        # --- I. GLOBAL POSTURE (HEAD & SPINE) ---
        
        # 1. FHD (Forward Head Distance) - Horizontal distance from ear to shoulder
        fhd = float(abs(r_ear[0] - r_sh[0])) if r_ear is not None and r_sh is not None else 0.0
        
        # 2. Cervical Angle (Head Tilt)
        head_tilt = 0.0
        if l_ear is not None and r_ear is not None:
            head_tilt = float(abs(self._angle_vs_horizontal(l_ear, r_ear)))
        
        # 3. Head Rotation (Yaw) - Asymmetry between nose-ear distances
        head_rot = 0.0
        if nose is not None and l_ear is not None and r_ear is not None:
            d_left = np.linalg.norm(nose[:2] - l_ear[:2])
            d_right = np.linalg.norm(nose[:2] - r_ear[:2])
            if (d_left + d_right) > 0:
                head_rot = float(abs(d_left - d_right) / (d_left + d_right) * 100)
        
        # 4. Shoulder Height Difference (Pixels)
        sh_diff = float(abs(l_sh[1] - r_sh[1])) if l_sh is not None and r_sh is not None else 0.0
        
        # 5. Rounded Shoulders - Deviation from vertical alignment of hip-shoulder
        rounded_angle = 0.0
        if r_sh is not None and r_hip is not None:
            # 0° = perfect vertical alignment, >0° = forward lean
            rounded_angle = float(self._angle_vs_vertical(r_hip, r_sh))
        
        # 6. Thoracic Kyphosis - Deviation from straight line ear-shoulder-hip
        # Normal range: 20-40° deviation from straight
        kyphosis = 0.0
        if r_ear is not None and r_sh is not None and r_hip is not None:
            kyphosis = self._angle_deviation_from_180(r_ear, r_sh, r_hip)
        
        # 7. Lumbar Lordosis - Deviation from straight shoulder-hip-knee
        lordosis = 0.0
        if r_sh is not None and r_hip is not None and r_knee is not None:
            lordosis = self._angle_deviation_from_180(r_sh, r_hip, r_knee)
        
        # 8. Trunk Shift and Angle
        trunk_shift = 0.0
        trunk_ang = 0.0
        if l_sh is not None and r_sh is not None and l_hip is not None and r_hip is not None:
            mid_sh = (l_sh + r_sh) / 2
            mid_hip = (l_hip + r_hip) / 2
            trunk_shift = float(abs(mid_sh[0] - mid_hip[0]))
            trunk_ang = float(self._angle_vs_vertical(mid_hip, mid_sh))
        
        # --- II. SHOULDER & ARM ---
        
        # Shoulder angles (hip-shoulder-elbow)
        left_shoulder_angle = self._angle_3pt(l_hip, l_sh, l_elb) if (l_hip is not None and l_sh is not None and l_elb is not None) else 0.0
        right_shoulder_angle = self._angle_3pt(r_hip, r_sh, r_elb) if (r_hip is not None and r_sh is not None and r_elb is not None) else 0.0
        
        # Elbow angles (shoulder-elbow-wrist)
        left_elbow_angle = self._angle_3pt(l_sh, l_elb, l_wri) if (l_sh is not None and l_elb is not None and l_wri is not None) else 0.0
        right_elbow_angle = self._angle_3pt(r_sh, r_elb, r_wri) if (r_sh is not None and r_elb is not None and r_wri is not None) else 0.0
        
        # --- III. PELVIS & HIP ---
        
        # Pelvic Obliquity (Hip height difference in pixels)
        pelvic_diff = float(abs(l_hip[1] - r_hip[1])) if l_hip is not None and r_hip is not None else 0.0
        
        # Pelvic Tilt (Approximation using hip-knee vertical angle)
        pelvic_tilt = 0.0
        if r_hip is not None and r_knee is not None:
            pelvic_tilt = float(self._angle_vs_vertical(r_hip, r_knee))
        
        # Hip angles (shoulder-hip-knee)
        left_hip_angle = self._angle_3pt(l_sh, l_hip, l_knee) if (l_sh is not None and l_hip is not None and l_knee is not None) else 0.0
        right_hip_angle = self._angle_3pt(r_sh, r_hip, r_knee) if (r_sh is not None and r_hip is not None and r_knee is not None) else 0.0
        
        # --- IV. LOWER EXTREMITY ---
        
        # Knee angles (hip-knee-ankle)
        left_knee_angle = self._angle_3pt(l_hip, l_knee, l_ank) if (l_hip is not None and l_knee is not None and l_ank is not None) else 180.0
        right_knee_angle = self._angle_3pt(r_hip, r_knee, r_ank) if (r_hip is not None and r_knee is not None and r_ank is not None) else 180.0
        
        # Q-Angle / Varus-Valgus (Deviation from 180° = straight leg)
        l_q = self._angle_deviation_from_180(l_hip, l_knee, l_ank) if (l_hip is not None and l_knee is not None and l_ank is not None) else 0.0
        r_q = self._angle_deviation_from_180(r_hip, r_knee, r_ank) if (r_hip is not None and r_knee is not None and r_ank is not None) else 0.0
        knee_alignment = (l_q + r_q) / 2
        
        # Foot Progression Angle
        foot_ang = 0.0
        if r_heel is not None and r_foot is not None:
            foot_ang = float(self._angle_vs_vertical(r_heel, r_foot))
        
        # Pronation/Supination
        def get_pronation(ank, heel, foot):
            """Calculate pronation angle for a foot."""
            if ank is None or heel is None or foot is None:
                return 0.0
            v_foot = self._vec(heel, foot)
            v_ank = self._vec(ank, foot)
            cosine = np.dot(v_foot, v_ank) / (np.linalg.norm(v_foot) * np.linalg.norm(v_ank) + 1e-6)
            return float(degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))
        
        pron_l = get_pronation(l_ank, l_heel, l_foot)
        pron_r = get_pronation(r_ank, r_heel, r_foot)
        
        # --- V. BODY PROPORTIONS ---
        
        # Widths
        shoulder_width = self._dist_pixels(l_sh, r_sh) if l_sh is not None and r_sh is not None else 0.0
        hip_width = self._dist_pixels(l_hip, r_hip) if l_hip is not None and r_hip is not None else 0.0
        
        # Torso length (mid-shoulder to mid-hip)
        torso_length = 0.0
        if l_sh is not None and r_sh is not None and l_hip is not None and r_hip is not None:
            mid_sh = (l_sh + r_sh) / 2
            mid_hip = (l_hip + r_hip) / 2
            torso_length = self._dist_pixels(mid_sh, mid_hip)
        
        # Arm lengths (shoulder to elbow + elbow to wrist)
        left_arm_length = 0.0
        if l_sh is not None and l_elb is not None and l_wri is not None:
            left_arm_length = self._dist_pixels(l_sh, l_elb) + self._dist_pixels(l_elb, l_wri)
        
        right_arm_length = 0.0
        if r_sh is not None and r_elb is not None and r_wri is not None:
            right_arm_length = self._dist_pixels(r_sh, r_elb) + self._dist_pixels(r_elb, r_wri)
        
        # Leg lengths (hip to knee + knee to ankle)
        left_leg_length = 0.0
        if l_hip is not None and l_knee is not None and l_ank is not None:
            left_leg_length = self._dist_pixels(l_hip, l_knee) + self._dist_pixels(l_knee, l_ank)
        
        right_leg_length = 0.0
        if r_hip is not None and r_knee is not None and r_ank is not None:
            right_leg_length = self._dist_pixels(r_hip, r_knee) + self._dist_pixels(r_knee, r_ank)
        
        # Store landmarks data for visualization
        landmarks_dict = {}
        landmark_list = [
            nose, l_ear, r_ear, l_sh, r_sh, l_elb, r_elb, l_wri, r_wri,
            l_hip, r_hip, l_knee, r_knee, l_ank, r_ank, l_heel, r_heel, l_foot, r_foot
        ]
        for k, v in enumerate(landmark_list):
            if v is not None:
                landmarks_dict[k] = v.tolist()
        
        return BodyCalibration(
            calibration_date=datetime.utcnow().isoformat(),
            person_id=str(person_id),
            
            # I. Global Posture (8)
            fhd_pixels=fhd,
            cervical_angle=head_tilt,
            head_lateral_flexion=head_tilt,
            head_rotation=head_rot,
            thoracic_kyphosis_angle=kyphosis,
            lumbar_lordosis_angle=lordosis,
            trunk_lateral_shift=trunk_shift,
            trunk_angle=trunk_ang,
            
            # II. Shoulder & Arm (6)
            left_shoulder_angle=left_shoulder_angle,
            right_shoulder_angle=right_shoulder_angle,
            shoulder_height_diff=sh_diff,
            rounded_shoulder_angle=rounded_angle,
            left_elbow_angle=left_elbow_angle,
            right_elbow_angle=right_elbow_angle,
            
            # III. Pelvis & Hip (5)
            left_hip_angle=left_hip_angle,
            right_hip_angle=right_hip_angle,
            pelvic_obliquity=pelvic_diff,
            pelvic_tilt_angle=pelvic_tilt,
            hip_height_diff=pelvic_diff,
            
            # IV. Lower Extremity (9)
            left_knee_angle=left_knee_angle,
            right_knee_angle=right_knee_angle,
            knee_varus_valgus=knee_alignment,
            knee_flexion_neutral=0.0,  # Assumed neutral standing position
            q_angle_left=l_q,
            q_angle_right=r_q,
            foot_progression_angle=foot_ang,
            pronation_supination_left=pron_l,
            pronation_supination_right=pron_r,
            
            # V. Body Proportions (7)
            shoulder_width=shoulder_width,
            hip_width=hip_width,
            torso_length=torso_length,
            left_arm_length=left_arm_length,
            right_arm_length=right_arm_length,
            left_leg_length=left_leg_length,
            right_leg_length=right_leg_length,
            
            landmarks_data={"pose": landmarks_dict}
        )
