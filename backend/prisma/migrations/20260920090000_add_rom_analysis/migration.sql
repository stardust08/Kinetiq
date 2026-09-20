-- CreateTable
--
-- No per-metric columns, unlike GaitAnalysis. The metric set is defined by the ROM
-- registry and changes when a movement is added or retired; pinning each one to a
-- column would mean a migration every time the registry moves, and would lose the
-- per-metric status, confidence and withholding reason the v2 payload carries.
CREATE TABLE "ROMAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "analysisDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metricsJson" JSONB,
    "qualityFlags" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 2,
    "capturedMovements" TEXT,
    "totalFrames" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'completed',

    CONSTRAINT "ROMAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ROMAnalysis_userId_analysisDate_idx" ON "ROMAnalysis"("userId", "analysisDate");

-- CreateIndex
CREATE INDEX "ROMAnalysis_bookingId_idx" ON "ROMAnalysis"("bookingId");

-- AddForeignKey
ALTER TABLE "ROMAnalysis" ADD CONSTRAINT "ROMAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ROMAnalysis" ADD CONSTRAINT "ROMAnalysis_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
