-- DropIndex
DROP INDEX "Booking_serviceId_idx";

-- AlterTable
ALTER TABLE "PostureAnalysis" ADD COLUMN     "capturedPoses" TEXT;

-- CreateTable
CREATE TABLE "SlotLock" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slotTime" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isReleased" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SlotLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoseLandmarks" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "poseType" TEXT NOT NULL,
    "landmarksData" JSONB,
    "imageData" TEXT,
    "frameCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoseLandmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlotLock_expiresAt_isReleased_idx" ON "SlotLock"("expiresAt", "isReleased");

-- CreateIndex
CREATE INDEX "SlotLock_userId_isReleased_idx" ON "SlotLock"("userId", "isReleased");

-- CreateIndex
CREATE INDEX "SlotLock_serviceId_slotTime_idx" ON "SlotLock"("serviceId", "slotTime");

-- CreateIndex
CREATE UNIQUE INDEX "SlotLock_serviceId_slotTime_key" ON "SlotLock"("serviceId", "slotTime");

-- CreateIndex
CREATE INDEX "PoseLandmarks_analysisId_idx" ON "PoseLandmarks"("analysisId");

-- CreateIndex
CREATE INDEX "PoseLandmarks_poseType_idx" ON "PoseLandmarks"("poseType");

-- CreateIndex
CREATE UNIQUE INDEX "PoseLandmarks_analysisId_poseType_key" ON "PoseLandmarks"("analysisId", "poseType");

-- CreateIndex
CREATE INDEX "Booking_serviceId_time_status_idx" ON "Booking"("serviceId", "time", "status");

-- CreateIndex
CREATE INDEX "Booking_time_idx" ON "Booking"("time");

-- AddForeignKey
ALTER TABLE "SlotLock" ADD CONSTRAINT "SlotLock_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotLock" ADD CONSTRAINT "SlotLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoseLandmarks" ADD CONSTRAINT "PoseLandmarks_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "PostureAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
