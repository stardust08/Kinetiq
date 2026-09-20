"""
Range-of-motion metric registry.

ROM is a different measurement from posture even though it uses the same landmarks.
Posture asks "where is this body at rest"; ROM asks "how far can this joint travel".
That changes three things, and each one shows up in the specs below:

  1. The capture is an END-RANGE HOLD. The patient moves the joint as far as it goes and
     holds it while frames are collected, exactly as they hold a posture pose. This is
     deliberate: a static hold reuses the whole posture capture path - the visibility
     gate, the orientation gate, the frame budget, the confidence gates - rather than
     needing a motion-capture pipeline that does not exist.

  2. The normal range is a FLOOR, not a band. A shoulder that flexes to 175 degrees is
     healthy; one that flexes to 90 is not. So `normal_range` here means "the span a
     healthy adult reaches", and falling BELOW it is the finding. Above it is
     hypermobility, which is real but rarer and not what these ranges are cited for.

  3. Every one of these is a joint angle in a single anatomical plane, so the same rule
     that governs posture applies: measure it in the plane the camera can see, and do
     not ask MediaPipe's inferred depth for anything it cannot answer. Cervical rotation
     is the casualty - it is a transverse-plane movement, and the posture work measured
     that axis at 131 degrees of error. It is declared here and unsupported, for the
     same reason and with the same evidence.

Reference ranges are AAOS / Norkin & White unless noted. A metric without a citation
does not get a normal range - the same rule as the posture registry, for the same
reason: a range nobody can source is a verdict nobody can defend.
"""

from __future__ import annotations

from typing import List

from app.core.metrics.registry import MetricSpec, Plane, Source, Unit, View

# MediaPipe landmark indices, repeated here so a spec reads without cross-referencing.
NOSE = 0
L_EAR, R_EAR = 7, 8
L_SH, R_SH = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANK, R_ANK = 27, 28

NORKIN = "Norkin & White, Measurement of Joint Motion, 5th ed."
AAOS = "AAOS, Joint Motion: Method of Measuring and Recording"


def _bilateral(
    key_stem: str,
    name_stem: str,
    plane: Plane,
    view: View,
    landmarks_left: tuple,
    landmarks_right: tuple,
    physical_range: tuple,
    normal_range: tuple | None,
    reference: str | None,
    max_iqr: float,
) -> List[MetricSpec]:
    """
    One spec per side.

    Bilateral by default because ROM asymmetry is the finding clinicians look for -
    a shoulder that flexes to 170 on one side and 120 on the other is a result, and
    averaging the two would erase it.
    """
    out = []
    for side, label, landmarks in (
        ("left", "left", landmarks_left),
        ("right", "right", landmarks_right),
    ):
        out.append(
            MetricSpec(
                key=f"{key_stem}_{side}",
                clinical_name=f"{name_stem} ({label})",
                plane=plane,
                required_view=view,
                source=Source.WORLD_3D,
                unit=Unit.DEGREES,
                landmarks=landmarks,
                signed=False,
                physical_range=physical_range,
                normal_range=normal_range,
                reference=reference,
                max_iqr=max_iqr,
            )
        )
    return out


ROM_METRICS: List[MetricSpec] = [
    # --- Shoulder ----------------------------------------------------------
    *_bilateral(
        "rom_shoulder_flexion",
        "Shoulder flexion",
        Plane.SAGITTAL,
        View.ANY_SIDE,
        (L_HIP, L_SH, L_ELBOW),
        (R_HIP, R_SH, R_ELBOW),
        physical_range=(0.0, 190.0),
        normal_range=(165.0, 180.0),
        reference=f"{AAOS}; {NORKIN}",
        max_iqr=6.0,
    ),
    *_bilateral(
        "rom_shoulder_abduction",
        "Shoulder abduction",
        Plane.FRONTAL,
        View.FRONT,
        (L_HIP, L_SH, L_ELBOW),
        (R_HIP, R_SH, R_ELBOW),
        physical_range=(0.0, 190.0),
        normal_range=(165.0, 180.0),
        reference=f"{AAOS}; {NORKIN}",
        max_iqr=6.0,
    ),
    # --- Elbow -------------------------------------------------------------
    *_bilateral(
        "rom_elbow_flexion",
        "Elbow flexion",
        Plane.SAGITTAL,
        View.ANY_SIDE,
        (L_SH, L_ELBOW, L_WRIST),
        (R_SH, R_ELBOW, R_WRIST),
        physical_range=(0.0, 170.0),
        normal_range=(135.0, 150.0),
        reference=NORKIN,
        max_iqr=5.0,
    ),
    # --- Hip ---------------------------------------------------------------
    *_bilateral(
        "rom_hip_flexion",
        "Hip flexion",
        Plane.SAGITTAL,
        View.ANY_SIDE,
        (L_SH, L_HIP, L_KNEE),
        (R_SH, R_HIP, R_KNEE),
        physical_range=(0.0, 150.0),
        # Standing hip flexion with the knee bent. Supine measurement reaches ~120;
        # standing is limited by balance rather than by the joint, so the floor is
        # lower and the metric is about symmetry more than absolute range.
        normal_range=(90.0, 125.0),
        reference=f"{NORKIN} (knee flexed)",
        max_iqr=6.0,
    ),
    # --- Knee --------------------------------------------------------------
    *_bilateral(
        "rom_knee_flexion",
        "Knee flexion",
        Plane.SAGITTAL,
        View.ANY_SIDE,
        (L_HIP, L_KNEE, L_ANK),
        (R_HIP, R_KNEE, R_ANK),
        physical_range=(0.0, 160.0),
        normal_range=(130.0, 145.0),
        reference=NORKIN,
        max_iqr=5.0,
    ),
    # --- Cervical ----------------------------------------------------------
    MetricSpec(
        key="rom_cervical_lateral_flexion",
        clinical_name="Cervical lateral flexion",
        plane=Plane.FRONTAL,
        required_view=View.FRONT,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(L_EAR, R_EAR, L_SH, R_SH),
        signed=True,
        physical_range=(-60.0, 60.0),
        normal_range=(-45.0, 45.0),
        reference=NORKIN,
        max_iqr=6.0,
    ),
    MetricSpec(
        key="rom_cervical_rotation",
        clinical_name="Cervical rotation",
        plane=Plane.TRANSVERSE,
        required_view=View.ANY,
        source=Source.WORLD_3D,
        unit=Unit.DEGREES,
        landmarks=(NOSE, L_EAR, R_EAR, L_SH, R_SH),
        signed=True,
        physical_range=(-90.0, 90.0),
        unsupported_reason=(
            "Transverse-plane movement, which a single camera cannot see: rotation about "
            "the vertical axis moves a landmark toward or away from the lens rather than "
            "across it, so the measurement rests entirely on MediaPipe's inferred depth. "
            "The posture registry's head_rotation is the same quantity and certified at "
            "25.5 degrees of error (p95) against a +/-8 degree normal range. The maths is "
            "implemented and exact on clean landmarks; what is missing is a second "
            "calibrated view or a depth camera. The v1 ROM calculator asked for a "
            "top-down camera view that this product never captures."
        ),
        max_iqr=8.0,
    ),
]


def supported_rom_metrics() -> List[MetricSpec]:
    return [spec for spec in ROM_METRICS if spec.is_supported]
