-- Add CHECK constraints for Booking screening counts

-- Constraint 1: Non-negative counts
-- Ensure all screening count fields are >= 0
ALTER TABLE "Booking" 
ADD CONSTRAINT "booking_screening_counts_non_negative" 
CHECK (
  "totalScreeningCount" >= 0 AND 
  "usedScreeningCount" >= 0 AND 
  "remainingScreeningCount" >= 0
);

-- Constraint 2: Count consistency
-- Ensure totalScreeningCount = usedScreeningCount + remainingScreeningCount
ALTER TABLE "Booking" 
ADD CONSTRAINT "booking_screening_counts_consistency" 
CHECK ("totalScreeningCount" = "usedScreeningCount" + "remainingScreeningCount");
