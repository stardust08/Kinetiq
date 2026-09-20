-- Metric confidence v2.
--
-- Makes every clinical metric column nullable so that a metric which could not be
-- measured is stored as NULL instead of a fabricated default. The previous code
-- wrote hardcoded fallbacks (stride time 1.0, stride length 0.3, cadence clamped to
-- [40,200], stance 60/40) whenever detection failed, which made a failed capture
-- indistinguishable from a successful one in the database.
--
-- Adds metricsJson, which carries per-metric value + status + confidence + citation,
-- and schemaVersion so existing rows stay identifiable as v1 (computed with the
-- superseded maths). Existing rows are NOT modified or deleted.

-- Posture ---------------------------------------------------------------
ALTER TABLE "PostureAnalysis" ALTER COLUMN "fhdPixels" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "cervicalAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "headLateralFlexion" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "headRotation" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "thoracicKyphosisAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "lumbarLordosisAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "trunkLateralShift" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "trunkAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "leftShoulderAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "rightShoulderAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "shoulderHeightDiff" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "roundedShoulderAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "leftElbowAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "rightElbowAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "leftHipAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "rightHipAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "pelvicObliquity" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "pelvicTiltAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "hipHeightDiff" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "leftKneeAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "rightKneeAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "kneeVarusValgus" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "kneeFlexionNeutral" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "qAngleLeft" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "qAngleRight" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "footProgressionAngle" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "pronationSupinationLeft" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "pronationSupinationRight" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "shoulderWidth" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "hipWidth" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "torsoLength" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "leftArmLength" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "rightArmLength" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "leftLegLength" DROP NOT NULL;
ALTER TABLE "PostureAnalysis" ALTER COLUMN "rightLegLength" DROP NOT NULL;

ALTER TABLE "PostureAnalysis" ADD COLUMN IF NOT EXISTS "metricsJson" JSONB;
ALTER TABLE "PostureAnalysis" ADD COLUMN IF NOT EXISTS "qualityFlags" JSONB;
ALTER TABLE "PostureAnalysis" ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER NOT NULL DEFAULT 1;

-- Gait ------------------------------------------------------------------
ALTER TABLE "GaitAnalysis" ALTER COLUMN "cadence" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "strideTimeLeft" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "strideTimeRight" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "stancePhasePercent" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "swingPhasePercent" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "doubleSupportTime" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "strideLength" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "stepLengthLeft" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "stepLengthRight" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "stepWidth" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "walkingSpeed" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "stepLengthSymmetry" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "hipFlexionMax" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "hipExtensionMax" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "hipFlexionRom" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "kneeFlexionMax" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "kneeExtensionMin" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "kneeFlexionRom" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "leftKneeAngleAvg" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "rightKneeAngleAvg" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "ankleDorsiflexionMax" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "footProgressionAngleLeft" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "footProgressionAngleRight" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "armSwingAmplitude" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "trunkLateralSway" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "trunkSagittalLean" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "pelvicObliquityRange" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "armSwingSymmetry" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "gaitSymmetryIndex" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "stepRegularity" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "gaitQualityScore" DROP NOT NULL;
ALTER TABLE "GaitAnalysis" ALTER COLUMN "gaitCycleCount" DROP NOT NULL;

ALTER TABLE "GaitAnalysis" ADD COLUMN IF NOT EXISTS "metricsJson" JSONB;
ALTER TABLE "GaitAnalysis" ADD COLUMN IF NOT EXISTS "qualityFlags" JSONB;
ALTER TABLE "GaitAnalysis" ADD COLUMN IF NOT EXISTS "cyclesAnalysed" INTEGER;
ALTER TABLE "GaitAnalysis" ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER NOT NULL DEFAULT 1;

-- Existing rows were computed with the v1 maths. They keep schemaVersion = 1 so
-- reports can label them, and must not be compared against v2 results.
CREATE INDEX IF NOT EXISTS "PostureAnalysis_schemaVersion_idx" ON "PostureAnalysis"("schemaVersion");
CREATE INDEX IF NOT EXISTS "GaitAnalysis_schemaVersion_idx" ON "GaitAnalysis"("schemaVersion");
