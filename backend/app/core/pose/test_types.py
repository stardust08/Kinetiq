# app/core/pose/test_types.py - Unit Tests for Shared Types
"""
Unit tests for shared type definitions in types.py.

Tests cover:
- Landmark creation and conversion
- LandmarkSet operations
- ExtractedLandmarks serialization
- BodyCalibration data structure
- ROMResult data structure
- Utility functions
"""

import pytest
from app.core.pose.types import (
    Landmark,
    LandmarkSet,
    ExtractedLandmarks,
    BodyCalibration,
    ROMResult,
    VisibilityCheck,
    CalibrationConfig,
    ExerciseView,
    ExercisePosture,
    PoseLandmark,
    HandLandmark,
    create_landmark_mapping,
    get_landmark_name
)


class TestLandmark:
    """Test Landmark dataclass"""
    
    def test_landmark_creation(self):
        """Test creating a landmark with all fields"""
        lm = Landmark(x=100.0, y=200.0, z=0.5, visibility=0.95)
        assert lm.x == 100.0
        assert lm.y == 200.0
        assert lm.z == 0.5
        assert lm.visibility == 0.95
    
    def test_landmark_default_visibility(self):
        """Test landmark with default visibility"""
        lm = Landmark(x=100.0, y=200.0, z=0.5)
        assert lm.visibility == 1.0
    
    def test_landmark_to_tuple(self):
        """Test converting landmark to tuple"""
        lm = Landmark(x=100.0, y=200.0, z=0.5, visibility=0.95)
        result = lm.to_tuple()
        assert result == (100.0, 200.0, 0.5, 0.95)
    
    def test_landmark_to_pixel_tuple(self):
        """Test converting landmark to pixel tuple"""
        lm = Landmark(x=100.5, y=200.7, z=0.5, visibility=0.95)
        result = lm.to_pixel_tuple()
        assert result == (100, 200, 0.5, 0.95)
    
    def test_landmark_from_tuple_full(self):
        """Test creating landmark from full tuple"""
        data = (100.0, 200.0, 0.5, 0.95)
        lm = Landmark.from_tuple(data)
        assert lm.x == 100.0
        assert lm.y == 200.0
        assert lm.z == 0.5
        assert lm.visibility == 0.95
    
    def test_landmark_from_tuple_no_visibility(self):
        """Test creating landmark from tuple without visibility"""
        data = (100.0, 200.0, 0.5)
        lm = Landmark.from_tuple(data)
        assert lm.x == 100.0
        assert lm.y == 200.0
        assert lm.z == 0.5
        assert lm.visibility == 1.0
    
    def test_landmark_from_tuple_invalid(self):
        """Test creating landmark from invalid tuple"""
        with pytest.raises(ValueError):
            Landmark.from_tuple((100.0, 200.0))


class TestLandmarkSet:
    """Test LandmarkSet dataclass"""
    
    def test_landmark_set_creation(self):
        """Test creating empty landmark set"""
        ls = LandmarkSet(landmark_type="pose")
        assert ls.landmark_type == "pose"
        assert len(ls.landmarks) == 0
    
    def test_add_landmark(self):
        """Test adding landmarks to set"""
        ls = LandmarkSet()
        lm = Landmark(x=100.0, y=200.0, z=0.5, visibility=0.95)
        ls.add_landmark(0, lm)
        
        assert ls.has_landmark(0)
        assert ls.get(0) == lm
    
    def test_get_nonexistent_landmark(self):
        """Test getting non-existent landmark"""
        ls = LandmarkSet()
        assert ls.get(999) is None
        assert not ls.has_landmark(999)
    
    def test_get_tuple(self):
        """Test getting landmark as tuple"""
        ls = LandmarkSet()
        lm = Landmark(x=100.0, y=200.0, z=0.5, visibility=0.95)
        ls.add_landmark(0, lm)
        
        result = ls.get_tuple(0)
        assert result == (100.0, 200.0, 0.5, 0.95)
    
    def test_get_visible_count(self):
        """Test counting visible landmarks"""
        ls = LandmarkSet()
        ls.add_landmark(0, Landmark(100, 200, 0.5, 0.9))  # Visible
        ls.add_landmark(1, Landmark(100, 200, 0.5, 0.5))  # Below threshold
        ls.add_landmark(2, Landmark(100, 200, 0.5, 0.8))  # Visible
        
        count = ls.get_visible_count(threshold=0.6)
        assert count == 2


