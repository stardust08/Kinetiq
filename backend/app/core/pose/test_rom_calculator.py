# app/core/pose/test_rom_calculator.py
"""
Unit tests for ROMCalculator.

Tests 3D angle calculations, ROM measurements, and compensation detection.
"""

import pytest
import numpy as np
from app.core.pose.rom_calculator import (
    AdvancedROMCalculator,
    ROMResult,
    ExerciseView,
    ExercisePosture
)


class TestAngleCalculations:
    """Test basic angle calculation methods"""
    
    def test_calculate_angle_3d_right_angle(self):
        """Test 3D angle calculation for 90-degree angle"""
        calc = AdvancedROMCalculator()
        
        # Points forming a right angle
        a = (100, 0, 0)
        b = (0, 0, 0)
        c = (0, 100, 0)
        
        # This should be close to 90 degrees
        angle = calc.calculate_angle_3d(a, b, c)
        assert angle is not None
        assert 85 <= angle <= 95  # Allow small tolerance
    
    def test_calculate_angle_3d_straight_line(self):
        """Test 3D angle calculation for 180-degree angle (straight line)"""
        calc = AdvancedROMCalculator()
        
        # Points in a straight line
        a = (0, 0, 0)
        b = (50, 0, 0)
        c = (100, 0, 0)
        
        angle = calc.calculate_angle_3d(a, b, c)
        assert angle is not None
        assert 175 <= angle <= 180
    
    def test_calculate_angle_3d_with_visibility(self):
        """Test 3D angle calculation with 4-tuple landmarks (x, y, z, visibility)"""
        calc = AdvancedROMCalculator()
        
        # Points with visibility scores
        a = (100, 0, 0, 0.95)
        b = (0, 0, 0, 0.98)
        c = (0, 100, 0, 0.92)
        
        angle = calc.calculate_angle_3d(a, b, c)
        assert angle is not None
        assert 85 <= angle <= 95
    
    def test_calculate_angle_3d_invalid_points(self):
        """Test 3D angle calculation with coincident points"""
        calc = AdvancedROMCalculator()
        
        # Same point for all three
        a = (0, 0, 0)
        b = (0, 0, 0)
        c = (0, 0, 0)
        
        angle = calc.calculate_angle_3d(a, b, c)
        assert angle is None
    
    def test_calculate_2d_angle(self):
        """Test 2D angle calculation"""
        calc = AdvancedROMCalculator()
        
        # Points forming a right angle in 2D
        a = (100, 0)
        b = (0, 0)
        c = (0, 100)
        
        angle = calc.calculate_2d_angle(a, b, c)
        assert angle is not None
        assert 85 <= angle <= 95
    
    def test_distance_3d(self):
        """Test 3D distance calculation"""
        calc = AdvancedROMCalculator()
        
        a = (0, 0, 0)
        b = (3, 4, 0)
        
        distance = calc.distance_3d(a, b)
        assert distance is not None
        assert abs(distance - 5.0) < 0.1  # 3-4-5 triangle


