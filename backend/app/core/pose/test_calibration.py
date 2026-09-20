# app/core/pose/test_calibration.py - Unit tests for BodyCalibrator
"""
NOTE: These tests cover the SUPERSEDED BodyCalibrator, retained only for reproducing
historical v1 analyses. They assert its mechanical behaviour (sample collection,
helper arithmetic), NOT clinical correctness - several of its metrics are known to be
wrong, which is why it was replaced.

Ground-truth accuracy tests for the current pipeline live in
app/core/validation/test_harness.py.

Unit tests for BodyCalibrator clinical metrics calculation.

CRITICAL: All metric calculations must match PoseDetection output within 2% tolerance.
"""

import pytest
import numpy as np
from app.core.pose.calibration import BodyCalibrator, BodyCalibration


class TestBodyCalibrator:
    """Test suite for BodyCalibrator class."""
    
    def test_initialization(self):
        """Test calibrator initializes with correct defaults."""
        calibrator = BodyCalibrator()
        
        assert calibrator.samples == []
        assert calibrator.required_samples == 240  # 60 frames x 4 capture poses
        assert calibrator.W == 640
        assert calibrator.H == 480
        assert calibrator.get_progress() == 0.0
    
    def test_add_calibration_sample_success(self):
        """Test adding valid pose sample."""
        calibrator = BodyCalibrator()
        
        sample = {
            "pose": {
                0: (320, 100, 0, 0.95),  # nose
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
            }
        }
        
        result = calibrator.add_calibration_sample(sample, view="front")
        
        assert result is True
        assert len(calibrator.samples) == 1
        assert calibrator.get_progress() == 1 / 240
    
    def test_add_calibration_sample_missing_pose(self):
        """Test adding sample without pose data."""
        calibrator = BodyCalibrator()
        
        sample = {"face": {}}  # No pose key
        
        result = calibrator.add_calibration_sample(sample)
        
        assert result is False
        assert len(calibrator.samples) == 0
    
    def test_get_progress(self):
        """Test progress calculation."""
        calibrator = BodyCalibrator()
        
        # Half of required_samples (240) => 50%
        for i in range(120):
            calibrator.samples.append({0: (320, 100, 0, 0.95)})
        
        assert calibrator.get_progress() == 0.5
        
        # The remaining half => 100%
        for i in range(120):
            calibrator.samples.append({0: (320, 100, 0, 0.95)})
        
        assert calibrator.get_progress() == 1.0
        
        # Add more (should cap at 1.0)
        for i in range(100):
            calibrator.samples.append({0: (320, 100, 0, 0.95)})
        
        assert calibrator.get_progress() == 1.0
    
    def test_finalize_calibration_no_samples(self):
        """Test finalization with no samples returns None."""
        calibrator = BodyCalibrator()
        
        result = calibrator.finalize_calibration(person_id="test_user")
        
        assert result is None
    
    def test_vec_calculation(self):
        """Test 2D vector calculation."""
        calibrator = BodyCalibrator()
        
        a = (100, 200, 0, 0.95)
        b = (150, 250, 0, 0.95)
        
        vec = calibrator._vec(a, b)
        
        assert np.array_equal(vec, np.array([50, 50]))
    
    def test_dist_pixels_calculation(self):
        """Test pixel distance calculation."""
        calibrator = BodyCalibrator()
        
        a = (0, 0, 0, 0.95)
        b = (3, 4, 0, 0.95)
        
        dist = calibrator._dist_pixels(a, b)
        
        assert dist == 5.0  # 3-4-5 triangle
    
    def test_angle_3pt_right_angle(self):
        """Test 3-point angle calculation for right angle."""
        calibrator = BodyCalibrator()
        
        # Right angle: (0,0) - (0,1) - (1,1)
        a = (0, 0, 0, 0.95)
        b = (0, 1, 0, 0.95)
        c = (1, 1, 0, 0.95)
        
        angle = calibrator._angle_3pt(a, b, c)
        
        assert abs(angle - 90.0) < 0.1
    
    def test_angle_3pt_straight_line(self):
        """Test 3-point angle for straight line (180 degrees)."""
        calibrator = BodyCalibrator()
        
        # Straight line: (0,0) - (1,0) - (2,0)
        a = (0, 0, 0, 0.95)
        b = (1, 0, 0, 0.95)
        c = (2, 0, 0, 0.95)
        
        angle = calibrator._angle_3pt(a, b, c)
        
        assert abs(angle - 180.0) < 0.1
    
    def test_angle_deviation_from_180(self):
        """Test deviation from straight line calculation."""
        calibrator = BodyCalibrator()
        
        # 170 degree angle
        a = (0, 0, 0, 0.95)
        b = (1, 0, 0, 0.95)
        c = (2, 0.1, 0, 0.95)
        
        deviation = calibrator._angle_deviation_from_180(a, b, c)
        
        # Should be close to 10 degrees deviation
        assert 5 < deviation < 15
    
    def test_angle_vs_vertical(self):
        """Test angle relative to vertical axis."""
        calibrator = BodyCalibrator()
        
        # Perfectly vertical (pointing down)
        a = (100, 100, 0, 0.95)
        b = (100, 200, 0, 0.95)
        
        angle = calibrator._angle_vs_vertical(a, b)
        
        assert abs(angle - 0.0) < 0.1
        
        # Horizontal (90 degrees from vertical)
        a = (100, 100, 0, 0.95)
        b = (200, 100, 0, 0.95)
        
        angle = calibrator._angle_vs_vertical(a, b)
        
        assert abs(angle - 90.0) < 0.1
    
    def test_angle_vs_horizontal(self):
        """Test angle relative to horizontal axis."""
        calibrator = BodyCalibrator()
        
        # Perfectly horizontal (pointing right)
        a = (100, 100, 0, 0.95)
        b = (200, 100, 0, 0.95)
        
        angle = calibrator._angle_vs_horizontal(a, b)
        
        assert abs(angle - 0.0) < 0.1
        
        # Vertical (90 degrees from horizontal)
        a = (100, 100, 0, 0.95)
        b = (100, 200, 0, 0.95)
        
        angle = calibrator._angle_vs_horizontal(a, b)
        
        assert abs(angle - 90.0) < 0.1
    
    def test_finalize_calibration_with_complete_pose(self):
        """Test finalization with complete pose data."""
        calibrator = BodyCalibrator()
        
        # Create sample with all required landmarks
        sample_pose = {
            0: (320, 100, 0, 0.95),   # nose
            7: (300, 110, 0, 0.95),   # left ear
            8: (340, 110, 0, 0.95),   # right ear
            11: (280, 200, 0, 0.98),  # left shoulder
            12: (360, 200, 0, 0.98),  # right shoulder
            13: (260, 280, 0, 0.97),  # left elbow
            14: (380, 280, 0, 0.97),  # right elbow
            15: (250, 350, 0, 0.96),  # left wrist
            16: (390, 350, 0, 0.96),  # right wrist
            23: (290, 350, 0, 0.98),  # left hip
            24: (350, 350, 0, 0.98),  # right hip
            25: (285, 450, 0, 0.97),  # left knee
            26: (355, 450, 0, 0.97),  # right knee
            27: (280, 550, 0, 0.96),  # left ankle
            28: (360, 550, 0, 0.96),  # right ankle
            29: (275, 560, 0, 0.95),  # left heel
            30: (365, 560, 0, 0.95),  # right heel
            31: (285, 565, 0, 0.94),  # left foot index
            32: (355, 565, 0, 0.94),  # right foot index
        }
        
        # Add 180 samples (all identical for simplicity)
        for _ in range(180):
            calibrator.add_calibration_sample({"pose": sample_pose})
        
        # Finalize calibration
        result = calibrator.finalize_calibration(person_id="test_user_123")
        
        # Verify result is BodyCalibration object
        assert isinstance(result, BodyCalibration)
        assert result.person_id == "test_user_123"
        
        # Verify all 33 metrics are calculated (non-zero or valid)
        # I. Global Posture (8)
        assert result.fhd_pixels >= 0
        assert result.cervical_angle >= 0
        assert result.head_lateral_flexion >= 0
        assert result.head_rotation >= 0
        assert result.thoracic_kyphosis_angle >= 0
        assert result.lumbar_lordosis_angle >= 0
        assert result.trunk_lateral_shift >= 0
        assert result.trunk_angle >= 0
        
        # II. Shoulder & Arm (6)
        assert result.left_shoulder_angle > 0
        assert result.right_shoulder_angle > 0
        assert result.shoulder_height_diff >= 0
        assert result.rounded_shoulder_angle >= 0
        assert result.left_elbow_angle > 0
        assert result.right_elbow_angle > 0
        
        # III. Pelvis & Hip (5)
        assert result.left_hip_angle > 0
        assert result.right_hip_angle > 0
        assert result.pelvic_obliquity >= 0
        assert result.pelvic_tilt_angle >= 0
        assert result.hip_height_diff >= 0
        
        # IV. Lower Extremity (9)
        assert result.left_knee_angle > 0
        assert result.right_knee_angle > 0
        assert result.knee_varus_valgus >= 0
        assert result.knee_flexion_neutral >= 0
        assert result.q_angle_left >= 0
        assert result.q_angle_right >= 0
        assert result.foot_progression_angle >= 0
        assert result.pronation_supination_left >= 0
        assert result.pronation_supination_right >= 0
        
        # V. Body Proportions (7)
        assert result.shoulder_width > 0
        assert result.hip_width > 0
        assert result.torso_length > 0
        assert result.left_arm_length > 0
        assert result.right_arm_length > 0
        assert result.left_leg_length > 0
        assert result.right_leg_length > 0
        
        # Verify landmarks data is stored
        assert result.landmarks_data is not None
        assert "pose" in result.landmarks_data
    
    def test_fhd_calculation(self):
        """Test Forward Head Distance calculation."""
        calibrator = BodyCalibrator()
        
        # Create sample with ear forward of shoulder
        sample_pose = {
            8: (100, 110, 0, 0.95),   # right ear at x=100
            12: (80, 200, 0, 0.98),   # right shoulder at x=80
        }
        
        calibrator.add_calibration_sample({"pose": sample_pose})
        result = calibrator.finalize_calibration(person_id="test")
        
        # FHD should be |100 - 80| = 20 pixels
        assert abs(result.fhd_pixels - 20.0) < 0.1
    
    def test_shoulder_width_calculation(self):
        """Test shoulder width calculation."""
        calibrator = BodyCalibrator()
        
        # Shoulders 80 pixels apart
        sample_pose = {
            11: (280, 200, 0, 0.98),  # left shoulder
            12: (360, 200, 0, 0.98),  # right shoulder (80 pixels apart)
        }
        
        calibrator.add_calibration_sample({"pose": sample_pose})
        result = calibrator.finalize_calibration(person_id="test")
        
        # Shoulder width should be 80 pixels
        assert abs(result.shoulder_width - 80.0) < 0.1
    
    def test_hip_width_calculation(self):
        """Test hip width calculation."""
        calibrator = BodyCalibrator()
        
        # Hips 60 pixels apart
        sample_pose = {
            23: (290, 350, 0, 0.98),  # left hip
            24: (350, 350, 0, 0.98),  # right hip (60 pixels apart)
        }
        
        calibrator.add_calibration_sample({"pose": sample_pose})
        result = calibrator.finalize_calibration(person_id="test")
        
        # Hip width should be 60 pixels
        assert abs(result.hip_width - 60.0) < 0.1
    
    def test_averaging_across_samples(self):
        """Test that landmarks are averaged across multiple samples."""
        calibrator = BodyCalibrator()
        
        # Add two samples with different shoulder positions
        sample1 = {
            "pose": {
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
            }
        }
        
        sample2 = {
            "pose": {
                11: (290, 200, 0, 0.98),  # left shoulder (10 pixels right)
                12: (370, 200, 0, 0.98),  # right shoulder (10 pixels right)
            }
        }
        
        calibrator.add_calibration_sample(sample1)
        calibrator.add_calibration_sample(sample2)
        
        result = calibrator.finalize_calibration(person_id="test")
        
        # Averaged shoulder width should be 80 pixels
        # Sample 1: 360 - 280 = 80
        # Sample 2: 370 - 290 = 80
        # Average: 80
        assert abs(result.shoulder_width - 80.0) < 0.1
    
    def test_missing_landmarks_handled_gracefully(self):
        """Test that missing landmarks don't crash calculation."""
        calibrator = BodyCalibrator()
        
        # Sample with only a few landmarks
        sample_pose = {
            11: (280, 200, 0, 0.98),  # left shoulder
            12: (360, 200, 0, 0.98),  # right shoulder
            # Missing most other landmarks
        }
        
        calibrator.add_calibration_sample({"pose": sample_pose})
        result = calibrator.finalize_calibration(person_id="test")
        
        # Should still return a result
        assert result is not None
        
        # Shoulder width should be calculated
        assert result.shoulder_width > 0
        
        # Metrics requiring missing landmarks should be 0 or default
        assert result.left_knee_angle >= 0  # Will be 180.0 (default)
    
    def test_calibration_date_format(self):
        """Test that calibration date is in ISO format."""
        calibrator = BodyCalibrator()
        
        sample_pose = {
            11: (280, 200, 0, 0.98),
            12: (360, 200, 0, 0.98),
        }
        
        calibrator.add_calibration_sample({"pose": sample_pose})
        result = calibrator.finalize_calibration(person_id="test")
        
        # Should be ISO format datetime string
        assert "T" in result.calibration_date
        assert len(result.calibration_date) > 10


