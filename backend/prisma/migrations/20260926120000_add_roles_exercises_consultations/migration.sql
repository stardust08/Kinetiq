-- Roles, exercise prescription and video consultations.
--
-- Additive except for one changed constraint on "SlotLock" (see the note at the bottom),
-- so it applies to a populated database without touching existing rows.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "AnalysisType" AS ENUM ('POSTURE', 'GAIT', 'ROM');
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "PlanItemSource" AS ENUM ('AUTO', 'MANUAL');
CREATE TYPE "Difficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "BodyRegion" AS ENUM ('CERVICAL', 'SHOULDER', 'ELBOW', 'THORACIC', 'LUMBAR', 'PELVIS', 'HIP', 'KNEE', 'ANKLE', 'FOOT', 'FULL_BODY');
CREATE TYPE "VideoSessionStatus" AS ENUM ('SCHEDULED', 'WAITING', 'LIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "ParticipantRole" AS ENUM ('PATIENT', 'CLINICIAN', 'ADMIN', 'OBSERVER');

-- ---------------------------------------------------------------------------
-- Clinician profiles and calendars
-- ---------------------------------------------------------------------------
CREATE TABLE "ClinicianProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialisation" TEXT,
    "qualifications" TEXT,
    "registrationNo" TEXT,
    "yearsExperience" INTEGER,
    "bio" TEXT,
    "languages" TEXT,
    "consultationModes" TEXT DEFAULT 'video',
    "isAcceptingPatients" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "slotDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxDailyBookings" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicianProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClinicianProfile_userId_key" ON "ClinicianProfile"("userId");
CREATE INDEX "ClinicianProfile_isAcceptingPatients_idx" ON "ClinicianProfile"("isAcceptingPatients");
ALTER TABLE "ClinicianProfile" ADD CONSTRAINT "ClinicianProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClinicianAvailability" (
    "id" TEXT NOT NULL,
    "clinicianProfileId" TEXT NOT NULL,
    -- 0 = Monday ... 6 = Sunday, matching Python's date.weekday().
    "dayOfWeek" INTEGER NOT NULL,
    -- Minutes from midnight, local to the profile's timezone.
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicianAvailability_pkey" PRIMARY KEY ("id")
);
-- Name spelled out to match what Prisma generates. Postgres truncates identifiers at 63
-- characters, and the natural name for this key is longer - so writing the untruncated
-- name here creates an index Prisma then reports as drift on every subsequent diff.
CREATE UNIQUE INDEX "ClinicianAvailability_clinicianProfileId_dayOfWeek_startMin_key"
    ON "ClinicianAvailability"("clinicianProfileId", "dayOfWeek", "startMinute");
CREATE INDEX "ClinicianAvailability_clinicianProfileId_dayOfWeek_idx"
    ON "ClinicianAvailability"("clinicianProfileId", "dayOfWeek");
ALTER TABLE "ClinicianAvailability" ADD CONSTRAINT "ClinicianAvailability_clinicianProfileId_fkey"
    FOREIGN KEY ("clinicianProfileId") REFERENCES "ClinicianProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClinicianTimeOff" (
    "id" TEXT NOT NULL,
    "clinicianProfileId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicianTimeOff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClinicianTimeOff_clinicianProfileId_startAt_endAt_idx"
    ON "ClinicianTimeOff"("clinicianProfileId", "startAt", "endAt");
ALTER TABLE "ClinicianTimeOff" ADD CONSTRAINT "ClinicianTimeOff_clinicianProfileId_fkey"
    FOREIGN KEY ("clinicianProfileId") REFERENCES "ClinicianProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Exercise library and prescription
-- ---------------------------------------------------------------------------
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "videoUrl" TEXT,
    "videoProvider" TEXT,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER,
    "bodyRegion" "BodyRegion" NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'BEGINNER',
    "equipment" TEXT,
    "defaultSets" INTEGER NOT NULL DEFAULT 2,
    "defaultReps" INTEGER,
    "defaultHoldSeconds" INTEGER,
    "defaultFrequencyPerWeek" INTEGER NOT NULL DEFAULT 5,
    "instructions" JSONB,
    "cautions" TEXT,
    "reference" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Exercise_slug_key" ON "Exercise"("slug");
CREATE INDEX "Exercise_bodyRegion_isActive_idx" ON "Exercise"("bodyRegion", "isActive");
CREATE INDEX "Exercise_isActive_idx" ON "Exercise"("isActive");
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ExercisePlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "analysisType" "AnalysisType" NOT NULL,
    "analysisId" TEXT NOT NULL,
    -- DRAFT until a clinician reviews it. A patient cannot see a draft at all.
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "summary" TEXT,
    "clinicianNotes" TEXT,
    "findings" JSONB,
    "engineVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationWeeks" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExercisePlan_pkey" PRIMARY KEY ("id")
);
-- One plan per analysis: re-running the engine updates rather than stacking a second
-- plan drawn from identical measurements.
CREATE UNIQUE INDEX "ExercisePlan_analysisType_analysisId_key" ON "ExercisePlan"("analysisType", "analysisId");
CREATE INDEX "ExercisePlan_patientId_status_idx" ON "ExercisePlan"("patientId", "status");
CREATE INDEX "ExercisePlan_bookingId_idx" ON "ExercisePlan"("bookingId");
CREATE INDEX "ExercisePlan_status_createdAt_idx" ON "ExercisePlan"("status", "createdAt");
ALTER TABLE "ExercisePlan" ADD CONSTRAINT "ExercisePlan_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExercisePlan" ADD CONSTRAINT "ExercisePlan_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExercisePlan" ADD CONSTRAINT "ExercisePlan_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExercisePlan" ADD CONSTRAINT "ExercisePlan_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ExercisePlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sets" INTEGER NOT NULL DEFAULT 2,
    "reps" INTEGER,
    "holdSeconds" INTEGER,
    "frequencyPerWeek" INTEGER NOT NULL DEFAULT 5,
    "durationWeeks" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "source" "PlanItemSource" NOT NULL DEFAULT 'AUTO',
    "reason" TEXT,
    "triggerMetricKeys" TEXT,
    "clinicianNote" TEXT,
    -- Soft delete: a clinician striking an auto-suggestion off is itself a clinical
    -- decision worth keeping.
    "isRemoved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExercisePlanItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExercisePlanItem_planId_exerciseId_key" ON "ExercisePlanItem"("planId", "exerciseId");
CREATE INDEX "ExercisePlanItem_planId_isRemoved_idx" ON "ExercisePlanItem"("planId", "isRemoved");
ALTER TABLE "ExercisePlanItem" ADD CONSTRAINT "ExercisePlanItem_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "ExercisePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExercisePlanItem" ADD CONSTRAINT "ExercisePlanItem_exerciseId_fkey"
    FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ExerciseCompletion" (
    "id" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setsDone" INTEGER,
    "repsDone" INTEGER,
    -- 0-10 numeric rating scale, the standard used in physiotherapy.
    "painScore" INTEGER,
    "difficultyRating" INTEGER,
    "notes" TEXT,
    CONSTRAINT "ExerciseCompletion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExerciseCompletion_planItemId_completedAt_idx" ON "ExerciseCompletion"("planItemId", "completedAt");
CREATE INDEX "ExerciseCompletion_patientId_completedAt_idx" ON "ExerciseCompletion"("patientId", "completedAt");
ALTER TABLE "ExerciseCompletion" ADD CONSTRAINT "ExerciseCompletion_planItemId_fkey"
    FOREIGN KEY ("planItemId") REFERENCES "ExercisePlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseCompletion" ADD CONSTRAINT "ExerciseCompletion_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Video consultations
-- ---------------------------------------------------------------------------
CREATE TABLE "VideoSession" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT,
    "roomName" TEXT NOT NULL,
    "status" "VideoSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "startedById" TEXT,
    "endedById" TEXT,
    -- The screening gate. Only a CLINICIAN or ADMIN flips this, and a patient's browser
    -- may only begin a capture while it is true and holding the matching token.
    "screeningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "screeningEnabledAt" TIMESTAMP(3),
    "screeningEnabledById" TEXT,
    "screeningType" "AnalysisType",
    "screeningToken" TEXT,
    "screeningTokenExpiresAt" TIMESTAMP(3),
    "screeningConsumedAt" TIMESTAMP(3),
    "clinicalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VideoSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VideoSession_roomName_key" ON "VideoSession"("roomName");
CREATE UNIQUE INDEX "VideoSession_screeningToken_key" ON "VideoSession"("screeningToken");
CREATE INDEX "VideoSession_bookingId_idx" ON "VideoSession"("bookingId");
CREATE INDEX "VideoSession_patientId_status_idx" ON "VideoSession"("patientId", "status");
CREATE INDEX "VideoSession_clinicianId_status_idx" ON "VideoSession"("clinicianId", "status");
CREATE INDEX "VideoSession_status_scheduledAt_idx" ON "VideoSession"("status", "scheduledAt");
ALTER TABLE "VideoSession" ADD CONSTRAINT "VideoSession_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoSession" ADD CONSTRAINT "VideoSession_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoSession" ADD CONSTRAINT "VideoSession_clinicianId_fkey"
    FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VideoSessionParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    -- Per-tab identity for the WebRTC mesh: one user on two devices is two peers.
    "connectionId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "isAudioMuted" BOOLEAN NOT NULL DEFAULT false,
    "isVideoMuted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "VideoSessionParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VideoSessionParticipant_sessionId_connectionId_key"
    ON "VideoSessionParticipant"("sessionId", "connectionId");
CREATE INDEX "VideoSessionParticipant_sessionId_leftAt_idx" ON "VideoSessionParticipant"("sessionId", "leftAt");
CREATE INDEX "VideoSessionParticipant_userId_idx" ON "VideoSessionParticipant"("userId");
ALTER TABLE "VideoSessionParticipant" ADD CONSTRAINT "VideoSessionParticipant_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "VideoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoSessionParticipant" ADD CONSTRAINT "VideoSessionParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VideoSessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VideoSessionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VideoSessionEvent_sessionId_createdAt_idx" ON "VideoSessionEvent"("sessionId", "createdAt");
CREATE INDEX "VideoSessionEvent_type_createdAt_idx" ON "VideoSessionEvent"("type", "createdAt");
ALTER TABLE "VideoSessionEvent" ADD CONSTRAINT "VideoSessionEvent_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "VideoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoSessionEvent" ADD CONSTRAINT "VideoSessionEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Existing tables
-- ---------------------------------------------------------------------------

-- Booking.clinicianId existed as a bare string, so nothing could load the assigned
-- clinician without a second query and nothing stopped it pointing at a patient.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clinicianId_fkey"
    FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Booking_clinicianId_time_idx" ON "Booking"("clinicianId", "time");
CREATE INDEX "Booking_status_time_idx" ON "Booking"("status", "time");

CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- SlotLock: per-clinician holds.
--
-- The old unique key was (serviceId, slotTime), which meant one lock blocked a time slot
-- across the WHOLE service - so two clinicians could never be booked at the same hour.
-- It also meant that once any lock existed for a slot, inserting again after a release
-- failed forever, making an abandoned checkout permanently block that slot for everyone.
-- SlotService now reuses a released or expired row rather than inserting alongside.
ALTER TABLE "SlotLock" ADD COLUMN "clinicianId" TEXT;
DROP INDEX IF EXISTS "SlotLock_serviceId_slotTime_key";

-- NULLS NOT DISTINCT is load-bearing, not decoration.
--
-- Postgres treats NULLs as distinct in a unique index by default, so a plain
-- UNIQUE(serviceId, slotTime, clinicianId) would accept TWO identical locks whenever
-- clinicianId is NULL - which is exactly the "any clinician" case every existing row
-- uses. Replacing the old two-column key with such an index would therefore have
-- silently REMOVED the protection it was meant to preserve, and the only symptom would
-- be two patients occasionally holding the same service-wide slot.
--
-- NULLS NOT DISTINCT makes NULL compare equal to NULL, so legacy service-wide locks keep
-- the guarantee they had while per-clinician locks get their own. Requires Postgres 15+.
CREATE UNIQUE INDEX "SlotLock_serviceId_slotTime_clinicianId_key"
    ON "SlotLock"("serviceId", "slotTime", "clinicianId") NULLS NOT DISTINCT;
CREATE INDEX "SlotLock_clinicianId_slotTime_idx" ON "SlotLock"("clinicianId", "slotTime");
