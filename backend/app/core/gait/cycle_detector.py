"""Gait Cycle Detector - Heel strike detection and gait cycle segmentation."""

from typing import List, Tuple, Dict, Any
import numpy as np

try:
    from scipy.signal import find_peaks, savgol_filter
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


def smooth_signal(signal: List[float], window: int = 9, poly: int = 3) -> np.ndarray:
    """Apply Savitzky-Golay smoothing to remove MediaPipe jitter."""
    arr = np.array(signal, dtype=float)
    if not SCIPY_AVAILABLE or len(arr) < window:
        # Fallback: simple moving average
        kernel = np.ones(min(5, len(arr))) / min(5, len(arr))
        return np.convolve(arr, kernel, mode='same')

    # Ensure window_length is odd and <= len(arr)
    wl = min(window, len(arr))
    if wl % 2 == 0:
        wl -= 1
    if wl < poly + 2:
        wl = poly + 2
        if wl % 2 == 0:
            wl += 1
    if wl > len(arr):
        return arr
    return savgol_filter(arr, window_length=wl, polyorder=poly)


def detect_heel_strikes(ankle_y: np.ndarray, fps: int = 30) -> np.ndarray:
    """
    Detect heel strikes from ankle Y-coordinate time series.

    In image coordinates, Y increases downward. When foot hits the ground
    (heel strike), the ankle Y-coordinate is at its MAXIMUM (lowest point).

    Args:
        ankle_y: Smoothed ankle Y-coordinate sequence (normalized 0-1)
        fps: Frames per second of capture

    Returns:
        Array of frame indices where heel strikes occur
    """
    if not SCIPY_AVAILABLE or len(ankle_y) < fps:
        # Fallback: detect peaks manually
        peaks = []
        for i in range(1, len(ankle_y) - 1):
            if ankle_y[i] > ankle_y[i-1] and ankle_y[i] > ankle_y[i+1]:
                peaks.append(i)
        return np.array(peaks)

    # Minimum distance between heel strikes: fps/3 = ~0.33s (max cadence ~180)
    min_distance = max(int(fps * 0.3), 5)

    # Prominence threshold: 30% of signal standard deviation
    prom = max(np.std(ankle_y) * 0.3, 0.005)

    peaks, properties = find_peaks(
        ankle_y,
        distance=min_distance,
        prominence=prom,
        height=np.percentile(ankle_y, 40)  # Above 40th percentile (exclude swing)
    )
    return peaks


def get_gait_phases(
    left_hs: np.ndarray,
    right_hs: np.ndarray,
    total_frames: int
) -> List[str]:
    """
    Annotate each frame with gait phase.

    Returns list of phase strings for each frame:
    - 'stance_left': Left foot on ground
    - 'swing_left': Left foot in air
    - 'stance_right': Right foot on ground
    - 'swing_right': Right foot in air
    - 'double_support': Both feet on ground
    - 'unknown': Cannot determine
    """
    phases = ['unknown'] * total_frames

    if len(left_hs) == 0 and len(right_hs) == 0:
        return phases

    # Combine all heel strikes with foot side
    events = [(idx, 'L') for idx in left_hs] + [(idx, 'R') for idx in right_hs]
    events.sort(key=lambda x: x[0])

    if not events:
        return phases

    # Simple alternating phase annotation
    # After left heel strike: left stance begins, right swing begins
    # After right heel strike: right stance begins, left swing begins

    current_phase = 'unknown'
    last_event_frame = 0

    for i, (event_frame, foot) in enumerate(events):
        # Frames before first event
        if i == 0:
            for f in range(0, event_frame):
                phases[f] = 'unknown'
        else:
            prev_frame, prev_foot = events[i-1]
            # Phase between prev event and this event
            if prev_foot == 'L':
                # After left heel strike: left stance
                for f in range(prev_frame, event_frame):
                    phases[f] = 'stance_left'
            else:
                # After right heel strike: right stance
                for f in range(prev_frame, event_frame):
                    phases[f] = 'stance_right'

    # Last segment
    if events:
        last_frame, last_foot = events[-1]
        phase = 'stance_left' if last_foot == 'L' else 'stance_right'
        for f in range(last_frame, total_frames):
            phases[f] = phase

    return phases


def extract_gait_cycles(
    heel_strikes: np.ndarray,
    fps: int = 30
) -> List[Tuple[int, int]]:
    """
    Extract complete gait cycle boundaries from heel strike indices.

    A gait cycle goes from one heel strike to the next same-foot heel strike.
    We drop the first and last cycles (edge effects) if we have >= 4 cycles.

    Returns:
        List of (start_frame, end_frame) tuples for valid gait cycles
    """
    if len(heel_strikes) < 2:
        return []

    cycles = [(heel_strikes[i], heel_strikes[i+1])
               for i in range(len(heel_strikes) - 1)]

    # Filter out abnormally short or long cycles
    if len(cycles) > 0:
        durations = [end - start for start, end in cycles]
        mean_dur = np.mean(durations)
        std_dur = np.std(durations)
        cycles = [(s, e) for s, e in cycles
                  if abs((e - s) - mean_dur) < 2 * std_dur]

    # Drop first and last if we have enough
    if len(cycles) >= 4:
        cycles = cycles[1:-1]
    elif len(cycles) >= 3:
        cycles = cycles[1:]

    return cycles