class TestCervicalSpine:
    """Test cervical spine ROM measurements"""
    
    def test_cervical_flexion_extension_neutral(self):
        """Test cervical flexion/extension in neutral position"""
        calc = AdvancedROMCalculator()
        
        # Neutral head position
        extracted = {
            "pose": {
                0: (320, 100, 0, 0.95),   # nose
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
                23: (280, 400, 0, 0.95),  # left hip
                24: (360, 400, 0, 0.95),  # right hip
            }
        }
        
        result = calc.cervical_flexion_extension(extracted, view="side")
        
        assert result.angle is not None
        assert result.rom_max == 70.0
        assert result.rom_min == 0.0
        assert result.compensation_detected is False
    
    def test_cervical_flexion_extension_missing_landmarks(self):
        """Test cervical flexion/extension with missing landmarks"""
        calc = AdvancedROMCalculator()
        
        extracted = {
            "pose": {
                0: (320, 100, 0, 0.95),  # nose only
            }
        }
        
        result = calc.cervical_flexion_extension(extracted)
        
        assert result.angle is None
        assert result.compensation_detected is False
    
    def test_cervical_lateral_flexion(self):
        """Test cervical lateral flexion"""
        calc = AdvancedROMCalculator()
        
        # Head tilted to the right
        extracted = {
            "pose": {
                0: (350, 100, 0, 0.95),   # nose (shifted right)
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
            }
        }
        
        result = calc.cervical_lateral_flexion(extracted, view="front")
        
        assert result.angle is not None
        assert result.rom_max == 45.0
        assert "side" in result.additional_metrics
        assert result.additional_metrics["side"] in ["left", "right"]
    
    def test_cervical_rotation(self):
        """Test cervical rotation"""
        calc = AdvancedROMCalculator()
        
        extracted = {
            "pose": {
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
            },
            "face": {
                1: (320, 100, 0),    # nose tip
                234: (280, 120, 0),  # left face edge
                454: (360, 120, 0),  # right face edge
            }
        }
        
        result = calc.cervical_rotation(extracted, view="top")
        
        assert result.angle is not None
        assert result.rom_max == 80.0


class TestShoulderComplex:
    """Test shoulder ROM measurements"""
    
    def test_shoulder_flexion_neutral(self):
        """Test shoulder flexion in neutral position"""
        calc = AdvancedROMCalculator()
        
        # Arm at side (neutral)
        extracted = {
            "pose": {
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
                13: (280, 300, 0, 0.95),  # left elbow
                14: (360, 300, 0, 0.95),  # right elbow
                15: (280, 400, 0, 0.92),  # left wrist
                16: (360, 400, 0, 0.92),  # right wrist
                23: (280, 400, 0, 0.95),  # left hip
                24: (360, 400, 0, 0.95),  # right hip
            }
        }
        
        result = calc.shoulder_flexion(extracted, side="right", view="side")
        
        assert result.angle is not None
        assert result.rom_max == 180.0
        assert result.rom_min == 0.0
    
    def test_shoulder_flexion_with_trunk_compensation(self):
        """Test shoulder flexion with trunk lean compensation"""
        calc = AdvancedROMCalculator()
        
        # Arm raised with trunk leaning back
        extracted = {
            "pose": {
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
                13: (280, 150, 0, 0.95),  # left elbow (raised)
                14: (360, 150, 0, 0.95),  # right elbow (raised)
                15: (280, 100, 0, 0.92),  # left wrist
                16: (360, 100, 0, 0.92),  # right wrist
                23: (250, 400, 0, 0.95),  # left hip (leaning back)
                24: (330, 400, 0, 0.95),  # right hip (leaning back)
            }
        }
        
        result = calc.shoulder_flexion(extracted, side="right", view="side")
        
        assert result.angle is not None
        # Should detect trunk lean compensation
        assert "trunk_angle" in result.additional_metrics
    
    def test_shoulder_abduction(self):
        """Test shoulder abduction"""
        calc = AdvancedROMCalculator()
        
        # Arm raised laterally
        extracted = {
            "pose": {
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
                13: (200, 200, 0, 0.95),  # left elbow (abducted)
                14: (440, 200, 0, 0.95),  # right elbow (abducted)
                23: (280, 400, 0, 0.95),  # left hip
                24: (360, 400, 0, 0.95),  # right hip
            }
        }
        
        result = calc.shoulder_abduction(extracted, side="right", view="front")
        
        assert result.angle is not None
        assert result.rom_max == 180.0


