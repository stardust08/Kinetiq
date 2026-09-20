"""
GaitCalibrator - SUPERSEDED. Use app.core.gait.calibration_v2.GaitAnalyser.

Retained only for reproducing historical v1 analyses. No longer on any request path.

Measured against a synthetic walk with known cadence and 5 true heel strikes per foot:

  1. Heel-strike detection (ankle-Y maxima) found 10-11 strikes instead of 5, because
     the ankle is lowest around foot-flat rather than at contact and the trace has a
     second minimum near toe-off. Cadence then landed on its 200 steps/min clamp.
  2. Stance/swing carried no information: stance was mean_step/mean_stride, which is
     ~50% by construction, then clamped to [50, 70]. Double support was invented as
     step_time * 0.2.
  3. Distances and angles were computed directly on MediaPipe normalised coordinates,
     which are anisotropic (x by width, y by height). At 16:9 that reported 41.9
     degrees of peak knee flexion instead of 60.
  4. Detection failure produced a full set of plausible defaults rather than an error,
     so a failed capture was indistinguishable from a good one.

Do not extend or reuse this module.
"""

from typing import Dict, List, Optional, Any
import numpy as np
from math import degrees
from datetime import datetime

from app.core.gait.types import GaitMetrics
from app.core.gait.cycle_detector import (
    smooth_signal,
    detect_heel_strikes,
    get_gait_phases,
    extract_gait_cycles
)


