-- CreateTable
CREATE TABLE "GaitAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "analysisDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cadence" DOUBLE PRECISION NOT NULL,
    "strideTimeLeft" DOUBLE PRECISION NOT NULL,
    "strideTimeRight" DOUBLE PRECISION NOT NULL,
    "stancePhasePercent" DOUBLE PRECISION NOT NULL,
    "swingPhasePercent" DOUBLE PRECISION NOT NULL,
    "doubleSupportTime" DOUBLE PRECISION NOT NULL,
    "strideLength" DOUBLE PRECISION NOT NULL,
    "stepLengthLeft" DOUBLE PRECISION NOT NULL,
    "stepLengthRight" DOUBLE PRECISION NOT NULL,
    "stepWidth" DOUBLE PRECISION NOT NULL,
    "walkingSpeed" DOUBLE PRECISION NOT NULL,
    "stepLengthSymmetry" DOUBLE PRECISION NOT NULL,
    "hipFlexionMax" DOUBLE PRECISION NOT NULL,
    "hipExtensionMax" DOUBLE PRECISION NOT NULL,
    "hipFlexionRom" DOUBLE PRECISION NOT NULL,
    "kneeFlexionMax" DOUBLE PRECISION NOT NULL,
    "kneeExtensionMin" DOUBLE PRECISION NOT NULL,
    "kneeFlexionRom" DOUBLE PRECISION NOT NULL,
    "leftKneeAngleAvg" DOUBLE PRECISION NOT NULL,
    "rightKneeAngleAvg" DOUBLE PRECISION NOT NULL,
    "ankleDorsiflexionMax" DOUBLE PRECISION NOT NULL,
    "footProgressionAngleLeft" DOUBLE PRECISION NOT NULL,
    "footProgressionAngleRight" DOUBLE PRECISION NOT NULL,
    "armSwingAmplitude" DOUBLE PRECISION NOT NULL,
    "trunkLateralSway" DOUBLE PRECISION NOT NULL,
    "trunkSagittalLean" DOUBLE PRECISION NOT NULL,
    "pelvicObliquityRange" DOUBLE PRECISION NOT NULL,
    "armSwingSymmetry" DOUBLE PRECISION NOT NULL,
    "gaitSymmetryIndex" DOUBLE PRECISION NOT NULL,
    "stepRegularity" DOUBLE PRECISION NOT NULL,
    "gaitQualityScore" DOUBLE PRECISION NOT NULL,
    "gaitCycleCount" INTEGER NOT NULL,
    "capturedViews" TEXT,
    "totalFrames" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GaitAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaitFrames" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "viewType" TEXT NOT NULL,
    "imageData" TEXT,
    "annotatedTimeSeries" JSONB,
    "heelStrikes" JSONB,
    "frameCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GaitFrames_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GaitAnalysis_userId_idx" ON "GaitAnalysis"("userId");

-- CreateIndex
CREATE INDEX "GaitAnalysis_bookingId_idx" ON "GaitAnalysis"("bookingId");

-- CreateIndex
CREATE INDEX "GaitAnalysis_analysisDate_idx" ON "GaitAnalysis"("analysisDate");

-- CreateIndex
CREATE INDEX "GaitAnalysis_bookingId_analysisDate_idx" ON "GaitAnalysis"("bookingId", "analysisDate");

-- CreateIndex
CREATE INDEX "GaitFrames_analysisId_idx" ON "GaitFrames"("analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "GaitFrames_analysisId_viewType_key" ON "GaitFrames"("analysisId", "viewType");

-- AddForeignKey
ALTER TABLE "GaitAnalysis" ADD CONSTRAINT "GaitAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaitAnalysis" ADD CONSTRAINT "GaitAnalysis_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaitFrames" ADD CONSTRAINT "GaitFrames_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "GaitAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