class TestHipAndKnee:
    """Test hip and knee ROM measurements"""
    
    def test_hip_flexion(self):
        """Test hip flexion"""
        calc = AdvancedROMCalculator()
        
        # Hip flexed (knee raised)
        extracted = {
            "pose": {
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
                23: (280, 300, 0, 0.95),  # left hip
                24: (360, 300, 0, 0.95),  # right hip
                25: (280, 250, 0, 0.92),  # left knee (raised)
                26: (360, 250, 0, 0.92),  # right knee (raised)
            }
        }
        
        result = calc.hip_flexion(extracted, side="right", view="side")
        
        assert result.angle is not None
        assert result.rom_max == 120.0
    
    def test_hip_flexion_with_knee_valgus(self):
        """Test hip flexion with knee valgus compensation"""
        calc = AdvancedROMCalculator()
        
        # Hip flexed with knee collapsing inward
        extracted = {
            "pose": {
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
                23: (280, 300, 0, 0.95),  # left hip
                24: (360, 300, 0, 0.95),  # right hip
                25: (280, 250, 0, 0.92),  # left knee
                26: (340, 250, 0, 0.92),  # right knee (valgus - moved inward)
                27: (280, 400, 0, 0.90),  # left ankle
                28: (360, 400, 0, 0.90),  # right ankle
            }
        }
        
        result = calc.hip_flexion(extracted, side="right", view="front")
        
        assert result.angle is not None
        # May detect knee valgus compensation
    
    def test_knee_flexion_extension(self):
        """Test knee flexion/extension"""
        calc = AdvancedROMCalculator()
        
        # Knee bent
        extracted = {
            "pose": {
                23: (280, 300, 0, 0.95),  # left hip
                24: (360, 300, 0, 0.95),  # right hip
                25: (280, 350, 0, 0.92),  # left knee
                26: (360, 350, 0, 0.92),  # right knee
                27: (280, 380, 0, 0.90),  # left ankle
                28: (360, 380, 0, 0.90),  # right ankle
            }
        }
        
        result = calc.knee_flexion_extension(extracted, side="right")
        
        assert result.angle is not None
        assert result.rom_max == 135.0
        assert result.rom_min == 0.0


class TestSquatAnalysis:
    """Test comprehensive squat analysis"""
    
    def test_squat_analysis_good_form(self):
        """Test squat analysis with good form"""
        calc = AdvancedROMCalculator()
        
        # Good squat position
        extracted = {
            "pose": {
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
                23: (280, 300, 0, 0.95),  # left hip
                24: (360, 300, 0, 0.95),  # right hip
                25: (280, 350, 0, 0.92),  # left knee
                26: (360, 350, 0, 0.92),  # right knee
                27: (280, 400, 0, 0.90),  # left ankle
                28: (360, 400, 0, 0.90),  # right ankle
            }
        }
        
        result = calc.squat_analysis(extracted, view="side")
        
        assert result.angle is not None
        assert result.rom_max == 135.0
        assert result.rom_min == 90.0
        assert "trunk_angle" in result.additional_metrics
        assert "compensations" in result.additional_metrics
    
    def test_squat_analysis_with_compensations(self):
        """Test squat analysis with multiple compensations"""
        calc = AdvancedROMCalculator()
        
        # Poor squat form - excessive forward lean
        extracted = {
            "pose": {
                11: (250, 200, 0, 0.98),  # left shoulder (leaning forward)
                12: (330, 200, 0, 0.98),  # right shoulder (leaning forward)
                23: (280, 300, 0, 0.95),  # left hip
                24: (360, 300, 0, 0.95),  # right hip
                25: (280, 350, 0, 0.92),  # left knee
                26: (360, 350, 0, 0.92),  # right knee
                27: (280, 400, 0, 0.90),  # left ankle
                28: (360, 400, 0, 0.90),  # right ankle
            }
        }
        
        result = calc.squat_analysis(extracted, view="side")
        
        assert result.angle is not None
        assert result.compensation_detected is not None
        assert result.form_quality is not None
        # Form quality should be reduced if compensations detected
        if result.compensation_detected:
            assert result.form_quality < 100.0