class GaitCalibrator:
    """
    Gait analysis engine.

    Receives 3 views of 5-second walking video (150 frames each at 30 FPS):
    - front: walking toward/away from camera
    - leftside: walking parallel (left side facing camera)
    - rightside: walking parallel (right side facing camera)

    Calculates 32 clinical gait metrics using heel-strike detection and
    gait cycle segmentation.

    Usage:
        calibrator = GaitCalibrator(fps=30)
        calibrator.add_view('leftside', time_series, background_image)
        calibrator.add_view('front', time_series, background_image)
        calibrator.add_view('rightside', time_series, background_image)
        metrics = calibrator.finalize_calibration(person_id='user_123')
    """

    def __init__(self, fps: int = 30):
        self.fps = fps
        self.views: Dict[str, List[Dict]] = {}
        self.background_images: Dict[str, str] = {}

    def add_view(
        self,
        view_type: str,
        time_series: List[Dict],
        background_image: Optional[str] = None
    ) -> None:
        """
        Add a walking view's time series data.

        Args:
            view_type: 'front', 'leftside', or 'rightside'
            time_series: List of frame dicts, each with:
                {
                    'frameIndex': int,
                    'landmarks': {'0': [x,y,z,vis], '11': [...], ...},
                    'timestamp': float (ms)
                }
            background_image: Base64 encoded best frame image
        """
        self.views[view_type] = time_series
        if background_image:
            self.background_images[view_type] = background_image

    # ─── MATH HELPERS ───────────────────────────────────────────────────────────

    def _get_lm(self, frame: Dict, idx: int) -> Optional[List[float]]:
        """Get landmark from frame by index (try both str and int keys)."""
        lms = frame.get('landmarks', {})
        lm = lms.get(str(idx)) or lms.get(idx)
        if lm and len(lm) >= 2:
            return [float(v) for v in lm]
        return None

    def _get_sequence(self, view: str, landmark_idx: int, coord: int) -> np.ndarray:
        """Get time series of one coordinate for one landmark in a view."""
        frames = self.views.get(view, [])
        seq = []
        last_val = 0.5  # default center
        for frame in frames:
            lm = self._get_lm(frame, landmark_idx)
            if lm and len(lm) > coord:
                val = lm[coord]
                last_val = val
            else:
                val = last_val  # forward fill
            seq.append(val)
        return np.array(seq)

    def _get_vis_sequence(self, view: str, landmark_idx: int) -> np.ndarray:
        """Get visibility time series for a landmark."""
        return self._get_sequence(view, landmark_idx, 3)

    def _angle_3pt(self, a, b, c) -> float:
        """Angle at point b formed by a-b-c (2D)."""
        ba = np.array(a[:2]) - np.array(b[:2])
        bc = np.array(c[:2]) - np.array(b[:2])
        cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
        return float(degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))

    def _angle_vs_vertical(self, a, b) -> float:
        """Angle of vector a->b relative to vertical."""
        v = np.array(b[:2]) - np.array(a[:2])
        vertical = np.array([0, 1])
        cosine = np.dot(v, vertical) / (np.linalg.norm(v) + 1e-6)
        return float(degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))

    def _compute_frame_angles(self, view: str) -> Dict[str, np.ndarray]:
        """Compute per-frame joint angles for a view."""
        frames = self.views.get(view, [])
        n = len(frames)

        hip_angles = np.zeros(n)
        knee_angles = np.zeros(n)
        ankle_angles = np.zeros(n)
        trunk_angles = np.zeros(n)

        for i, frame in enumerate(frames):
            # Left side landmarks
            l_sh = self._get_lm(frame, 11)
            r_sh = self._get_lm(frame, 12)
            l_hip = self._get_lm(frame, 23)
            r_hip = self._get_lm(frame, 24)
            l_knee = self._get_lm(frame, 25)
            r_knee = self._get_lm(frame, 26)
            l_ank = self._get_lm(frame, 27)
            r_ank = self._get_lm(frame, 28)
            l_heel = self._get_lm(frame, 29)
            r_heel = self._get_lm(frame, 30)
            l_foot = self._get_lm(frame, 31)
            r_foot = self._get_lm(frame, 32)

            # Hip angle: shoulder-hip-knee (use avg of both sides)
            hip_vals = []
            if l_sh and l_hip and l_knee:
                hip_vals.append(self._angle_3pt(l_sh, l_hip, l_knee))
            if r_sh and r_hip and r_knee:
                hip_vals.append(self._angle_3pt(r_sh, r_hip, r_knee))
            hip_angles[i] = np.mean(hip_vals) if hip_vals else 180.0

            # Knee angle: hip-knee-ankle
            knee_vals = []
            if l_hip and l_knee and l_ank:
                knee_vals.append(self._angle_3pt(l_hip, l_knee, l_ank))
            if r_hip and r_knee and r_ank:
                knee_vals.append(self._angle_3pt(r_hip, r_knee, r_ank))
            knee_angles[i] = np.mean(knee_vals) if knee_vals else 180.0

            # Ankle dorsiflexion angle: knee-ankle-foot
            ank_vals = []
            if l_knee and l_ank and l_foot:
                ank_vals.append(self._angle_3pt(l_knee, l_ank, l_foot))
            if r_knee and r_ank and r_foot:
                ank_vals.append(self._angle_3pt(r_knee, r_ank, r_foot))
            ankle_angles[i] = np.mean(ank_vals) if ank_vals else 90.0

            # Trunk angle: mid-hip to mid-shoulder vs vertical
            if l_sh and r_sh and l_hip and r_hip:
                mid_sh = [(l_sh[0]+r_sh[0])/2, (l_sh[1]+r_sh[1])/2]
                mid_hip = [(l_hip[0]+r_hip[0])/2, (l_hip[1]+r_hip[1])/2]
                trunk_angles[i] = self._angle_vs_vertical(mid_hip, mid_sh)

        return {
            'hip': hip_angles,
            'knee': knee_angles,
            'ankle': ankle_angles,
            'trunk': trunk_angles
        }

    def _get_best_side_view(self) -> Optional[str]:
        """Return the best available side view (prefer leftside, then rightside)."""
        for v in ['leftside', 'rightside']:
            if v in self.views and len(self.views[v]) > 20:
                return v
        return None

    def _safe_float(self, val) -> float:
        """Ensure valid float (no NaN/Inf)."""
        import math
        if val is None:
            return 0.0
        try:
            f = float(val)
            if math.isnan(f) or math.isinf(f):
                return 0.0
            return round(f, 2)
        except (TypeError, ValueError):
            return 0.0

    def _annotate_view(
        self,
        view: str,
        left_hs: np.ndarray,
        right_hs: np.ndarray
    ) -> Dict[str, Any]:
        """Build annotated time series for a view (for skeleton video playback)."""
        frames = self.views.get(view, [])
        total = len(frames)
        phases = get_gait_phases(left_hs, right_hs, total)

        annotated = []
        for i, frame in enumerate(frames):
            annotated.append({
                'frameIndex': i,
                'landmarks': frame.get('landmarks', {}),
                'gaitPhase': phases[i],
                'timestamp': frame.get('timestamp', i * (1000 / self.fps)),
                'isHeelStrike': bool(i in left_hs or i in right_hs)
            })

        return {
            'timeSeries': annotated,
            'heelStrikes': {
                'left': left_hs.tolist() if len(left_hs) else [],
                'right': right_hs.tolist() if len(right_hs) else []
            },
            'frameCount': total
        }

    def finalize_calibration(self, person_id: str) -> Optional[GaitMetrics]:
        """
        Calculate all 32 gait metrics from collected walking video data.

        Algorithm:
        1. Get best side view for primary kinematic + temporal analysis
        2. Smooth ankle Y trajectories with Savitzky-Golay filter
        3. Detect heel strikes (local maxima in ankle Y)
        4. Extract gait cycles, drop edge cycles
        5. Calculate temporal metrics from cycle timings
        6. Calculate spatial metrics from ankle X positions at heel strike
        7. Calculate kinematic metrics from per-frame angle sequences
        8. Use front view for lateral metrics (sway, pelvic obliquity)
        9. Calculate functional scores
        10. Annotate each frame with gait phase for visualization

        Returns:
            GaitMetrics object with all 32 metrics + annotated views, or None
        """
        if not self.views:
            return None

        side_view = self._get_best_side_view()
        if not side_view and 'front' not in self.views:
            return None

        primary_view = side_view or 'front'

        # ── STEP 1: Get ankle Y sequences from side view ──────────────────────

        left_ank_y_raw = self._get_sequence(primary_view, 27, 1)   # left ankle Y
        right_ank_y_raw = self._get_sequence(primary_view, 28, 1)  # right ankle Y
        left_ank_x = self._get_sequence(primary_view, 27, 0)
        right_ank_x = self._get_sequence(primary_view, 28, 0)

        # ── STEP 2: Smooth signals ────────────────────────────────────────────

        left_ank_y = smooth_signal(left_ank_y_raw.tolist(), window=11, poly=3)
        right_ank_y = smooth_signal(right_ank_y_raw.tolist(), window=11, poly=3)

        # ── STEP 3: Detect heel strikes ───────────────────────────────────────

        left_hs = detect_heel_strikes(left_ank_y, fps=self.fps)
        right_hs = detect_heel_strikes(right_ank_y, fps=self.fps)

        # ── STEP 4: Extract valid gait cycles ─────────────────────────────────

        left_cycles = extract_gait_cycles(left_hs, fps=self.fps)
        right_cycles = extract_gait_cycles(right_hs, fps=self.fps)

        # Use whichever foot has more detected cycles
        best_cycles = left_cycles if len(left_cycles) >= len(right_cycles) else right_cycles
        best_hs = left_hs if len(left_cycles) >= len(right_cycles) else right_hs
        cycle_count = max(len(left_cycles), len(right_cycles), 1)

        # ── STEP 5: TEMPORAL METRICS ──────────────────────────────────────────

        total_frames = len(self.views.get(primary_view, []))
        duration_sec = total_frames / self.fps if self.fps > 0 else 5.0

        # Cadence: steps per minute
        total_steps = len(left_hs) + len(right_hs)
        cadence = (total_steps / duration_sec * 60.0) if duration_sec > 0 else 100.0
        cadence = max(40.0, min(200.0, cadence))  # clamp to realistic range

        # Stride times from heel-strike intervals
        stride_times_left = (np.diff(left_hs) / self.fps).tolist() if len(left_hs) > 1 else [1.0]
        stride_times_right = (np.diff(right_hs) / self.fps).tolist() if len(right_hs) > 1 else [1.0]

        stride_time_left = float(np.mean(stride_times_left)) if stride_times_left else 1.0
        stride_time_right = float(np.mean(stride_times_right)) if stride_times_right else 1.0

        # Stance/swing: typical 60/40 split, refined by heel strike density
        # Stance phase = time from HS to next contralateral HS relative to stride time
        stance_phase_percent = 60.0
        swing_phase_percent = 40.0
        double_support_time = 0.12

        if len(left_hs) > 0 and len(right_hs) > 0 and total_steps >= 4:
            all_hs = sorted(left_hs.tolist() + right_hs.tolist())
            step_times = np.diff(all_hs) / self.fps
            if len(step_times) > 0:
                mean_step = float(np.mean(step_times))
                mean_stride = (stride_time_left + stride_time_right) / 2
                if mean_stride > 0:
                    stance_pct = (mean_step / mean_stride) * 100
                    stance_phase_percent = float(np.clip(stance_pct, 50.0, 70.0))
                    swing_phase_percent = 100.0 - stance_phase_percent
                    double_support_time = float(np.clip(mean_step * 0.2, 0.05, 0.25))

        # ── STEP 6: SPATIAL METRICS ───────────────────────────────────────────

        # Stride length: X-distance between consecutive same-foot heel strikes
        stride_lengths = []
        if len(left_hs) > 1:
            for i in range(len(left_hs) - 1):
                x1 = left_ank_x[left_hs[i]] if left_hs[i] < len(left_ank_x) else 0
                x2 = left_ank_x[left_hs[i+1]] if left_hs[i+1] < len(left_ank_x) else 0
                stride_lengths.append(abs(x2 - x1))

        if len(right_hs) > 1:
            for i in range(len(right_hs) - 1):
                x1 = right_ank_x[right_hs[i]] if right_hs[i] < len(right_ank_x) else 0
                x2 = right_ank_x[right_hs[i+1]] if right_hs[i+1] < len(right_ank_x) else 0
                stride_lengths.append(abs(x2 - x1))

        stride_length = float(np.mean(stride_lengths)) if stride_lengths else 0.3

        # Step lengths (left/right alternating)
        step_lengths_left = []
        step_lengths_right = []

        all_hs_with_foot = sorted(
            [(f, 'L') for f in left_hs] + [(f, 'R') for f in right_hs],
            key=lambda x: x[0]
        )

        for i in range(len(all_hs_with_foot) - 1):
            f1, foot1 = all_hs_with_foot[i]
            f2, foot2 = all_hs_with_foot[i+1]
            if foot1 != foot2:
                if foot1 == 'L':
                    x1 = left_ank_x[f1] if f1 < len(left_ank_x) else 0
                    x2 = right_ank_x[f2] if f2 < len(right_ank_x) else 0
                    step_lengths_right.append(abs(x2 - x1))
                else:
                    x1 = right_ank_x[f1] if f1 < len(right_ank_x) else 0
                    x2 = left_ank_x[f2] if f2 < len(left_ank_x) else 0
                    step_lengths_left.append(abs(x2 - x1))

        step_length_left = float(np.mean(step_lengths_left)) if step_lengths_left else stride_length / 2
        step_length_right = float(np.mean(step_lengths_right)) if step_lengths_right else stride_length / 2

        # Step width from front view (Y distance between ankles at mid-stance)
        step_width = 0.1  # default normalized
        if 'front' in self.views:
            front_frames = self.views['front']
            n_front = len(front_frames)
            widths = []
            for frame in front_frames:
                l_ank = self._get_lm(frame, 27)
                r_ank = self._get_lm(frame, 28)
                if l_ank and r_ank:
                    # In front view, X-axis represents lateral (left-right)
                    w = abs(l_ank[0] - r_ank[0])
                    if w > 0.02:  # ignore near-zero
                        widths.append(w)
            if widths:
                step_width = float(np.mean(widths))

        # Walking speed: stride_length / stride_time (normalized)
        mean_stride_time = (stride_time_left + stride_time_right) / 2
        walking_speed = stride_length / mean_stride_time if mean_stride_time > 0 else 0.3

        # Step length symmetry
        if step_length_left > 0 and step_length_right > 0:
            sl_sym = 100.0 * (1.0 - abs(step_length_left - step_length_right) /
                              (step_length_left + step_length_right))
        else:
            sl_sym = 100.0

        # ── STEP 7: KINEMATIC METRICS ─────────────────────────────────────────

        angles = self._compute_frame_angles(primary_view)
        hip_seq = smooth_signal(angles['hip'].tolist(), window=9)
        knee_seq = smooth_signal(angles['knee'].tolist(), window=9)
        ankle_seq = smooth_signal(angles['ankle'].tolist(), window=9)
        trunk_seq = smooth_signal(angles['trunk'].tolist(), window=9)

        # Hip angles: measured as deviation from neutral (180°=straight)
        # During walking: hip is in extension during stance, flexion during swing
        hip_flexion_angles = 180.0 - hip_seq  # convert to flexion/extension
        hip_flexion_max = float(np.percentile(hip_flexion_angles, 90))  # peak flexion
        hip_extension_max = float(abs(np.percentile(hip_flexion_angles, 10)))  # peak extension
        hip_flexion_rom = float(np.percentile(hip_flexion_angles, 95) - np.percentile(hip_flexion_angles, 5))

        # Knee angles: 180° = full extension, <180° = flexion
        knee_flexion_angles = 180.0 - knee_seq
        knee_flexion_max = float(np.percentile(knee_flexion_angles, 90))
        knee_extension_min = float(np.percentile(knee_flexion_angles, 10))
        knee_flexion_rom = float(knee_flexion_max - knee_extension_min)

        # Per-side knee angles (use separate left/right sequences if available)
        left_knee_y_seq = []
        right_knee_y_seq = []
        frames_primary = self.views.get(primary_view, [])
        left_knee_angles_arr = []
        right_knee_angles_arr = []
        for frame in frames_primary:
            lhip = self._get_lm(frame, 23)
            rhip = self._get_lm(frame, 24)
            lknee = self._get_lm(frame, 25)
            rknee = self._get_lm(frame, 26)
            lank = self._get_lm(frame, 27)
            rank = self._get_lm(frame, 28)
            if lhip and lknee and lank:
                left_knee_angles_arr.append(self._angle_3pt(lhip, lknee, lank))
            if rhip and rknee and rank:
                right_knee_angles_arr.append(self._angle_3pt(rhip, rknee, rank))

        left_knee_angle_avg = float(np.mean(left_knee_angles_arr)) if left_knee_angles_arr else 170.0
        right_knee_angle_avg = float(np.mean(right_knee_angles_arr)) if right_knee_angles_arr else 170.0

        # Ankle dorsiflexion (90°= neutral, >90°=plantarflexion, <90°=dorsiflexion)
        ankle_dors = 90.0 - float(np.percentile(ankle_seq, 10))  # max dorsiflexion
        ankle_dorsiflexion_max = float(np.clip(ankle_dors, 0.0, 30.0))

        # Foot progression angle (direction foot points at heel strike)
        # Use heel-foot vector at heel strike moments
        fpa_left_vals = []
        fpa_right_vals = []
        for frame in frames_primary:
            lheel = self._get_lm(frame, 29)
            rheel = self._get_lm(frame, 30)
            lfoot = self._get_lm(frame, 31)
            rfoot = self._get_lm(frame, 32)
            if lheel and lfoot:
                fpa_left_vals.append(self._angle_vs_vertical(lheel, lfoot))
            if rheel and rfoot:
                fpa_right_vals.append(self._angle_vs_vertical(rheel, rfoot))

        foot_progression_angle_left = float(np.mean(fpa_left_vals)) if fpa_left_vals else 10.0
        foot_progression_angle_right = float(np.mean(fpa_right_vals)) if fpa_right_vals else 10.0

        # Arm swing amplitude: range of wrist Y movement
        l_wrist_y = self._get_sequence(primary_view, 15, 1)
        r_wrist_y = self._get_sequence(primary_view, 16, 1)
        arm_swing_amplitude = float(
            (np.ptp(l_wrist_y) + np.ptp(r_wrist_y)) / 2
        ) if len(l_wrist_y) > 0 else 0.05

        # ── STEP 8: TRUNK & PELVIS METRICS ───────────────────────────────────

        # Trunk lateral sway: range of mid-shoulder X in front view
        trunk_lateral_sway = 0.05
        if 'front' in self.views:
            mid_sh_x = []
            for frame in self.views['front']:
                l_sh = self._get_lm(frame, 11)
                r_sh = self._get_lm(frame, 12)
                if l_sh and r_sh:
                    mid_sh_x.append((l_sh[0] + r_sh[0]) / 2)
            if mid_sh_x:
                trunk_lateral_sway = float(np.ptp(mid_sh_x))

        # Trunk sagittal lean: mean trunk angle in side view
        trunk_sagittal_lean = float(np.mean(trunk_seq)) if len(trunk_seq) > 0 else 5.0

        # Pelvic obliquity: range of hip height difference in front view
        pelvic_obliquity_range = 4.0  # degrees default
        if 'front' in self.views:
            hip_height_diffs = []
            for frame in self.views['front']:
                l_hip = self._get_lm(frame, 23)
                r_hip = self._get_lm(frame, 24)
                if l_hip and r_hip:
                    hip_height_diffs.append(abs(l_hip[1] - r_hip[1]))
            if hip_height_diffs:
                pelvic_obliquity_range = float(np.ptp(hip_height_diffs) * 100)  # scale to degrees approx
                pelvic_obliquity_range = min(pelvic_obliquity_range, 30.0)

        # Arm swing symmetry
        l_wrist_range = float(np.ptp(l_wrist_y)) if len(l_wrist_y) > 0 else 0.05
        r_wrist_range = float(np.ptp(r_wrist_y)) if len(r_wrist_y) > 0 else 0.05
        if l_wrist_range + r_wrist_range > 0:
            arm_swing_symmetry = 100.0 * (1.0 - abs(l_wrist_range - r_wrist_range) /
                                          (l_wrist_range + r_wrist_range))
        else:
            arm_swing_symmetry = 100.0

        # ── STEP 9: FUNCTIONAL SCORES ─────────────────────────────────────────

        # Gait symmetry index: combination of left/right temporal and spatial symmetry
        temporal_sym = 100.0 * (1.0 - abs(stride_time_left - stride_time_right) /
                                 (stride_time_left + stride_time_right + 1e-6))
        gait_symmetry_index = float((sl_sym + temporal_sym) / 2)

        # Step regularity: coefficient of variation of stride times (lower = better)
        all_stride_times = stride_times_left + stride_times_right
        if len(all_stride_times) > 1 and np.mean(all_stride_times) > 0:
            cv = np.std(all_stride_times) / np.mean(all_stride_times)
            step_regularity = float(np.clip(1.0 - cv, 0.0, 1.0))
        else:
            step_regularity = 0.8

        # Gait quality score: weighted composite
        gait_quality_score = float(np.clip(
            0.35 * gait_symmetry_index +
            0.25 * step_regularity * 100 +
            0.20 * min(arm_swing_symmetry, 100.0) +
            0.20 * min(sl_sym, 100.0),
            0.0, 100.0
        ))

        # ── STEP 10: ANNOTATE VIEWS ───────────────────────────────────────────

        annotated_views = {}
        for view_name in self.views:
            # Use the same heel strikes for annotation across all views
            annotated_views[view_name] = self._annotate_view(view_name, left_hs, right_hs)
            if view_name in self.background_images:
                annotated_views[view_name]['backgroundImage'] = self.background_images[view_name]

        # ── RETURN METRICS ────────────────────────────────────────────────────

        sf = self._safe_float

        return GaitMetrics(
            calibration_date=datetime.utcnow().isoformat(),
            person_id=str(person_id),

            # I. Temporal
            cadence=sf(cadence),
            stride_time_left=sf(stride_time_left),
            stride_time_right=sf(stride_time_right),
            stance_phase_percent=sf(stance_phase_percent),
            swing_phase_percent=sf(swing_phase_percent),
            double_support_time=sf(double_support_time),

            # II. Spatial
            stride_length=sf(stride_length),
            step_length_left=sf(step_length_left),
            step_length_right=sf(step_length_right),
            step_width=sf(step_width),
            walking_speed=sf(walking_speed),
            step_length_symmetry=sf(sl_sym),

            # III. Kinematic
            hip_flexion_max=sf(hip_flexion_max),
            hip_extension_max=sf(hip_extension_max),
            hip_flexion_rom=sf(hip_flexion_rom),
            knee_flexion_max=sf(knee_flexion_max),
            knee_extension_min=sf(knee_extension_min),
            knee_flexion_rom=sf(knee_flexion_rom),
            left_knee_angle_avg=sf(left_knee_angle_avg),
            right_knee_angle_avg=sf(right_knee_angle_avg),
            ankle_dorsiflexion_max=sf(ankle_dorsiflexion_max),
            foot_progression_angle_left=sf(foot_progression_angle_left),
            foot_progression_angle_right=sf(foot_progression_angle_right),
            arm_swing_amplitude=sf(arm_swing_amplitude),

            # IV. Trunk & Pelvis
            trunk_lateral_sway=sf(trunk_lateral_sway),
            trunk_sagittal_lean=sf(trunk_sagittal_lean),
            pelvic_obliquity_range=sf(pelvic_obliquity_range),
            arm_swing_symmetry=sf(arm_swing_symmetry),

            # V. Functional Scores
            gait_symmetry_index=sf(gait_symmetry_index),
            step_regularity=sf(step_regularity),
            gait_quality_score=sf(gait_quality_score),
            gait_cycle_count=int(cycle_count),

            annotated_views=annotated_views
        )
