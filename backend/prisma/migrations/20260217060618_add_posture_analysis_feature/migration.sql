-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'CLINICIAN', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OtpType" AS ENUM ('LOGIN', 'SIGNUP', 'RESET');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "role" "UserRole" NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profileImage" TEXT,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "notificationPreference" JSONB,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "salePrice" DOUBLE PRECISION,
    "discount" DOUBLE PRECISION,
    "paymentType" "PaymentType" NOT NULL DEFAULT 'FULL',
    "advancePercent" DOUBLE PRECISION,
    "advanceAmount" DOUBLE PRECISION,
    "duration" TEXT,
    "serviceType" TEXT,
    "features" JSONB,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryMode" TEXT,
    "sessionCount" INTEGER,
    "includedScreeningCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cartValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Otp" (
    "id" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "phoneNo" TEXT NOT NULL,
    "type" "OtpType" NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Otp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL,
    "remainingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "clinicianId" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL,
    "remainingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "time" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "totalScreeningCount" INTEGER NOT NULL DEFAULT 0,
    "usedScreeningCount" INTEGER NOT NULL DEFAULT 0,
    "remainingScreeningCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "reportUrl" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startAt" TIMESTAMP(3) NOT NULL,
    "expirationAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostureAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "analysisDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fhdPixels" DOUBLE PRECISION NOT NULL,
    "cervicalAngle" DOUBLE PRECISION NOT NULL,
    "headLateralFlexion" DOUBLE PRECISION NOT NULL,
    "headRotation" DOUBLE PRECISION NOT NULL,
    "thoracicKyphosisAngle" DOUBLE PRECISION NOT NULL,
    "lumbarLordosisAngle" DOUBLE PRECISION NOT NULL,
    "trunkLateralShift" DOUBLE PRECISION NOT NULL,
    "trunkAngle" DOUBLE PRECISION NOT NULL,
    "leftShoulderAngle" DOUBLE PRECISION NOT NULL,
    "rightShoulderAngle" DOUBLE PRECISION NOT NULL,
    "shoulderHeightDiff" DOUBLE PRECISION NOT NULL,
    "roundedShoulderAngle" DOUBLE PRECISION NOT NULL,
    "leftElbowAngle" DOUBLE PRECISION NOT NULL,
    "rightElbowAngle" DOUBLE PRECISION NOT NULL,
    "leftHipAngle" DOUBLE PRECISION NOT NULL,
    "rightHipAngle" DOUBLE PRECISION NOT NULL,
    "pelvicObliquity" DOUBLE PRECISION NOT NULL,
    "pelvicTiltAngle" DOUBLE PRECISION NOT NULL,
    "hipHeightDiff" DOUBLE PRECISION NOT NULL,
    "leftKneeAngle" DOUBLE PRECISION NOT NULL,
    "rightKneeAngle" DOUBLE PRECISION NOT NULL,
    "kneeVarusValgus" DOUBLE PRECISION NOT NULL,
    "kneeFlexionNeutral" DOUBLE PRECISION NOT NULL,
    "qAngleLeft" DOUBLE PRECISION NOT NULL,
    "qAngleRight" DOUBLE PRECISION NOT NULL,
    "footProgressionAngle" DOUBLE PRECISION NOT NULL,
    "pronationSupinationLeft" DOUBLE PRECISION NOT NULL,
    "pronationSupinationRight" DOUBLE PRECISION NOT NULL,
    "shoulderWidth" DOUBLE PRECISION NOT NULL,
    "hipWidth" DOUBLE PRECISION NOT NULL,
    "torsoLength" DOUBLE PRECISION NOT NULL,
    "leftArmLength" DOUBLE PRECISION NOT NULL,
    "rightArmLength" DOUBLE PRECISION NOT NULL,
    "leftLegLength" DOUBLE PRECISION NOT NULL,
    "rightLegLength" DOUBLE PRECISION NOT NULL,
    "landmarksData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PostureAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_status_idx" ON "Category"("status");

-- CreateIndex
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE INDEX "Service_categoryId_idx" ON "Service"("categoryId");

-- CreateIndex
CREATE INDEX "Service_slug_idx" ON "Service"("slug");

-- CreateIndex
CREATE INDEX "Service_paymentType_idx" ON "Service"("paymentType");

-- CreateIndex
CREATE INDEX "Cart_userId_idx" ON "Cart"("userId");

-- CreateIndex
CREATE INDEX "Otp_phoneNo_idx" ON "Otp"("phoneNo");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_transactionId_idx" ON "Payment"("transactionId");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "Booking_serviceId_idx" ON "Booking"("serviceId");

-- CreateIndex
CREATE INDEX "Booking_paymentId_idx" ON "Booking"("paymentId");

-- CreateIndex
CREATE INDEX "Report_bookingId_idx" ON "Report"("bookingId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_serviceId_idx" ON "Subscription"("serviceId");

-- CreateIndex
CREATE INDEX "PostureAnalysis_userId_idx" ON "PostureAnalysis"("userId");

-- CreateIndex
CREATE INDEX "PostureAnalysis_bookingId_idx" ON "PostureAnalysis"("bookingId");

-- CreateIndex
CREATE INDEX "PostureAnalysis_analysisDate_idx" ON "PostureAnalysis"("analysisDate");

-- CreateIndex
CREATE INDEX "PostureAnalysis_status_idx" ON "PostureAnalysis"("status");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostureAnalysis" ADD CONSTRAINT "PostureAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostureAnalysis" ADD CONSTRAINT "PostureAnalysis_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