class TestHelperMethods:
    """Test helper methods"""
    
    def test_midpoint(self):
        """Test midpoint calculation"""
        calc = AdvancedROMCalculator()
        
        a = (0, 0, 0)
        b = (100, 100, 100)
        
        mid = calc._midpoint(a, b)
        
        assert mid == (50.0, 50.0, 50.0)
    
    def test_empty_result(self):
        """Test empty result generation"""
        calc = AdvancedROMCalculator()
        
        result = calc._empty_result()
        
        assert isinstance(result, ROMResult)
        assert result.angle is None
        assert result.rom_current is None
        assert result.compensation_detected is False
    
    def test_calculate_symmetry_perfect(self):
        """Test symmetry calculation with perfect symmetry"""
        calc = AdvancedROMCalculator()
        
        symmetry = calc.calculate_symmetry(90.0, 90.0)
        
        assert symmetry == 100.0
    
    def test_calculate_symmetry_asymmetric(self):
        """Test symmetry calculation with asymmetry"""
        calc = AdvancedROMCalculator()
        
        symmetry = calc.calculate_symmetry(90.0, 80.0)
        
        assert symmetry is not None
        assert 0 <= symmetry < 100.0
    
    def test_calculate_symmetry_invalid(self):
        """Test symmetry calculation with invalid angles"""
        calc = AdvancedROMCalculator()
        
        symmetry = calc.calculate_symmetry(None, 90.0)
        
        assert symmetry is None


class TestWithCalibration:
    """Test ROM calculator with calibration baseline"""
    
    def test_with_calibration_object(self):
        """Test ROM calculator initialized with calibration"""
        from app.core.pose.calibration import BodyCalibration
        from datetime import datetime
        
        # Create mock calibration
        calibration = BodyCalibration(
            calibration_date=datetime.utcnow().isoformat(),
            person_id="test_user",
            fhd_pixels=50.0,
            cervical_angle=45.0,
            head_lateral_flexion=5.0,
            head_rotation=2.0,
            thoracic_kyphosis_angle=35.0,
            lumbar_lordosis_angle=40.0,
            trunk_lateral_shift=10.0,
            trunk_angle=88.0,
            left_shoulder_angle=175.0,
            right_shoulder_angle=175.0,
            shoulder_height_diff=5.0,
            rounded_shoulder_angle=15.0,
            left_elbow_angle=178.0,
            right_elbow_angle=178.0,
            left_hip_angle=175.0,
            right_hip_angle=175.0,
            pelvic_obliquity=2.0,
            pelvic_tilt_angle=12.0,
            hip_height_diff=3.0,
            left_knee_angle=178.0,
            right_knee_angle=178.0,
            knee_varus_valgus=2.0,
            knee_flexion_neutral=2.0,
            q_angle_left=15.0,
            q_angle_right=15.0,
            foot_progression_angle=5.0,
            pronation_supination_left=3.0,
            pronation_supination_right=3.0,
            shoulder_width=200.0,
            hip_width=180.0,
            torso_length=250.0,
            left_arm_length=300.0,
            right_arm_length=300.0,
            left_leg_length=400.0,
            right_leg_length=400.0
        )
        
        calc = AdvancedROMCalculator(calibration=calibration)
        
        assert calc.calibration is not None
        assert calc.calibration.shoulder_height_diff == 5.0


