"""
The exercise catalogue, and the rules mapping a measurement to an exercise.

This file is the prescribing half of the product, and it is deliberately built the same
way as app/core/metrics/registry.py, for the same reason. A metric is declared once,
with a citation, and everything downstream derives from it; an exercise is declared once,
with a citation for why that measurement leads to that exercise, and the engine derives
the prescription. The alternative - rules embedded in whichever service happened to need
them - is how a "normal range" ended up hardcoded in a React template and graded every
patient Severe.

Two rules govern what may go in here:

  1. **No rule without a measurable trigger.** A rule keys off a metric that the
     registry declares, that the pipeline can actually measure, and that has a cited
     normal range. Metrics the registry marks unsupported, or leaves without a normal
     range, cannot trigger anything - they have no threshold to be on the wrong side of.
     `validate_rules()` enforces this at import time in the tests.

  2. **No exercise without a reason a clinician would recognise.** Every rule carries
     the clinical reasoning in `rationale`, and it is shown to the patient and to the
     reviewing clinician. A suggestion nobody can explain is a suggestion nobody should
     act on.

What this is NOT: a diagnosis. The output is a DRAFT plan. A clinician reviews it
before a patient ever sees it - see PlanStatus in the Prisma schema, and
app/core/authz.py::plan_scope_filter, which hides drafts from patients.

Video URLs are absent by design. Inventing plausible-looking links would put a URL
nobody has watched in front of a patient doing an exercise. `videoUrl` is filled in per
deployment - by the admin UI, by POST /api/admin/exercises/{id}/video, or in bulk from
data/exercise_videos.json when the catalogue is seeded.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Sequence, Tuple


class BodyRegion(str, Enum):
    """Mirrors the BodyRegion enum in the Prisma schema."""

    CERVICAL = "CERVICAL"
    SHOULDER = "SHOULDER"
    ELBOW = "ELBOW"
    THORACIC = "THORACIC"
    LUMBAR = "LUMBAR"
    PELVIS = "PELVIS"
    HIP = "HIP"
    KNEE = "KNEE"
    ANKLE = "ANKLE"
    FOOT = "FOOT"
    FULL_BODY = "FULL_BODY"


class Difficulty(str, Enum):
    BEGINNER = "BEGINNER"
    INTERMEDIATE = "INTERMEDIATE"
    ADVANCED = "ADVANCED"


class Trigger(str, Enum):
    """
    Which side of its normal range a metric has to fall on for a rule to fire.

    BELOW_NORMAL is the one that matters for range of motion, where the normal range is
    a floor rather than a band: a shoulder reaching 175 degrees is healthy and one
    reaching 90 is not, so only the low side is a finding.

    OUTSIDE_NORMAL is for band metrics whose deviation is meaningful in both
    directions but calls for the same work either way.
    """

    BELOW_NORMAL = "below_normal"
    ABOVE_NORMAL = "above_normal"
    OUTSIDE_NORMAL = "outside_normal"


class Side(str, Enum):
    """
    Which of the patient's sides a rule addresses.

    Needed because half the useful posture findings are signed asymmetries and the
    correct exercise depends on the sign. `shoulder_obliquity` positive means the right
    shoulder sits high; stretching the left upper trapezius for that patient is not a
    lesser intervention, it is the wrong one.
    """

    NONE = "none"
    LEFT = "left"
    RIGHT = "right"


@dataclass(frozen=True)
class ExerciseDef:
    """One exercise, as the catalogue knows it."""

    slug: str
    name: str
    body_region: BodyRegion
    summary: str
    instructions: Tuple[str, ...]
    difficulty: Difficulty = Difficulty.BEGINNER
    equipment: Tuple[str, ...] = ()
    default_sets: int = 2
    default_reps: Optional[int] = None
    default_hold_seconds: Optional[int] = None
    default_frequency_per_week: int = 5
    duration_seconds: Optional[int] = None
    cautions: Optional[str] = None
    reference: Optional[str] = None

    def __post_init__(self) -> None:
        # A prescription with neither a repetition count nor a hold time tells the
        # patient to do the movement an unspecified number of times. Caught here
        # rather than in review, because the plan builder copies these straight onto
        # the plan item.
        if self.default_reps is None and self.default_hold_seconds is None:
            raise ValueError(
                f"{self.slug}: an exercise needs default_reps or default_hold_seconds"
            )


@dataclass(frozen=True)
class Rule:
    """
    "When this measurement lands here, these exercises apply, and this is why."

    `sign` narrows a rule to one direction of a signed metric. Left as None the rule
    fires on either sign, which is right for a metric like `trunk_angle` where leaning
    forward and leaning back both call for the same postural retraining, and wrong for
    `pelvic_obliquity` where the two signs implicate opposite hips.
    """

    metric_key: str
    trigger: Trigger
    exercises: Tuple[str, ...]
    rationale: str
    #: "positive" | "negative" | None. Only consulted for signed metrics.
    sign: Optional[str] = None
    #: Which side the exercises address, given `sign` holds.
    side: Side = Side.NONE
    #: Ranking nudge when several rules fire. Higher sorts first within a severity.
    weight: int = 1
    #: Which analyses this rule may be applied to. A rule keyed on a ROM metric should
    #: not fire off a posture capture that happens to expose a same-named quantity.
    analyses: Tuple[str, ...] = ("POSTURE", "GAIT", "ROM")
    reference: Optional[str] = None


# ===========================================================================
# Catalogue
# ===========================================================================
#
# References are to standard texts rather than to individual trials: these are the
# staple exercises of musculoskeletal rehabilitation, and the citation records where
# the dosage came from, not a claim of novelty.

_KENDALL = "Kendall FP et al., Muscles: Testing and Function with Posture and Pain, 5th ed."
_NORKIN = "Norkin & White, Measurement of Joint Motion, 5th ed."
_PERRY = "Perry J & Burnfield JM, Gait Analysis: Normal and Pathological Function, 2nd ed."
_MCGILL = "McGill SM, Low Back Disorders, 3rd ed."
_SAHRMANN = "Sahrmann SA, Diagnosis and Treatment of Movement Impairment Syndromes"
_ACSM = "ACSM's Guidelines for Exercise Testing and Prescription, 11th ed."


EXERCISES: List[ExerciseDef] = [
    # ----- Cervical -------------------------------------------------------
    ExerciseDef(
        slug="chin-tuck",
        name="Chin tuck (deep neck flexor activation)",
        body_region=BodyRegion.CERVICAL,
        summary="Retrains the deep neck flexors that hold the head over the shoulders.",
        instructions=(
            "Sit or stand tall, looking straight ahead.",
            "Draw your chin straight back, as if making a double chin. Do not tip your head down.",
            "You should feel a gentle stretch at the base of the skull.",
            "Hold, then release slowly.",
        ),
        default_sets=3,
        default_reps=10,
        default_hold_seconds=5,
        default_frequency_per_week=7,
        cautions="Stop if you get dizziness, pins and needles in the arms, or a headache.",
        reference=_KENDALL,
    ),
    ExerciseDef(
        slug="upper-trapezius-stretch",
        name="Upper trapezius stretch",
        body_region=BodyRegion.CERVICAL,
        summary="Lengthens the upper trapezius on the side that sits elevated.",
        instructions=(
            "Sit tall. Hold the edge of your chair with the hand on the side being stretched.",
            "Tip your opposite ear towards your shoulder.",
            "Add a small amount of rotation away until you feel a stretch down the side of the neck.",
            "Hold, breathing normally. Do not pull hard.",
        ),
        default_sets=3,
        default_hold_seconds=30,
        default_frequency_per_week=7,
        reference=_KENDALL,
    ),
    ExerciseDef(
        slug="levator-scapulae-stretch",
        name="Levator scapulae stretch",
        body_region=BodyRegion.CERVICAL,
        summary="Targets the muscle running from the neck to the top inner shoulder blade.",
        instructions=(
            "Sit tall and raise the arm on the side being stretched, resting the hand behind your head.",
            "Turn your head about 45 degrees away from that side, then look down towards your armpit.",
            "Gently increase the stretch with your free hand on the back of your head.",
            "Hold, breathing normally.",
        ),
        default_sets=2,
        default_hold_seconds=30,
        default_frequency_per_week=7,
        reference=_KENDALL,
    ),
    ExerciseDef(
        slug="cervical-lateral-flexion-aarom",
        name="Assisted neck side-bend range work",
        body_region=BodyRegion.CERVICAL,
        summary="Restores side-to-side neck movement through its available range.",
        instructions=(
            "Sit tall with shoulders relaxed and down.",
            "Tip your ear towards your shoulder as far as is comfortable, keeping your nose facing forwards.",
            "Use your hand for a light assist at the end of the movement only.",
            "Return to the middle and repeat on the other side.",
        ),
        default_sets=2,
        default_reps=10,
        default_hold_seconds=3,
        default_frequency_per_week=7,
        cautions="Movement should be pain-free. Never force past a firm resistance.",
        reference=_NORKIN,
    ),
    # ----- Shoulder -------------------------------------------------------
    ExerciseDef(
        slug="shoulder-flexion-wand-aarom",
        name="Shoulder flexion with a stick (assisted)",
        body_region=BodyRegion.SHOULDER,
        summary="Uses the good arm to move the restricted shoulder through forward elevation.",
        instructions=(
            "Lie on your back holding a broom handle or stick with both hands, palms down.",
            "Keeping your elbows straight, lift the stick overhead using the stronger arm to guide.",
            "Go to the point of a stretch, not pain. Hold briefly.",
            "Lower under control.",
        ),
        equipment=("broom handle or dowel",),
        default_sets=3,
        default_reps=10,
        default_hold_seconds=5,
        default_frequency_per_week=7,
        cautions="Keep your ribs down; arching the low back fakes extra range.",
        reference=_NORKIN,
    ),
    ExerciseDef(
        slug="shoulder-abduction-wand-aarom",
        name="Shoulder abduction with a stick (assisted)",
        body_region=BodyRegion.SHOULDER,
        summary="Restores the ability to take the arm out to the side and overhead.",
        instructions=(
            "Lie on your back holding a stick across your body with both hands.",
            "Slide the restricted arm out to the side, pushing gently with the other hand.",
            "Keep your palm facing upwards as you pass shoulder height.",
            "Stop at a stretch, hold, then return.",
        ),
        equipment=("broom handle or dowel",),
        default_sets=3,
        default_reps=10,
        default_hold_seconds=5,
        default_frequency_per_week=7,
        reference=_NORKIN,
    ),
    ExerciseDef(
        slug="pendulum-codman",
        name="Pendulum swings",
        body_region=BodyRegion.SHOULDER,
        summary="Gentle early-stage movement for a painful or very stiff shoulder.",
        instructions=(
            "Lean forward, supporting yourself on a table with the other hand.",
            "Let the affected arm hang straight down and fully relaxed.",
            "Shift your body weight to swing the arm in small circles, then side to side.",
            "The arm muscles should stay relaxed throughout - your body does the work.",
        ),
        default_sets=2,
        default_reps=20,
        default_frequency_per_week=7,
        reference=_NORKIN,
    ),
    ExerciseDef(
        slug="wall-slides",
        name="Wall slides",
        body_region=BodyRegion.SHOULDER,
        summary="Trains the shoulder blade to rotate upwards as the arm goes overhead.",
        instructions=(
            "Stand with your back to a wall, feet a step away, low back gently flattened.",
            "Place the backs of your forearms and hands on the wall at shoulder height.",
            "Slide your arms up the wall, keeping contact, until you feel the shoulder blades rotate.",
            "Slide back down slowly, squeezing the shoulder blades down at the bottom.",
        ),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=3,
        default_reps=10,
        default_frequency_per_week=5,
        reference=_SAHRMANN,
    ),
    ExerciseDef(
        slug="doorway-pec-stretch",
        name="Doorway chest stretch",
        body_region=BodyRegion.SHOULDER,
        summary="Lengthens the chest muscles that pull the shoulders forward.",
        instructions=(
            "Stand in a doorway with forearms on the frame, elbows at about shoulder height.",
            "Step one foot through and shift your weight forwards.",
            "Keep your ribs down and chin tucked - the stretch is across the chest, not the low back.",
            "Hold, breathing normally.",
        ),
        default_sets=3,
        default_hold_seconds=30,
        default_frequency_per_week=7,
        reference=_KENDALL,
    ),
    ExerciseDef(
        slug="scapular-row-band",
        name="Band row with shoulder blade squeeze",
        body_region=BodyRegion.SHOULDER,
        summary="Strengthens the mid-back muscles that hold the shoulders back.",
        instructions=(
            "Anchor a resistance band at chest height and hold one end in each hand.",
            "Stand tall, elbows tucked at your sides.",
            "Pull the band back, leading with your elbows and drawing the shoulder blades together and down.",
            "Pause, then return slowly against the band's pull.",
        ),
        equipment=("resistance band",),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=3,
        default_reps=12,
        default_frequency_per_week=4,
        reference=_KENDALL,
    ),
    ExerciseDef(
        slug="serratus-punch",
        name="Serratus anterior punch",
        body_region=BodyRegion.SHOULDER,
        summary="Strengthens the muscle that keeps the shoulder blade flat against the ribs.",
        instructions=(
            "Lie on your back with the arm pointing straight at the ceiling, holding a light weight.",
            "Without bending the elbow, push the weight towards the ceiling so the shoulder blade lifts off the floor.",
            "Hold at the top, then lower with control.",
        ),
        equipment=("light dumbbell (1-3 kg)",),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=3,
        default_reps=12,
        default_frequency_per_week=4,
        reference=_SAHRMANN,
    ),
    ExerciseDef(
        slug="shoulder-external-rotation-band",
        name="Shoulder external rotation with band",
        body_region=BodyRegion.SHOULDER,
        summary="Strengthens the rotator cuff muscles at the back of the shoulder.",
        instructions=(
            "Anchor a band at elbow height and stand side-on to it.",
            "Tuck a rolled towel between your elbow and your side, elbow bent to 90 degrees.",
            "Keeping the elbow tucked, rotate your forearm outwards away from your stomach.",
            "Return slowly.",
        ),
        equipment=("resistance band", "rolled towel"),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=3,
        default_reps=12,
        default_frequency_per_week=4,
        reference=_ACSM,
    ),
    # ----- Elbow ----------------------------------------------------------
    ExerciseDef(
        slug="elbow-flexion-aarom",
        name="Assisted elbow bending",
        body_region=BodyRegion.ELBOW,
        summary="Recovers the ability to bend the elbow fully.",
        instructions=(
            "Sit with your forearm resting on a table, palm up.",
            "Bend the elbow as far as it will comfortably go.",
            "Use your other hand to assist gently at the end of the range.",
            "Hold at the end point, then straighten slowly.",
        ),
        default_sets=3,
        default_reps=10,
        default_hold_seconds=10,
        default_frequency_per_week=7,
        cautions="Stop at a stretch. Sharp pain or a hard block means stop and tell your clinician.",
        reference=_NORKIN,
    ),
    ExerciseDef(
        slug="biceps-stretch-wall",
        name="Biceps and elbow flexor stretch",
        body_region=BodyRegion.ELBOW,
        summary="Lengthens the muscles at the front of the upper arm.",
        instructions=(
            "Stand side-on to a wall and place your palm flat on it behind you, arm straight, thumb down.",
            "Slowly turn your body away from the wall.",
            "Hold at a gentle stretch across the front of the arm.",
        ),
        default_sets=2,
        default_hold_seconds=30,
        default_frequency_per_week=5,
        reference=_KENDALL,
    ),
    # ----- Thoracic -------------------------------------------------------
    ExerciseDef(
        slug="thoracic-extension-roller",
        name="Thoracic extension over a foam roller",
        body_region=BodyRegion.THORACIC,
        summary="Restores backward bend in the upper and mid back.",
        instructions=(
            "Lie with a foam roller across your upper back, knees bent, feet flat.",
            "Support your head with both hands, elbows pointing forwards.",
            "Ease backwards over the roller, letting the upper back extend. Keep your ribs from flaring.",
            "Return, move the roller a little higher or lower, and repeat.",
        ),
        equipment=("foam roller (or rolled towel)",),
        default_sets=2,
        default_reps=8,
        default_hold_seconds=5,
        default_frequency_per_week=5,
        cautions="Keep it to the mid and upper back. Do not roll over the low back or neck.",
        reference=_SAHRMANN,
    ),
    ExerciseDef(
        slug="open-book-rotation",
        name="Open-book rotation",
        body_region=BodyRegion.THORACIC,
        summary="Restores rotation through the mid back.",
        instructions=(
            "Lie on your side, knees stacked and bent to 90 degrees, arms straight out in front.",
            "Slide the top hand along the bottom one, then open it across your body like a book cover.",
            "Follow the hand with your eyes. Keep the knees together and on the floor.",
            "Hold at the end, then return slowly.",
        ),
        default_sets=2,
        default_reps=8,
        default_hold_seconds=5,
        default_frequency_per_week=5,
        reference=_SAHRMANN,
    ),
    ExerciseDef(
        slug="prone-ytw",
        name="Prone Y-T-W raises",
        body_region=BodyRegion.THORACIC,
        summary="Strengthens the mid-back and lower shoulder-blade muscles.",
        instructions=(
            "Lie face down with your forehead on a folded towel.",
            "Y: arms overhead in a narrow V, thumbs up, lift them a few centimetres off the floor.",
            "T: arms straight out to the sides, thumbs up, lift.",
            "W: elbows bent at your sides, squeeze the shoulder blades and lift.",
            "Hold each briefly. The movement is small - quality over height.",
        ),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=2,
        default_reps=8,
        default_hold_seconds=3,
        default_frequency_per_week=4,
        reference=_KENDALL,
    ),
    # ----- Lumbar / core --------------------------------------------------
    ExerciseDef(
        slug="pelvic-tilt",
        name="Pelvic tilt",
        body_region=BodyRegion.LUMBAR,
        summary="Teaches control of the low back and pelvis position.",
        instructions=(
            "Lie on your back, knees bent, feet flat.",
            "Gently flatten your low back into the floor by tilting the pelvis backwards.",
            "Hold, then let it return to a neutral arch.",
            "Move slowly and keep breathing.",
        ),
        default_sets=2,
        default_reps=12,
        default_hold_seconds=5,
        default_frequency_per_week=7,
        reference=_MCGILL,
    ),
    ExerciseDef(
        slug="dead-bug",
        name="Dead bug",
        body_region=BodyRegion.LUMBAR,
        summary="Trains the trunk to stay still while the arms and legs move.",
        instructions=(
            "Lie on your back, arms pointing at the ceiling, hips and knees bent to 90 degrees.",
            "Press your low back gently into the floor and keep it there.",
            "Slowly lower one arm overhead and the opposite leg towards the floor.",
            "Return and swap sides. Stop at the point where the back starts to arch.",
        ),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=3,
        default_reps=10,
        default_frequency_per_week=5,
        reference=_MCGILL,
    ),
    ExerciseDef(
        slug="bird-dog",
        name="Bird dog",
        body_region=BodyRegion.LUMBAR,
        summary="Builds trunk endurance and back-of-hip control together.",
        instructions=(
            "On hands and knees, hands under shoulders, knees under hips.",
            "Set your back flat and brace your stomach lightly.",
            "Reach one arm forwards and the opposite leg back until both are level with your body.",
            "Hold, return, and swap. Do not let your hips tip.",
        ),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=3,
        default_reps=8,
        default_hold_seconds=8,
        default_frequency_per_week=5,
        reference=_MCGILL,
    ),
    ExerciseDef(
        slug="side-plank",
        name="Side plank",
        body_region=BodyRegion.LUMBAR,
        summary="Strengthens the side of the trunk that controls sideways lean.",
        instructions=(
            "Lie on your side, propped on the elbow directly under your shoulder, knees bent.",
            "Lift your hips so your body makes a straight line from knees to head.",
            "Hold, breathing normally. Progress by straightening the legs.",
            "Do both sides even if only one was flagged.",
        ),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=3,
        default_hold_seconds=20,
        default_frequency_per_week=4,
        cautions="Come down if your hips sag or your shoulder aches.",
        reference=_MCGILL,
    ),
    # ----- Pelvis / hip abductors ----------------------------------------
    ExerciseDef(
        slug="glute-bridge",
        name="Glute bridge",
        body_region=BodyRegion.PELVIS,
        summary="Strengthens the buttock muscles that hold the pelvis level.",
        instructions=(
            "Lie on your back, knees bent, feet flat and hip-width apart.",
            "Squeeze your buttocks and lift your hips until your body is level from knees to shoulders.",
            "Hold, then lower slowly.",
            "Keep the work in the buttocks rather than the low back.",
        ),
        default_sets=3,
        default_reps=12,
        default_hold_seconds=3,
        default_frequency_per_week=5,
        reference=_ACSM,
    ),
    ExerciseDef(
        slug="side-lying-hip-abduction",
        name="Side-lying hip abduction",
        body_region=BodyRegion.PELVIS,
        summary="Targets gluteus medius, the main muscle keeping the pelvis level in standing.",
        instructions=(
            "Lie on your side with the bottom knee bent for balance and the top leg straight.",
            "Roll your hips slightly forward so the top leg is a little behind your body line.",
            "Lift the top leg towards the ceiling without letting the hip roll back.",
            "Lower slowly. The lift is smaller than you expect - around 30 degrees.",
        ),
        default_sets=3,
        default_reps=15,
        default_frequency_per_week=5,
        reference=_KENDALL,
    ),
    ExerciseDef(
        slug="clamshell",
        name="Clamshell",
        body_region=BodyRegion.PELVIS,
        summary="Strengthens the deep hip rotators and gluteus medius.",
        instructions=(
            "Lie on your side, hips and knees bent, heels together and in line with your spine.",
            "Keeping the feet touching, lift the top knee like a clam opening.",
            "Do not let your pelvis roll backwards - only the knee moves.",
            "Lower with control.",
        ),
        default_sets=3,
        default_reps=15,
        default_frequency_per_week=5,
        reference=_KENDALL,
    ),
    ExerciseDef(
        slug="standing-hip-hitch",
        name="Standing pelvic hitch",
        body_region=BodyRegion.PELVIS,
        summary="Retrains the pelvis to stay level when standing on one leg.",
        instructions=(
            "Stand sideways on a step with one foot hanging off the edge.",
            "Keeping both legs straight, let the free-side hip drop slowly.",
            "Then hitch it back up using the muscles of the standing hip, not your hands.",
            "The standing leg does all the work.",
        ),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=3,
        default_reps=12,
        default_frequency_per_week=4,
        equipment=("step or low stair",),
        reference=_SAHRMANN,
    ),
    # ----- Hip ------------------------------------------------------------
    ExerciseDef(
        slug="half-kneeling-hip-flexor-stretch",
        name="Half-kneeling hip flexor stretch",
        body_region=BodyRegion.HIP,
        summary="Lengthens the muscles at the front of the hip that tip the pelvis forwards.",
        instructions=(
            "Kneel on one knee with the other foot flat in front, both knees at about 90 degrees.",
            "Tuck your tailbone under so the low back flattens - this is the important part.",
            "Keeping that tuck, shift your weight gently forwards.",
            "You should feel the stretch at the front of the kneeling hip, not in the low back.",
        ),
        default_sets=3,
        default_hold_seconds=30,
        default_frequency_per_week=7,
        equipment=("cushion for the knee",),
        reference=_KENDALL,
    ),
    ExerciseDef(
        slug="supine-hip-flexion-aarom",
        name="Assisted knee-to-chest",
        body_region=BodyRegion.HIP,
        summary="Works the hip through its bending range.",
        instructions=(
            "Lie on your back with both legs straight.",
            "Bring one knee towards your chest, helping with both hands behind the thigh.",
            "Pull to a comfortable end point and hold.",
            "Lower the leg slowly and repeat.",
        ),
        default_sets=3,
        default_reps=10,
        default_hold_seconds=10,
        default_frequency_per_week=7,
        reference=_NORKIN,
    ),
    ExerciseDef(
        slug="supine-hamstring-stretch",
        name="Supine hamstring stretch",
        body_region=BodyRegion.HIP,
        summary="Lengthens the back of the thigh, which restricts hip bending and stride length.",
        instructions=(
            "Lie on your back. Loop a towel or belt around the ball of one foot.",
            "Keeping the knee almost straight, raise the leg until you feel a stretch behind the thigh.",
            "Keep the other leg flat on the floor.",
            "Hold, breathing normally.",
        ),
        equipment=("towel or belt",),
        default_sets=3,
        default_hold_seconds=30,
        default_frequency_per_week=7,
        reference=_NORKIN,
    ),
    ExerciseDef(
        slug="hip-90-90-rotation",
        name="90-90 hip rotations",
        body_region=BodyRegion.HIP,
        summary="Restores rotation at the hip, often the hidden limit on walking and turning.",
        instructions=(
            "Sit on the floor with one leg bent in front at 90 degrees and the other bent out to the side.",
            "Sit tall with your hands behind you for support.",
            "Rotate both knees to the other side, keeping your chest lifted.",
            "Move slowly and pause at each end.",
        ),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=2,
        default_reps=10,
        default_hold_seconds=3,
        default_frequency_per_week=5,
        reference=_NORKIN,
    ),
    # ----- Knee -----------------------------------------------------------
    ExerciseDef(
        slug="heel-slide-knee-flexion",
        name="Heel slides",
        body_region=BodyRegion.KNEE,
        summary="Recovers knee bending range after stiffness or injury.",
        instructions=(
            "Lie on your back with both legs straight, a towel under the working heel.",
            "Slide the heel towards your buttock, bending the knee as far as comfortable.",
            "Hold at the end point.",
            "Slide slowly back out to straight.",
        ),
        equipment=("towel or smooth floor",),
        default_sets=3,
        default_reps=12,
        default_hold_seconds=5,
        default_frequency_per_week=7,
        reference=_NORKIN,
    ),
    ExerciseDef(
        slug="prone-knee-hang",
        name="Prone knee hang",
        body_region=BodyRegion.KNEE,
        summary="Restores the last few degrees of knee straightening.",
        instructions=(
            "Lie face down on a bed with both legs off the edge from the knees down.",
            "Let gravity straighten the knee. Relax the thigh completely.",
            "Stay there for the full hold - this one works by time, not effort.",
        ),
        default_sets=2,
        default_hold_seconds=120,
        default_frequency_per_week=7,
        cautions="Uncomfortable is expected; sharp pain is not.",
        reference=_NORKIN,
    ),
    ExerciseDef(
        slug="quad-set",
        name="Quadriceps set",
        body_region=BodyRegion.KNEE,
        summary="Wakes up the thigh muscle that holds the knee straight.",
        instructions=(
            "Sit or lie with the leg straight and a small rolled towel under the knee.",
            "Tighten the thigh muscle to press the back of the knee down into the towel.",
            "Your heel may lift slightly. Hold, then relax fully.",
        ),
        equipment=("small rolled towel",),
        default_sets=3,
        default_reps=10,
        default_hold_seconds=8,
        default_frequency_per_week=7,
        reference=_ACSM,
    ),
    ExerciseDef(
        slug="terminal-knee-extension-band",
        name="Terminal knee extension with band",
        body_region=BodyRegion.KNEE,
        summary="Strengthens the last part of straightening, where the knee is least stable.",
        instructions=(
            "Loop a band around a fixed point at knee height and around the back of your knee.",
            "Stand facing the anchor, band pulling the knee forwards into a slight bend.",
            "Straighten the knee fully against the band, squeezing the thigh.",
            "Let it bend slowly back.",
        ),
        equipment=("resistance band",),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=3,
        default_reps=15,
        default_frequency_per_week=4,
        reference=_ACSM,
    ),
    ExerciseDef(
        slug="step-down-control",
        name="Controlled step-down",
        body_region=BodyRegion.KNEE,
        summary="Trains the knee to track over the foot instead of falling inwards.",
        instructions=(
            "Stand on a low step on one leg, the other foot hanging off the front.",
            "Watch your knee in a mirror. It should point over the second toe throughout.",
            "Bend the standing knee to lower the other heel slowly towards the floor.",
            "Touch lightly and come back up. Stop the set when the knee starts to drift inwards.",
        ),
        equipment=("low step", "mirror"),
        difficulty=Difficulty.ADVANCED,
        default_sets=3,
        default_reps=10,
        default_frequency_per_week=4,
        cautions="Quality first: a set of five well-controlled reps beats fifteen sloppy ones.",
        reference=_SAHRMANN,
    ),
    ExerciseDef(
        slug="wall-sit",
        name="Wall sit",
        body_region=BodyRegion.KNEE,
        summary="Builds thigh endurance in a position the knee has to hold every day.",
        instructions=(
            "Stand with your back against a wall, feet a step forward and hip-width apart.",
            "Slide down until your knees are bent towards 60 degrees - not past 90.",
            "Keep your knees over your feet and your weight through the heels.",
            "Hold, then slide back up.",
        ),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=3,
        default_hold_seconds=30,
        default_frequency_per_week=4,
        reference=_ACSM,
    ),
    # ----- Ankle / foot ---------------------------------------------------
    ExerciseDef(
        slug="gastroc-wall-stretch",
        name="Calf stretch at a wall",
        body_region=BodyRegion.ANKLE,
        summary="Lengthens the calf, a common limit on ankle movement and stride length.",
        instructions=(
            "Face a wall with both hands on it, one foot well back.",
            "Keep the back knee straight and the heel down, toes pointing forwards.",
            "Lean in until you feel a stretch in the back of the calf.",
            "Hold. Repeat with the back knee slightly bent to reach the deeper calf muscle.",
        ),
        default_sets=3,
        default_hold_seconds=30,
        default_frequency_per_week=7,
        reference=_NORKIN,
    ),
    ExerciseDef(
        slug="knee-to-wall-dorsiflexion",
        name="Knee-to-wall ankle mobilisation",
        body_region=BodyRegion.ANKLE,
        summary="Restores the forward ankle bend needed to walk and squat normally.",
        instructions=(
            "Stand facing a wall with the toes of one foot a hand's width away.",
            "Drive that knee forwards towards the wall, keeping the heel flat on the floor.",
            "If the knee touches, move the foot back and try again.",
            "Repeat rhythmically rather than holding.",
        ),
        default_sets=3,
        default_reps=15,
        default_frequency_per_week=7,
        reference=_NORKIN,
    ),
    ExerciseDef(
        slug="heel-raises",
        name="Heel raises",
        body_region=BodyRegion.ANKLE,
        summary="Strengthens the calf, which provides the push-off in every step.",
        instructions=(
            "Stand facing a wall or counter, fingertips on it for balance only.",
            "Rise onto the balls of both feet as high as you can.",
            "Pause at the top, then lower slowly over three seconds.",
            "Progress to one leg at a time when two-leg raises are easy.",
        ),
        default_sets=3,
        default_reps=15,
        default_frequency_per_week=4,
        reference=_ACSM,
    ),
    ExerciseDef(
        slug="single-leg-balance",
        name="Single-leg balance",
        body_region=BodyRegion.ANKLE,
        summary="Improves the ankle and hip reflexes that keep you steady on one leg.",
        instructions=(
            "Stand near a counter you can touch if needed.",
            "Lift one foot just off the floor and balance.",
            "Keep your hips level and your standing knee softly bent.",
            "Progress by looking left and right, then by closing your eyes.",
        ),
        default_sets=3,
        default_hold_seconds=30,
        default_frequency_per_week=5,
        cautions="Always have something solid within reach.",
        reference=_ACSM,
    ),
    # ----- Whole-body / gait ---------------------------------------------
    ExerciseDef(
        slug="metronome-cadence-walking",
        name="Metronome-paced walking",
        body_region=BodyRegion.FULL_BODY,
        summary="Trains walking rhythm towards a target step rate.",
        instructions=(
            "Set a metronome app to the step rate your clinician gives you.",
            "Walk on a flat, clear path, placing one foot down on each beat.",
            "Start with two minutes and build up.",
            "Stop if you feel unsteady rather than pushing through.",
        ),
        equipment=("metronome app",),
        default_sets=1,
        default_hold_seconds=600,
        default_frequency_per_week=5,
        reference=_PERRY,
    ),
    ExerciseDef(
        slug="step-length-drill",
        name="Marked step-length walking drill",
        body_region=BodyRegion.FULL_BODY,
        summary="Retrains an even, full-length step on both sides.",
        instructions=(
            "Lay out floor markers at the step length your clinician sets, evenly spaced.",
            "Walk the line placing each heel on a marker.",
            "Keep your eyes forward rather than down at your feet.",
            "Focus on the shorter side reaching the marker as fully as the other.",
        ),
        equipment=("floor markers or tape",),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=4,
        default_reps=10,
        default_frequency_per_week=4,
        reference=_PERRY,
    ),
    ExerciseDef(
        slug="tandem-walking",
        name="Tandem (heel-to-toe) walking",
        body_region=BodyRegion.FULL_BODY,
        summary="Narrows a wide walking base and sharpens balance.",
        instructions=(
            "Walk along a line placing the heel of each step directly in front of the other toe.",
            "Keep a wall within arm's reach.",
            "Arms out to the sides at first; progress to arms folded.",
            "Ten steps, turn, and come back.",
        ),
        difficulty=Difficulty.INTERMEDIATE,
        default_sets=3,
        default_reps=10,
        default_frequency_per_week=5,
        cautions="Only along a wall or rail. Skip this one if you have had a recent fall.",
        reference=_PERRY,
    ),
    ExerciseDef(
        slug="sit-to-stand",
        name="Sit to stand",
        body_region=BodyRegion.FULL_BODY,
        summary="Builds the leg strength walking speed depends on.",
        instructions=(
            "Sit on a firm chair, feet flat and slightly back, arms folded across your chest.",
            "Lean forwards from the hips and stand up without using your hands.",
            "Sit down slowly under control rather than dropping.",
            "Use your hands if needed at first, and wean off them.",
        ),
        default_sets=3,
        default_reps=10,
        default_frequency_per_week=5,
        reference=_ACSM,
    ),
    ExerciseDef(
        slug="postural-awareness-breaks",
        name="Hourly posture reset",
        body_region=BodyRegion.FULL_BODY,
        summary="Breaks up sustained positions, which matters more than any single stretch.",
        instructions=(
            "Set an hourly reminder during your working day.",
            "Stand up, roll the shoulders back and down, and tuck the chin.",
            "Take five slow breaths standing tall.",
            "Walk for a minute before sitting back down.",
        ),
        default_sets=1,
        default_reps=8,
        default_frequency_per_week=5,
        reference=_KENDALL,
    ),
]


EXERCISES_BY_SLUG: Dict[str, ExerciseDef] = {e.slug: e for e in EXERCISES}


def exercise_by_slug(slug: str) -> Optional[ExerciseDef]:
    return EXERCISES_BY_SLUG.get(slug)


# ===========================================================================
# Rules
# ===========================================================================
#
# Read each as: "when <metric> is <trigger>, these exercises apply, because <rationale>".
#
# Sign conventions come from the metric registry's own notes and are repeated in the
# rationale so a reviewer can check the rule fires on the side it claims:
#   shoulder_obliquity  positive = subject's RIGHT shoulder high
#   knee_varus_valgus   positive = valgus (knock-knee)
#   trunk_angle         positive = forward lean
#   trunk_sagittal_lean positive = forward

RULES: List[Rule] = [
    # ----- Posture: sagittal ---------------------------------------------
    Rule(
        metric_key="trunk_angle",
        trigger=Trigger.ABOVE_NORMAL,
        sign="positive",
        exercises=("half-kneeling-hip-flexor-stretch", "thoracic-extension-roller",
                   "glute-bridge", "postural-awareness-breaks"),
        rationale=(
            "The trunk is leaning forward of neutral in standing. The usual pattern is a "
            "tight hip flexor and stiff mid back pulling the chest down, with the "
            "buttock muscles not holding the pelvis underneath."
        ),
        weight=3,
        analyses=("POSTURE",),
        reference=_KENDALL,
    ),
    Rule(
        metric_key="trunk_angle",
        trigger=Trigger.BELOW_NORMAL,
        exercises=("dead-bug", "pelvic-tilt", "postural-awareness-breaks"),
        rationale=(
            "The trunk is held behind neutral, a swayback pattern in which the ribs sit "
            "behind the pelvis. Work is control of the trunk over the pelvis rather than "
            "more stretching."
        ),
        weight=2,
        analyses=("POSTURE",),
        reference=_KENDALL,
    ),
    # There is no rule for `forward_head_ratio`, and its absence is deliberate.
    #
    # Forward head position is the single most requested posture finding, and the
    # metric is measured well - it is `rounded_shoulder_angle` and friends that are
    # unsupported, not this one. What it does not have is a normal range: the registry
    # records "ratio thresholds require local validation", because the published
    # thresholds are in centimetres of craniovertebral offset and this is a ratio
    # normalised to shoulder width, so no citation carries across.
    #
    # Writing a rule anyway would mean inventing the threshold, and a threshold nobody
    # can source would hand every second desk worker four exercises for a number graded
    # against a guess. The rule goes in the day the registry has a validated range for
    # it, and not before. `validate_rules()` fails the build if anyone adds it sooner.
    # ----- Posture: frontal asymmetries (side-specific) -------------------
    Rule(
        metric_key="shoulder_obliquity",
        trigger=Trigger.ABOVE_NORMAL,
        sign="positive",
        side=Side.RIGHT,
        exercises=("upper-trapezius-stretch", "levator-scapulae-stretch",
                   "scapular-row-band", "prone-ytw"),
        rationale=(
            "The right shoulder sits higher than the left. Lengthen the right upper "
            "trapezius and levator scapulae, and build the lower shoulder-blade muscles "
            "that hold the shoulder down."
        ),
        weight=2,
        analyses=("POSTURE",),
        reference=_KENDALL,
    ),
    Rule(
        metric_key="shoulder_obliquity",
        trigger=Trigger.BELOW_NORMAL,
        sign="negative",
        side=Side.LEFT,
        exercises=("upper-trapezius-stretch", "levator-scapulae-stretch",
                   "scapular-row-band", "prone-ytw"),
        rationale=(
            "The left shoulder sits higher than the right. Lengthen the left upper "
            "trapezius and levator scapulae, and build the lower shoulder-blade muscles "
            "that hold the shoulder down."
        ),
        weight=2,
        analyses=("POSTURE",),
        reference=_KENDALL,
    ),
    Rule(
        metric_key="pelvic_obliquity",
        trigger=Trigger.OUTSIDE_NORMAL,
        exercises=("side-lying-hip-abduction", "standing-hip-hitch", "clamshell",
                   "side-plank"),
        rationale=(
            "One side of the pelvis sits higher than the other in standing. The muscle "
            "that holds the pelvis level on a standing leg is gluteus medius, so the work "
            "is hip abductor strength and control on both sides."
        ),
        weight=3,
        analyses=("POSTURE",),
        reference=_KENDALL,
    ),
    Rule(
        metric_key="trunk_lateral_shift_ratio",
        trigger=Trigger.OUTSIDE_NORMAL,
        exercises=("side-plank", "side-lying-hip-abduction", "standing-hip-hitch"),
        rationale=(
            "The trunk is shifted sideways off the midline. This travels with hip "
            "abductor weakness and poor sideways trunk control."
        ),
        weight=2,
        analyses=("POSTURE",),
        reference=_KENDALL,
    ),
    Rule(
        metric_key="head_lateral_flexion",
        trigger=Trigger.OUTSIDE_NORMAL,
        exercises=("upper-trapezius-stretch", "cervical-lateral-flexion-aarom",
                   "chin-tuck"),
        rationale=(
            "The head is habitually tilted to one side. Restore even side-bending range "
            "and retrain a level head position."
        ),
        weight=1,
        analyses=("POSTURE",),
        reference=_KENDALL,
    ),
    # ----- Posture: lower limb -------------------------------------------
    Rule(
        metric_key="knee_varus_valgus",
        trigger=Trigger.ABOVE_NORMAL,
        sign="positive",
        exercises=("clamshell", "side-lying-hip-abduction", "step-down-control",
                   "glute-bridge"),
        rationale=(
            "The knees fall inwards relative to the hip-to-ankle line (valgus). Frontal "
            "knee position in standing is largely controlled from the hip, so the work is "
            "hip abductor and rotator strength plus knee-tracking practice."
        ),
        weight=3,
        analyses=("POSTURE",),
        reference=_SAHRMANN,
    ),
    Rule(
        metric_key="knee_varus_valgus",
        trigger=Trigger.BELOW_NORMAL,
        sign="negative",
        exercises=("single-leg-balance", "heel-raises", "step-down-control"),
        rationale=(
            "The knees sit outside the hip-to-ankle line (varus). Balance and calf and "
            "foot control reduce the sideways load this places on the knee."
        ),
        weight=2,
        analyses=("POSTURE",),
        reference=_SAHRMANN,
    ),
    Rule(
        metric_key="left_knee_angle",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.LEFT,
        exercises=("prone-knee-hang", "quad-set", "terminal-knee-extension-band"),
        rationale=(
            "The left knee is not reaching full straightening in relaxed standing, which "
            "loads the thigh muscle continuously and shortens the step on that side."
        ),
        weight=3,
        analyses=("POSTURE",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="right_knee_angle",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.RIGHT,
        exercises=("prone-knee-hang", "quad-set", "terminal-knee-extension-band"),
        rationale=(
            "The right knee is not reaching full straightening in relaxed standing, which "
            "loads the thigh muscle continuously and shortens the step on that side."
        ),
        weight=3,
        analyses=("POSTURE",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="left_hip_angle",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.LEFT,
        exercises=("half-kneeling-hip-flexor-stretch", "glute-bridge"),
        rationale=(
            "The left hip is held in some bend in standing, the usual sign of a short hip "
            "flexor with the buttock muscle not taking over."
        ),
        weight=2,
        analyses=("POSTURE",),
        reference=_KENDALL,
    ),
    Rule(
        metric_key="right_hip_angle",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.RIGHT,
        exercises=("half-kneeling-hip-flexor-stretch", "glute-bridge"),
        rationale=(
            "The right hip is held in some bend in standing, the usual sign of a short hip "
            "flexor with the buttock muscle not taking over."
        ),
        weight=2,
        analyses=("POSTURE",),
        reference=_KENDALL,
    ),
    # ----- Gait -----------------------------------------------------------
    Rule(
        metric_key="cadence",
        trigger=Trigger.BELOW_NORMAL,
        exercises=("metronome-cadence-walking", "sit-to-stand", "heel-raises"),
        rationale=(
            "Steps are being taken more slowly than the typical adult rate. Rhythm "
            "training plus the leg strength that push-off and stepping depend on."
        ),
        weight=3,
        analyses=("GAIT",),
        reference=_PERRY,
    ),
    Rule(
        metric_key="cadence",
        trigger=Trigger.ABOVE_NORMAL,
        exercises=("metronome-cadence-walking", "tandem-walking"),
        rationale=(
            "Step rate is above the typical adult range, often a compensation for short "
            "steps. Pace training with attention to lengthening the step rather than "
            "quickening it."
        ),
        weight=2,
        analyses=("GAIT",),
        reference=_PERRY,
    ),
    Rule(
        metric_key="stride_length_ratio",
        trigger=Trigger.BELOW_NORMAL,
        exercises=("step-length-drill", "supine-hamstring-stretch",
                   "half-kneeling-hip-flexor-stretch", "gastroc-wall-stretch"),
        rationale=(
            "Stride is short for this person's leg length. The common limits are hip "
            "extension at the back of the step and ankle movement at push-off."
        ),
        weight=3,
        analyses=("GAIT",),
        reference=_PERRY,
    ),
    Rule(
        metric_key="walking_speed_ratio",
        trigger=Trigger.BELOW_NORMAL,
        exercises=("sit-to-stand", "heel-raises", "metronome-cadence-walking",
                   "step-length-drill"),
        rationale=(
            "Walking speed is below the expected range for this leg length. Speed is the "
            "product of step length and step rate, so both are trained, on a base of leg "
            "strength."
        ),
        weight=3,
        analyses=("GAIT",),
        reference=_PERRY,
    ),
    Rule(
        metric_key="step_width_ratio",
        trigger=Trigger.ABOVE_NORMAL,
        exercises=("tandem-walking", "single-leg-balance", "side-lying-hip-abduction"),
        rationale=(
            "The feet are being placed wider apart than usual, which is the body buying "
            "stability. Balance and hip abductor work narrow the base safely."
        ),
        weight=3,
        analyses=("GAIT",),
        reference=_PERRY,
    ),
    Rule(
        metric_key="knee_flexion_max",
        trigger=Trigger.BELOW_NORMAL,
        exercises=("heel-slide-knee-flexion", "quad-set", "step-down-control"),
        rationale=(
            "The knee is not bending as far as expected during the swing phase of "
            "walking, which makes the foot more likely to catch."
        ),
        weight=3,
        analyses=("GAIT",),
        reference=_PERRY,
    ),
    Rule(
        metric_key="hip_flexion_max",
        trigger=Trigger.BELOW_NORMAL,
        exercises=("supine-hip-flexion-aarom", "supine-hamstring-stretch",
                   "step-length-drill"),
        rationale=(
            "The hip is not bringing the leg as far forward as expected in walking, which "
            "shortens the step on that side."
        ),
        weight=2,
        analyses=("GAIT",),
        reference=_PERRY,
    ),
    Rule(
        metric_key="trunk_sagittal_lean",
        trigger=Trigger.ABOVE_NORMAL,
        sign="positive",
        exercises=("half-kneeling-hip-flexor-stretch", "dead-bug", "bird-dog",
                   "thoracic-extension-roller"),
        rationale=(
            "The trunk leans forward while walking. This commonly compensates for limited "
            "hip extension or low trunk endurance."
        ),
        weight=2,
        analyses=("GAIT",),
        reference=_PERRY,
    ),
    Rule(
        metric_key="stride_time_left",
        trigger=Trigger.OUTSIDE_NORMAL,
        side=Side.LEFT,
        exercises=("step-length-drill", "metronome-cadence-walking"),
        rationale=(
            "The left stride is taking longer or shorter than the typical range, so the "
            "two sides are not spending equal time."
        ),
        weight=1,
        analyses=("GAIT",),
        reference=_PERRY,
    ),
    Rule(
        metric_key="stride_time_right",
        trigger=Trigger.OUTSIDE_NORMAL,
        side=Side.RIGHT,
        exercises=("step-length-drill", "metronome-cadence-walking"),
        rationale=(
            "The right stride is taking longer or shorter than the typical range, so the "
            "two sides are not spending equal time."
        ),
        weight=1,
        analyses=("GAIT",),
        reference=_PERRY,
    ),
    # ----- Range of motion ------------------------------------------------
    # For every one of these the normal range is a floor, so only BELOW_NORMAL fires.
    Rule(
        metric_key="rom_shoulder_flexion_left",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.LEFT,
        exercises=("shoulder-flexion-wand-aarom", "pendulum-codman", "wall-slides",
                   "doorway-pec-stretch"),
        rationale="The left shoulder is not reaching full overhead range.",
        weight=3,
        analyses=("ROM",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="rom_shoulder_flexion_right",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.RIGHT,
        exercises=("shoulder-flexion-wand-aarom", "pendulum-codman", "wall-slides",
                   "doorway-pec-stretch"),
        rationale="The right shoulder is not reaching full overhead range.",
        weight=3,
        analyses=("ROM",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="rom_shoulder_abduction_left",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.LEFT,
        exercises=("shoulder-abduction-wand-aarom", "pendulum-codman",
                   "shoulder-external-rotation-band", "serratus-punch"),
        rationale="The left shoulder is not reaching full range out to the side.",
        weight=3,
        analyses=("ROM",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="rom_shoulder_abduction_right",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.RIGHT,
        exercises=("shoulder-abduction-wand-aarom", "pendulum-codman",
                   "shoulder-external-rotation-band", "serratus-punch"),
        rationale="The right shoulder is not reaching full range out to the side.",
        weight=3,
        analyses=("ROM",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="rom_elbow_flexion_left",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.LEFT,
        exercises=("elbow-flexion-aarom", "biceps-stretch-wall"),
        rationale="The left elbow is not bending through its full range.",
        weight=2,
        analyses=("ROM",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="rom_elbow_flexion_right",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.RIGHT,
        exercises=("elbow-flexion-aarom", "biceps-stretch-wall"),
        rationale="The right elbow is not bending through its full range.",
        weight=2,
        analyses=("ROM",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="rom_hip_flexion_left",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.LEFT,
        exercises=("supine-hip-flexion-aarom", "supine-hamstring-stretch",
                   "hip-90-90-rotation"),
        rationale="The left hip is not bending through its full range.",
        weight=3,
        analyses=("ROM",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="rom_hip_flexion_right",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.RIGHT,
        exercises=("supine-hip-flexion-aarom", "supine-hamstring-stretch",
                   "hip-90-90-rotation"),
        rationale="The right hip is not bending through its full range.",
        weight=3,
        analyses=("ROM",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="rom_knee_flexion_left",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.LEFT,
        exercises=("heel-slide-knee-flexion", "quad-set", "wall-sit"),
        rationale="The left knee is not bending through its full range.",
        weight=3,
        analyses=("ROM",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="rom_knee_flexion_right",
        trigger=Trigger.BELOW_NORMAL,
        side=Side.RIGHT,
        exercises=("heel-slide-knee-flexion", "quad-set", "wall-sit"),
        rationale="The right knee is not bending through its full range.",
        weight=3,
        analyses=("ROM",),
        reference=_NORKIN,
    ),
    Rule(
        metric_key="rom_cervical_lateral_flexion",
        trigger=Trigger.BELOW_NORMAL,
        exercises=("cervical-lateral-flexion-aarom", "upper-trapezius-stretch",
                   "levator-scapulae-stretch", "chin-tuck"),
        rationale="Neck side-bending is restricted relative to the expected range.",
        weight=2,
        analyses=("ROM",),
        reference=_NORKIN,
    ),
]


_RULES_BY_METRIC: Dict[str, List[Rule]] = {}
for _rule in RULES:
    _RULES_BY_METRIC.setdefault(_rule.metric_key, []).append(_rule)


def rules_for_metric(metric_key: str, analysis_type: Optional[str] = None) -> List[Rule]:
    """Rules registered against one metric, optionally narrowed to one analysis."""
    found = _RULES_BY_METRIC.get(metric_key, [])
    if analysis_type is None:
        return list(found)
    wanted = analysis_type.upper()
    return [r for r in found if wanted in r.analyses]


def all_rule_metric_keys() -> Sequence[str]:
    return tuple(_RULES_BY_METRIC.keys())


def validate_rules() -> List[str]:
    """
    Check every rule against the metric registry and the catalogue.

    Returns a list of problems; empty means the file is coherent. Called from the test
    suite rather than at import, so a bad rule fails the build rather than the first
    patient's screening. It catches the three mistakes that are easy to make here:
    a typo'd exercise slug (silently prescribes nothing), a rule against a metric the
    pipeline cannot measure (never fires, looks like coverage), and a rule against a
    metric with no normal range (has no threshold to trigger on).
    """
    from app.core.metrics.gait_registry import GAIT_METRICS
    from app.core.metrics.registry import POSTURE_METRICS
    from app.core.metrics.rom_registry import ROM_METRICS

    specs = {}
    for group in (POSTURE_METRICS, GAIT_METRICS, ROM_METRICS):
        for spec in group:
            specs[spec.key] = spec

    problems: List[str] = []
    for rule in RULES:
        spec = specs.get(rule.metric_key)
        if spec is None:
            problems.append(f"{rule.metric_key}: no such metric in any registry")
            continue
        if not spec.is_supported:
            problems.append(
                f"{rule.metric_key}: metric is unsupported "
                f"({spec.unsupported_reason}) and can never trigger"
            )
        if spec.normal_range is None:
            problems.append(
                f"{rule.metric_key}: metric has no normal range, so there is no "
                f"threshold for '{rule.trigger.value}' to test"
            )
        if rule.sign is not None and not spec.signed:
            problems.append(
                f"{rule.metric_key}: rule narrows on sign='{rule.sign}' but the metric "
                f"is unsigned"
            )
        if not rule.exercises:
            problems.append(f"{rule.metric_key}: rule prescribes nothing")
        for slug in rule.exercises:
            if slug not in EXERCISES_BY_SLUG:
                problems.append(f"{rule.metric_key}: unknown exercise slug '{slug}'")
        if not rule.rationale.strip():
            problems.append(f"{rule.metric_key}: rule has no rationale")
    return problems