class TestExtractedLandmarks:
    """Test ExtractedLandmarks dataclass"""
    
    def test_extracted_landmarks_creation(self):
        """Test creating empty extracted landmarks"""
        extracted = ExtractedLandmarks()
        assert extracted.pose.landmark_type == "pose"
        assert extracted.face.landmark_type == "face"
        assert extracted.left_hand.landmark_type == "left_hand"
        assert extracted.right_hand.landmark_type == "right_hand"
    
    def test_to_dict(self):
        """Test converting to dictionary format"""
        extracted = ExtractedLandmarks()
        extracted.pose.add_landmark(0, Landmark(100, 200, 0.5, 0.95))
        extracted.face.add_landmark(0, Landmark(150, 250, 0.3, 1.0))
        
        result = extracted.to_dict()
        
        assert "pose" in result
        assert "face" in result
        assert 0 in result["pose"]
        assert result["pose"][0] == (100, 200, 0.5, 0.95)
        # Face landmarks should only have (x, y, z)
        assert result["face"][0] == (150, 250, 0.3)
    
    def test_from_dict(self):
        """Test creating from dictionary format"""
        data = {
            "pose": {
                0: (100, 200, 0.5, 0.95),
                11: (150, 250, 0.3, 0.85)
            },
            "face": {
                0: (100, 200, 0.5)
            },
            "left_hand": {
                0: (120, 220, 0.4, 0.9)
            }
        }
        
        extracted = ExtractedLandmarks.from_dict(data)
        
        assert extracted.pose.has_landmark(0)
        assert extracted.pose.has_landmark(11)
        assert extracted.face.has_landmark(0)
        assert extracted.left_hand.has_landmark(0)
        
        # Check values
        pose_lm = extracted.pose.get(0)
        assert pose_lm.x == 100
        assert pose_lm.visibility == 0.95
        
        # Face landmark should have default visibility
        face_lm = extracted.face.get(0)
        assert face_lm.visibility == 1.0


