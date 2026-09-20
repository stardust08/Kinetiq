-- CreateIndex: Composite index on Booking for (userId, remainingScreeningCount)
-- This optimizes queries that filter bookings by user and check remaining counts
CREATE INDEX "Booking_userId_remainingScreeningCount_idx" ON "Booking"("userId", "remainingScreeningCount");

-- CreateIndex: Composite index on PostureAnalysis for (bookingId, analysisDate)
-- This optimizes queries that retrieve analyses for a specific booking ordered by date
CREATE INDEX "PostureAnalysis_bookingId_analysisDate_idx" ON "PostureAnalysis"("bookingId", "analysisDate");

-- CreateIndex: Partial index on Booking for active bookings with remaining counts
-- This optimizes queries that find bookings available for new analyses
-- Only indexes bookings that are CONFIRMED or COMPLETED and have remaining counts > 0
CREATE INDEX "Booking_active_with_counts_idx" ON "Booking"("userId", "remainingScreeningCount") 
WHERE "status" IN ('CONFIRMED', 'COMPLETED') AND "remainingScreeningCount" > 0;