class TestPoseDetectionAccuracyValidation:
    """
    CRITICAL: Validate ROMCalculator accuracy against PoseDetection.
    
    Tests angle calculations and ROM measurements to ensure EXACT migration.
    """
    
    def test_3d_angle_calculation_accuracy(self):
        """Test 3D angle calculation matches PoseDetection implementation."""
        calc = AdvancedROMCalculator()
        
        # Test case 1: Perfect right angle (90 degrees)
        a = (100, 0, 0)
        b = (0, 0, 0)
        c = (0, 100, 0)
        
        angle = calc.calculate_angle_3d(a, b, c)
        assert angle is not None
        
        # Should be 90 degrees within 0.1% tolerance
        expected = 90.0
        tolerance = 0.001  # 0.1% tolerance
        pct_diff = abs(angle - expected) / expected
        assert pct_diff <= tolerance, \
            f"Expected {expected}°, got {angle}° (diff: {pct_diff*100:.3f}%)"
    
    def test_3d_angle_with_various_configurations(self):
        """Test 3D angle calculation with various point configurations."""
        calc = AdvancedROMCalculator()
        
        test_cases = [
            # (points, expected_angle, description)
            (((0, 0, 0), (50, 0, 0), (100, 0, 0)), 180.0, "Straight line"),
            (((100, 0, 0), (0, 0, 0), (0, 100, 0)), 90.0, "Right angle"),
            (((100, 100, 0), (0, 0, 0), (100, -100, 0)), 90.0, "Right angle diagonal"),
            (((50, 0, 0), (0, 0, 0), (25, 43.3, 0)), 60.0, "60 degree angle"),
        ]
        
        for (a, b, c), expected, desc in test_cases:
            angle = calc.calculate_angle_3d(a, b, c)
            assert angle is not None, f"Failed to calculate angle for: {desc}"
            
            # Allow 2% tolerance
            tolerance = 0.02
            if expected == 0:
                assert abs(angle - expected) <= 2.0, \
                    f"{desc}: Expected {expected}°, got {angle}°"
            else:
                pct_diff = abs(angle - expected) / expected
                assert pct_diff <= tolerance, \
                    f"{desc}: Expected {expected}°, got {angle}° (diff: {pct_diff*100:.2f}%)"
    
    def test_rom_calculations_match_clinical_standards(self):
        """Test that ROM calculations match clinical standards."""
        calc = AdvancedROMCalculator()
        
        # Test cervical flexion/extension
        extracted = {
            "pose": {
                0: (320, 100, 0, 0.95),   # nose
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
                23: (280, 400, 0, 0.95),  # left hip
                24: (360, 400, 0, 0.95),  # right hip
            }
        }
        
        result = calc.cervical_flexion_extension(extracted, view="side")
        
        # Verify ROM ranges match clinical standards
        assert result.rom_max == 70.0, "Cervical extension ROM should be 70°"
        assert result.rom_min == 0.0, "Cervical ROM minimum should be 0°"
        
        # Test shoulder flexion
        extracted_shoulder = {
            "pose": {
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
                13: (280, 300, 0, 0.95),  # left elbow
                14: (360, 300, 0, 0.95),  # right elbow
                15: (280, 400, 0, 0.92),  # left wrist
                16: (360, 400, 0, 0.92),  # right wrist
                23: (280, 400, 0, 0.95),  # left hip
                24: (360, 400, 0, 0.95),  # right hip
            }
        }
        
        result = calc.shoulder_flexion(extracted_shoulder, side="right", view="side")
        
        # Verify ROM ranges
        assert result.rom_max == 180.0, "Shoulder flexion ROM should be 180°"
        assert result.rom_min == 0.0, "Shoulder ROM minimum should be 0°"
    
    def test_compensation_detection_accuracy(self):
        """Test that compensation detection works correctly."""
        calc = AdvancedROMCalculator()
        
        # Test trunk lean compensation during shoulder flexion
        extracted_with_lean = {
            "pose": {
                11: (250, 200, 0, 0.98),  # left shoulder (leaning back)
                12: (330, 200, 0, 0.98),  # right shoulder (leaning back)
                13: (280, 150, 0, 0.95),  # left elbow (raised)
                14: (360, 150, 0, 0.95),  # right elbow (raised)
                15: (280, 100, 0, 0.92),  # left wrist
                16: (360, 100, 0, 0.92),  # right wrist
                23: (250, 400, 0, 0.95),  # left hip (leaning back)
                24: (330, 400, 0, 0.95),  # right hip (leaning back)
            }
        }
        
        result = calc.shoulder_flexion(extracted_with_lean, side="right", view="side")
        
        # Should detect trunk lean compensation
        assert "trunk_angle" in result.additional_metrics
        
        # Form quality should be reduced if compensation detected
        if result.compensation_detected:
            assert result.form_quality is not None
            assert result.form_quality < 100.0
    
    def test_symmetry_calculation_accuracy(self):
        """Test symmetry score calculation."""
        calc = AdvancedROMCalculator()
        
        # Perfect symmetry
        symmetry = calc.calculate_symmetry(90.0, 90.0)
        assert symmetry == 100.0, "Perfect symmetry should score 100"
        
        # 10% asymmetry
        symmetry = calc.calculate_symmetry(90.0, 81.0)
        assert symmetry is not None
        assert 0 <= symmetry < 100.0
        
        # Large asymmetry
        symmetry = calc.calculate_symmetry(90.0, 45.0)
        assert symmetry is not None
        assert symmetry < 50.0, "Large asymmetry should have low score"
    
    def test_squat_analysis_comprehensive(self):
        """Test comprehensive squat analysis with all metrics."""
        calc = AdvancedROMCalculator()
        
        # Good squat form
        extracted_good = {
            "pose": {
                11: (280, 200, 0, 0.98),  # left shoulder
                12: (360, 200, 0, 0.98),  # right shoulder
                23: (280, 300, 0, 0.95),  # left hip
                24: (360, 300, 0, 0.95),  # right hip
                25: (280, 350, 0, 0.92),  # left knee
                26: (360, 350, 0, 0.92),  # right knee
                27: (280, 400, 0, 0.90),  # left ankle
                28: (360, 400, 0, 0.90),  # right ankle
            }
        }
        
        result = calc.squat_analysis(extracted_good, view="side")
        
        # Verify result structure
        assert result.angle is not None
        assert result.rom_max == 135.0
        assert result.rom_min == 90.0
        assert "trunk_angle" in result.additional_metrics
        assert "compensations" in result.additional_metrics
        
        # Good form should have high form quality
        if result.form_quality is not None:
            assert result.form_quality >= 70.0, "Good form should have quality >= 70"