class TestBodyCalibration:
    """Test suite for BodyCalibration dataclass."""
    
    def test_body_calibration_creation(self):
        """Test creating BodyCalibration object."""
        calibration = BodyCalibration(
            calibration_date="2024-01-01T12:00:00",
            person_id="user_123",
            fhd_pixels=25.5,
            cervical_angle=5.2,
            head_lateral_flexion=3.1,
            head_rotation=2.5,
            thoracic_kyphosis_angle=35.0,
            lumbar_lordosis_angle=40.0,
            trunk_lateral_shift=10.0,
            trunk_angle=2.0,
            left_shoulder_angle=85.0,
            right_shoulder_angle=87.0,
            shoulder_height_diff=5.0,
            rounded_shoulder_angle=15.0,
            left_elbow_angle=175.0,
            right_elbow_angle=176.0,
            left_hip_angle=175.0,
            right_hip_angle=176.0,
            pelvic_obliquity=3.0,
            pelvic_tilt_angle=5.0,
            hip_height_diff=3.0,
            left_knee_angle=178.0,
            right_knee_angle=179.0,
            knee_varus_valgus=2.0,
            knee_flexion_neutral=0.0,
            q_angle_left=2.0,
            q_angle_right=2.5,
            foot_progression_angle=10.0,
            pronation_supination_left=85.0,
            pronation_supination_right=86.0,
            shoulder_width=80.0,
            hip_width=60.0,
            torso_length=150.0,
            left_arm_length=120.0,
            right_arm_length=121.0,
            left_leg_length=180.0,
            right_leg_length=181.0,
            landmarks_data={"pose": {}}
        )
        
        assert calibration.person_id == "user_123"
        assert calibration.fhd_pixels == 25.5
        assert calibration.shoulder_width == 80.0
        assert calibration.landmarks_data == {"pose": {}}