class TestBodyCalibration:
    """Test BodyCalibration dataclass"""
    
    def test_body_calibration_creation(self):
        """Test creating body calibration with all metrics"""
        calibration = BodyCalibration(
            calibration_date="2024-01-01T12:00:00",
            person_id="user_123",
            # Global Posture
            fhd_pixels=45.5,
            cervical_angle=12.3,
            head_lateral_flexion=5.2,
            head_rotation=3.1,
            thoracic_kyphosis_angle=35.0,
            lumbar_lordosis_angle=40.0,
            trunk_lateral_shift=2.5,
            trunk_angle=1.8,
            # Shoulder & Arm
            left_shoulder_angle=85.0,
            right_shoulder_angle=87.0,
            shoulder_height_diff=3.2,
            rounded_shoulder_angle=15.0,
            left_elbow_angle=175.0,
            right_elbow_angle=176.0,
            # Pelvis & Hip
            left_hip_angle=178.0,
            right_hip_angle=179.0,
            pelvic_obliquity=2.1,
            pelvic_tilt_angle=8.5,
            hip_height_diff=2.1,
            # Lower Extremity
            left_knee_angle=180.0,
            right_knee_angle=179.5,
            knee_varus_valgus=2.3,
            knee_flexion_neutral=0.5,
            q_angle_left=15.0,
            q_angle_right=14.5,
            foot_progression_angle=5.0,
            pronation_supination_left=10.0,
            pronation_supination_right=11.0,
            # Body Proportions
            shoulder_width=250.0,
            hip_width=200.0,
            torso_length=300.0,
            left_arm_length=400.0,
            right_arm_length=405.0,
            left_leg_length=500.0,
            right_leg_length=502.0,
            landmarks_data={"pose": {0: [100, 200, 0.5]}}
        )
        
        assert calibration.person_id == "user_123"
        assert calibration.fhd_pixels == 45.5
        assert calibration.shoulder_width == 250.0
        assert calibration.landmarks_data is not None
    
    def test_body_calibration_to_dict(self):
        """Test converting body calibration to dictionary"""
        calibration = BodyCalibration(
            calibration_date="2024-01-01T12:00:00",
            person_id="user_123",
            fhd_pixels=45.5,
            cervical_angle=12.3,
            head_lateral_flexion=5.2,
            head_rotation=3.1,
            thoracic_kyphosis_angle=35.0,
            lumbar_lordosis_angle=40.0,
            trunk_lateral_shift=2.5,
            trunk_angle=1.8,
            left_shoulder_angle=85.0,
            right_shoulder_angle=87.0,
            shoulder_height_diff=3.2,
            rounded_shoulder_angle=15.0,
            left_elbow_angle=175.0,
            right_elbow_angle=176.0,
            left_hip_angle=178.0,
            right_hip_angle=179.0,
            pelvic_obliquity=2.1,
            pelvic_tilt_angle=8.5,
            hip_height_diff=2.1,
            left_knee_angle=180.0,
            right_knee_angle=179.5,
            knee_varus_valgus=2.3,
            knee_flexion_neutral=0.5,
            q_angle_left=15.0,
            q_angle_right=14.5,
            foot_progression_angle=5.0,
            pronation_supination_left=10.0,
            pronation_supination_right=11.0,
            shoulder_width=250.0,
            hip_width=200.0,
            torso_length=300.0,
            left_arm_length=400.0,
            right_arm_length=405.0,
            left_leg_length=500.0,
            right_leg_length=502.0
        )
        
        result = calibration.to_dict()
        
        assert result["person_id"] == "user_123"
        assert result["fhd_pixels"] == 45.5
        assert result["shoulder_width"] == 250.0
        assert "calibration_date" in result


class TestROMResult:
    """Test ROMResult dataclass"""
    
    def test_rom_result_creation(self):
        """Test creating ROM result"""
        result = ROMResult(
            angle=45.0,
            rom_current=45.0,
            rom_max=180.0,
            rom_min=0.0,
            symmetry_score=95.0,
            form_quality=90.0,
            compensation_detected=False,
            compensation_type=None,
            additional_metrics={"trunk_angle": 5.0}
        )
        
        assert result.angle == 45.0
        assert result.symmetry_score == 95.0
        assert not result.compensation_detected
        assert result.additional_metrics["trunk_angle"] == 5.0
    
    def test_rom_result_with_compensation(self):
        """Test ROM result with compensation detected"""
        result = ROMResult(
            angle=45.0,
            rom_current=45.0,
            rom_max=180.0,
            rom_min=0.0,
            symmetry_score=None,
            form_quality=70.0,
            compensation_detected=True,
            compensation_type="trunk_lean",
            additional_metrics={}
        )
        
        assert result.compensation_detected
        assert result.compensation_type == "trunk_lean"
    
    def test_rom_result_to_dict(self):
        """Test converting ROM result to dictionary"""
        result = ROMResult(
            angle=45.0,
            rom_current=45.0,
            rom_max=180.0,
            rom_min=0.0,
            symmetry_score=95.0,
            form_quality=90.0,
            compensation_detected=False,
            compensation_type=None,
            additional_metrics={"test": 123}
        )
        
        data = result.to_dict()
        
        assert data["angle"] == 45.0
        assert data["symmetry_score"] == 95.0
        assert data["additional_metrics"]["test"] == 123