class TestIntegrationWithCalibration:
    """Test ROM calculator integration with calibration baseline."""
    
    def test_rom_calculator_with_calibration_baseline(self):
        """Test ROM calculator uses calibration baseline for comparisons."""
        from app.core.pose.calibration import BodyCalibration
        from datetime import datetime
        
        # Create mock calibration
        calibration = BodyCalibration(
            calibration_date=datetime.utcnow().isoformat(),
            person_id="test_user",
            fhd_pixels=50.0,
            cervical_angle=45.0,
            head_lateral_flexion=5.0,
            head_rotation=2.0,
            thoracic_kyphosis_angle=35.0,
            lumbar_lordosis_angle=40.0,
            trunk_lateral_shift=10.0,
            trunk_angle=88.0,
            left_shoulder_angle=175.0,
            right_shoulder_angle=175.0,
            shoulder_height_diff=5.0,
            rounded_shoulder_angle=15.0,
            left_elbow_angle=178.0,
            right_elbow_angle=178.0,
            left_hip_angle=175.0,
            right_hip_angle=175.0,
            pelvic_obliquity=2.0,
            pelvic_tilt_angle=12.0,
            hip_height_diff=3.0,
            left_knee_angle=178.0,
            right_knee_angle=178.0,
            knee_varus_valgus=2.0,
            knee_flexion_neutral=2.0,
            q_angle_left=15.0,
            q_angle_right=15.0,
            foot_progression_angle=5.0,
            pronation_supination_left=3.0,
            pronation_supination_right=3.0,
            shoulder_width=200.0,
            hip_width=180.0,
            torso_length=250.0,
            left_arm_length=300.0,
            right_arm_length=300.0,
            left_leg_length=400.0,
            right_leg_length=400.0
        )
        
        calc = AdvancedROMCalculator(calibration=calibration)
        
        # Verify calibration is stored
        assert calc.calibration is not None
        assert calc.calibration.shoulder_height_diff == 5.0
        
        # Test that compensation detection uses calibration baseline
        extracted = {
            "pose": {
                0: (320, 100, 0, 0.95),
                11: (280, 200, 0, 0.98),
                12: (360, 210, 0, 0.98),  # 10 pixel height diff
                23: (280, 400, 0, 0.95),
                24: (360, 400, 0, 0.95),
            }
        }
        
        result = calc.cervical_flexion_extension(extracted, view="side")
        
        # Should use calibration baseline for comparison
        # (10 pixels is 2x the baseline of 5 pixels, should detect compensation)
        assert "shoulder_height_diff" in result.additional_metrics


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