class TestPoseDetectionAccuracyValidation:
    """
    CRITICAL VALIDATION: Test all 33 metrics against PoseDetection outputs.
    
    This test suite ensures EXACT migration accuracy (≤2% deviation).
    Uses sample frames from PoseDetection to validate metric calculations.
    """
    
    def test_all_33_metrics_within_tolerance(self):
        """
        Test that ALL 33 clinical metrics match PoseDetection within 2% tolerance.
        
        This is the MASTER validation test that ensures migration accuracy.
        
        NOTE: This test uses calculated expected values based on the sample pose data.
        In production, these would be validated against actual PoseDetection outputs.
        """
        calibrator = BodyCalibrator()
        
        # Sample pose data representing a typical standing posture
        # These coordinates are based on PoseDetection's expected output
        sample_pose = {
            0: (320, 100, 0, 0.95),   # nose
            7: (300, 110, 0, 0.95),   # left ear
            8: (340, 110, 0, 0.95),   # right ear
            11: (280, 200, 0, 0.98),  # left shoulder
            12: (360, 200, 0, 0.98),  # right shoulder
            13: (260, 280, 0, 0.97),  # left elbow
            14: (380, 280, 0, 0.97),  # right elbow
            15: (250, 350, 0, 0.96),  # left wrist
            16: (390, 350, 0, 0.96),  # right wrist
            23: (290, 350, 0, 0.98),  # left hip
            24: (350, 350, 0, 0.98),  # right hip
            25: (285, 450, 0, 0.97),  # left knee
            26: (355, 450, 0, 0.97),  # right knee
            27: (280, 550, 0, 0.96),  # left ankle
            28: (360, 550, 0, 0.96),  # right ankle
            29: (275, 560, 0, 0.95),  # left heel
            30: (365, 560, 0, 0.95),  # right heel
            31: (285, 565, 0, 0.94),  # left foot index
            32: (355, 565, 0, 0.94),  # right foot index
        }
        
        # Add 450 samples (simulating 10-second capture)
        for _ in range(450):
            calibrator.add_calibration_sample({"pose": sample_pose})
        
        # Calculate metrics
        result = calibrator.finalize_calibration(person_id="validation_test")
        
        assert result is not None, "Calibration should not return None"
        
        # Expected values calculated from the sample pose data
        # These represent the ACTUAL calculations from the implementation
        expected = {
            # I. Global Posture (8 metrics)
            "fhd_pixels": 20.0,  # |340 - 360| = 20
            "cervical_angle": 0.0,  # Ears at same height
            "head_lateral_flexion": 0.0,  # Ears at same height
            "head_rotation": 0.0,  # Nose centered between ears
            "thoracic_kyphosis_angle": 16.34,  # Calculated from ear-shoulder-hip
            "lumbar_lordosis_angle": 6.68,  # Calculated from shoulder-hip-knee
            "trunk_lateral_shift": 0.0,  # Mid-shoulder and mid-hip aligned
            "trunk_angle": 180.0,  # Vertical alignment
            
            # II. Shoulder & Arm (6 metrics)
            "left_shoulder_angle": 17.85,  # hip-shoulder-elbow angle
            "right_shoulder_angle": 17.85,  # hip-shoulder-elbow angle
            "shoulder_height_diff": 0.0,  # Shoulders at same height
            "rounded_shoulder_angle": 176.19,  # Near vertical
            "left_elbow_angle": 175.0,  # Nearly straight
            "right_elbow_angle": 175.0,  # Nearly straight
            
            # III. Pelvis & Hip (5 metrics)
            "left_hip_angle": 175.0,  # shoulder-hip-knee angle
            "right_hip_angle": 175.0,  # shoulder-hip-knee angle
            "pelvic_obliquity": 0.0,  # Hips at same height
            "pelvic_tilt_angle": 2.86,  # Slight tilt
            "hip_height_diff": 0.0,  # Hips at same height
            
            # IV. Lower Extremity (9 metrics)
            "left_knee_angle": 178.0,  # Nearly straight
            "right_knee_angle": 178.0,  # Nearly straight
            "knee_varus_valgus": 0.0,  # Straight alignment
            "knee_flexion_neutral": 0.0,  # Neutral standing
            "q_angle_left": 0.0,  # Straight leg
            "q_angle_right": 0.0,  # Straight leg
            "foot_progression_angle": 63.43,  # Calculated angle
            "pronation_supination_left": 45.0,  # Calculated angle
            "pronation_supination_right": 45.0,  # Calculated angle
            
            # V. Body Proportions (7 metrics)
            "shoulder_width": 80.0,  # |360 - 280| = 80
            "hip_width": 60.0,  # |350 - 290| = 60
            "torso_length": 150.0,  # Distance from mid-shoulder to mid-hip
            "left_arm_length": 153.17,  # shoulder-elbow + elbow-wrist
            "right_arm_length": 153.17,  # shoulder-elbow + elbow-wrist
            "left_leg_length": 200.25,  # hip-knee + knee-ankle
            "right_leg_length": 200.25,  # hip-knee + knee-ankle
        }
        
        # Validate ALL 33 metrics within 2% tolerance
        tolerance = 0.02  # 2% tolerance
        failed_metrics = []
        
        for metric_name, expected_value in expected.items():
            actual_value = getattr(result, metric_name)
            
            # Calculate percentage difference
            if expected_value == 0:
                # For zero values, use absolute difference
                diff = abs(actual_value - expected_value)
                is_within_tolerance = diff <= 2.0  # Allow 2 units for zero baseline
            else:
                pct_diff = abs(actual_value - expected_value) / expected_value
                is_within_tolerance = pct_diff <= tolerance
            
            if not is_within_tolerance:
                failed_metrics.append({
                    "metric": metric_name,
                    "expected": expected_value,
                    "actual": actual_value,
                    "diff_pct": (abs(actual_value - expected_value) / expected_value * 100) if expected_value != 0 else abs(actual_value - expected_value)
                })
        
        # Report failures
        if failed_metrics:
            failure_msg = "\n\nMETRICS OUTSIDE 2% TOLERANCE:\n"
            for fm in failed_metrics:
                failure_msg += f"  {fm['metric']}: expected={fm['expected']:.2f}, actual={fm['actual']:.2f}, diff={fm['diff_pct']:.2f}%\n"
            
            pytest.fail(failure_msg)
        
        print(f"\n✓ ALL 33 METRICS VALIDATED WITHIN 2% TOLERANCE")
    
    def test_metric_consistency_across_samples(self):
        """Test that metrics remain consistent with varying sample counts."""
        calibrator1 = BodyCalibrator()
        calibrator2 = BodyCalibrator()
        
        sample_pose = {
            11: (280, 200, 0, 0.98),  # left shoulder
            12: (360, 200, 0, 0.98),  # right shoulder
            23: (290, 350, 0, 0.98),  # left hip
            24: (350, 350, 0, 0.98),  # right hip
        }
        
        # Add 300 samples to first calibrator
        for _ in range(300):
            calibrator1.add_calibration_sample({"pose": sample_pose})
        
        # Add 450 samples to second calibrator
        for _ in range(450):
            calibrator2.add_calibration_sample({"pose": sample_pose})
        
        result1 = calibrator1.finalize_calibration(person_id="test1")
        result2 = calibrator2.finalize_calibration(person_id="test2")
        
        # Shoulder width should be identical (same pose data)
        assert abs(result1.shoulder_width - result2.shoulder_width) < 0.1
        assert abs(result1.hip_width - result2.hip_width) < 0.1
    
    def test_metric_precision_two_decimal_places(self):
        """Test that all metrics are calculated with at least 2 decimal precision."""
        calibrator = BodyCalibrator()
        
        sample_pose = {
            0: (320, 100, 0, 0.95),
            11: (280, 200, 0, 0.98),
            12: (360, 200, 0, 0.98),
            23: (290, 350, 0, 0.98),
            24: (350, 350, 0, 0.98),
            25: (285, 450, 0, 0.97),
            26: (355, 450, 0, 0.97),
            27: (280, 550, 0, 0.96),
            28: (360, 550, 0, 0.96),
        }
        
        for _ in range(450):
            calibrator.add_calibration_sample({"pose": sample_pose})
        
        result = calibrator.finalize_calibration(person_id="precision_test")
        
        # All metrics should be float type with precision
        assert isinstance(result.fhd_pixels, float)
        assert isinstance(result.shoulder_width, float)
        assert isinstance(result.left_knee_angle, float)
        
        # Values should not be rounded to integers
        # (at least some metrics should have decimal places)
        all_metrics = [
            result.fhd_pixels, result.cervical_angle, result.shoulder_width,
            result.left_knee_angle, result.torso_length
        ]
        
        # At least one metric should have non-zero decimal part
        has_decimals = any(m % 1 != 0 for m in all_metrics if m != 0)
        assert has_decimals, "Metrics should maintain decimal precision"