class TestVisibilityCheck:
    """Test VisibilityCheck dataclass"""
    
    def test_visibility_check_all_visible(self):
        """Test visibility check with all landmarks visible"""
        check = VisibilityCheck(
            all_visible=True,
            missing_landmarks=[],
            low_visibility_landmarks=[],
            visibility_score=0.95
        )
        
        assert check.all_visible
        assert len(check.missing_landmarks) == 0
        assert check.visibility_score == 0.95
    
    def test_visibility_check_with_issues(self):
        """Test visibility check with missing landmarks"""
        check = VisibilityCheck(
            all_visible=False,
            missing_landmarks=["left_wrist", "right_wrist"],
            low_visibility_landmarks=["left_elbow"],
            visibility_score=0.65
        )
        
        assert not check.all_visible
        assert len(check.missing_landmarks) == 2
        assert "left_wrist" in check.missing_landmarks
    
    def test_visibility_check_to_dict(self):
        """Test converting visibility check to dictionary"""
        check = VisibilityCheck(
            all_visible=False,
            missing_landmarks=["nose"],
            low_visibility_landmarks=[],
            visibility_score=0.8
        )
        
        data = check.to_dict()
        
        assert data["all_visible"] is False
        assert "nose" in data["missing_landmarks"]


class TestConfigurations:
    """Test configuration dataclasses"""
    
    def test_calibration_config_defaults(self):
        """Test CalibrationConfig default values"""
        config = CalibrationConfig()
        
        # 60 frames x 4 poses. Was 180 when the capture used 3 poses.
        assert config.required_samples == 240
        assert config.sample_rate_fps == 30
        # 240 samples at 30 fps. Consistent with required_samples above.
        assert config.duration_seconds == 8.0


class TestEnums:
    """Test enum types"""
    
    def test_exercise_view_enum(self):
        """Test ExerciseView enum values"""
        assert ExerciseView.FRONT.value == "front"
        assert ExerciseView.SIDE.value == "side"
        assert ExerciseView.BACK.value == "back"
        assert ExerciseView.TOP.value == "top"
    
    def test_exercise_posture_enum(self):
        """Test ExercisePosture enum values"""
        assert ExercisePosture.STANDING.value == "standing"
        assert ExercisePosture.SITTING.value == "sitting"
        assert ExercisePosture.LYING_SUPINE.value == "lying_supine"
        assert ExercisePosture.QUADRUPED.value == "quadruped"


class TestLandmarkConstants:
    """Test landmark index constants"""
    
    def test_pose_landmark_indices(self):
        """Test PoseLandmark constant values"""
        assert PoseLandmark.NOSE == 0
        assert PoseLandmark.LEFT_SHOULDER == 11
        assert PoseLandmark.RIGHT_SHOULDER == 12
        assert PoseLandmark.LEFT_HIP == 23
        assert PoseLandmark.RIGHT_HIP == 24
        assert PoseLandmark.VIRTUAL_NECK == 33
    
    def test_hand_landmark_indices(self):
        """Test HandLandmark constant values"""
        assert HandLandmark.WRIST == 0
        assert HandLandmark.THUMB_TIP == 4
        assert HandLandmark.INDEX_FINGER_TIP == 8
        assert HandLandmark.PINKY_TIP == 20


class TestUtilityFunctions:
    """Test utility functions"""
    
    def test_create_landmark_mapping(self):
        """Test creating landmark mapping"""
        names = ["nose", "left_shoulder", "right_hip", "virtual_neck"]
        mapping = create_landmark_mapping(names)
        
        assert mapping["nose"] == "pose:0"
        assert mapping["left_shoulder"] == "pose:11"
        assert mapping["right_hip"] == "pose:24"
        assert mapping["virtual_neck"] == "pose:33"
    
    def test_create_landmark_mapping_unknown(self):
        """Test creating landmark mapping with unknown names"""
        names = ["nose", "unknown_landmark"]
        mapping = create_landmark_mapping(names)
        
        assert "nose" in mapping
        assert "unknown_landmark" not in mapping
    
    def test_get_landmark_name_pose(self):
        """Test getting pose landmark names"""
        assert get_landmark_name("pose", 0) == "Nose"
        assert get_landmark_name("pose", 11) == "Left Shoulder"
        assert get_landmark_name("pose", 33) == "Virtual Neck"
        assert get_landmark_name("pose", 999) == "Pose Landmark 999"
    
    def test_get_landmark_name_hand(self):
        """Test getting hand landmark names"""
        assert get_landmark_name("left_hand", 0) == "Left Wrist"
        assert get_landmark_name("right_hand", 4) == "Right Thumb Tip"
        assert get_landmark_name("left_hand", 8) == "Left Index Tip"
    
    def test_get_landmark_name_face(self):
        """Test getting face landmark names"""
        assert get_landmark_name("face", 0) == "Face Landmark 0"
        assert get_landmark_name("face", 123) == "Face Landmark 123"
    
    def test_get_landmark_name_unknown(self):
        """Test getting unknown landmark type"""
        assert get_landmark_name("unknown", 0) == "Unknown Landmark 0"


class TestIntegration:
    """Integration tests for type conversions"""
    
    def test_full_extraction_workflow(self):
        """Test complete extraction workflow with type conversions"""
        # Create extracted landmarks
        extracted = ExtractedLandmarks()
        
        # Add some pose landmarks
        extracted.pose.add_landmark(0, Landmark(100, 200, 0.5, 0.95))
        extracted.pose.add_landmark(11, Landmark(150, 250, 0.3, 0.85))
        extracted.pose.add_landmark(12, Landmark(200, 250, 0.3, 0.90))
        
        # Convert to dict
        data_dict = extracted.to_dict()
        
        # Convert back from dict
        restored = ExtractedLandmarks.from_dict(data_dict)
        
        # Verify restoration
        assert restored.pose.has_landmark(0)
        assert restored.pose.has_landmark(11)
        assert restored.pose.has_landmark(12)
        
        nose = restored.pose.get(0)
        assert nose.x == 100
        assert nose.y == 200
        assert nose.visibility == 0.95
    
    def test_calibration_serialization(self):
        """Test body calibration serialization workflow"""
        calibration = BodyCalibration(
            calibration_date="2024-01-01T12:00:00",
            person_id="user_123",
            fhd_pixels=45.5,
            cervical_angle=12.3,
            head_lateral_flexion=5.2,
            head_rotation=3.1,
            thoracic_kyphosis_angle=35.0,
            lumbar_lordosis_angle=40.0,
            trunk_lateral_shift=2.5,
            trunk_angle=1.8,
            left_shoulder_angle=85.0,
            right_shoulder_angle=87.0,
            shoulder_height_diff=3.2,
            rounded_shoulder_angle=15.0,
            left_elbow_angle=175.0,
            right_elbow_angle=176.0,
            left_hip_angle=178.0,
            right_hip_angle=179.0,
            pelvic_obliquity=2.1,
            pelvic_tilt_angle=8.5,
            hip_height_diff=2.1,
            left_knee_angle=180.0,
            right_knee_angle=179.5,
            knee_varus_valgus=2.3,
            knee_flexion_neutral=0.5,
            q_angle_left=15.0,
            q_angle_right=14.5,
            foot_progression_angle=5.0,
            pronation_supination_left=10.0,
            pronation_supination_right=11.0,
            shoulder_width=250.0,
            hip_width=200.0,
            torso_length=300.0,
            left_arm_length=400.0,
            right_arm_length=405.0,
            left_leg_length=500.0,
            right_leg_length=502.0
        )
        
        # Convert to dict (for JSON serialization)
        data = calibration.to_dict()
        
        # Verify all fields present
        assert "person_id" in data
        assert "fhd_pixels" in data
        assert "shoulder_width" in data
        assert "left_knee_angle" in data
        
        # Verify values
        assert data["person_id"] == "user_123"
        assert data["fhd_pixels"] == 45.5
