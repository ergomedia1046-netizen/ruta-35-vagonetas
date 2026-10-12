CREATE TYPE "Role" AS ENUM ('PASSENGER','DRIVER','ADMIN');
CREATE TYPE "Direction" AS ENUM ('YACUIBA_TO_VILLAMONTES','VILLAMONTES_TO_YACUIBA');
CREATE TYPE "BookingKind" AS ENUM ('ORDINARY','EXPRESS');
CREATE TYPE "BookingStatus" AS ENUM ('PENDING','CONFIRMED','ASSIGNED','CANCELLED','COMPLETED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH','QR','COMBINED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','PARTIAL','PAID','REVIEW_REQUIRED','REJECTED');
CREATE TYPE "PartKind" AS ENUM ('CASH','QR');
CREATE TYPE "PartStatus" AS ENUM ('PENDING','RECEIVED','VERIFIED','REJECTED');
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE','QUEUED','ON_TRIP','INACTIVE');

CREATE TABLE "User" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, "role" "Role" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Vehicle" (
  "id" TEXT NOT NULL, "plate" TEXT NOT NULL, "capacity" INTEGER NOT NULL DEFAULT 7,
  "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE', CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");
CREATE TABLE "DriverShift" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "vehicleId" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3), CONSTRAINT "DriverShift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DriverShift_userId_endsAt_idx" ON "DriverShift"("userId","endsAt");
CREATE TABLE "QueueEntry" (
  "id" TEXT NOT NULL, "vehicleId" TEXT NOT NULL, "direction" "Direction" NOT NULL,
  "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "position" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QueueEntry_direction_active_arrivedAt_position_idx" ON "QueueEntry"("direction","active","arrivedAt","position");
CREATE TABLE "Booking" (
  "id" TEXT NOT NULL, "passengerId" TEXT, "direction" "Direction" NOT NULL, "origin" TEXT NOT NULL,
  "destination" TEXT NOT NULL, "pickupPoint" TEXT NOT NULL, "pickupReference" TEXT, "passengers" INTEGER NOT NULL,
  "kind" "BookingKind" NOT NULL DEFAULT 'ORDINARY', "totalBs" INTEGER NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING', "paymentMethod" "PaymentMethod" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "confirmedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL, CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");
CREATE INDEX "Booking_direction_status_confirmedAt_idx" ON "Booking"("direction","status","confirmedAt");
CREATE TABLE "Assignment" (
  "id" TEXT NOT NULL, "bookingId" TEXT NOT NULL, "vehicleId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Assignment_bookingId_key" ON "Assignment"("bookingId");
CREATE TABLE "Payment" (
  "id" TEXT NOT NULL, "bookingId" TEXT NOT NULL, "method" "PaymentMethod" NOT NULL,
  "totalBs" INTEGER NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "Payment"("bookingId");
CREATE TABLE "PaymentPart" (
  "id" TEXT NOT NULL, "paymentId" TEXT NOT NULL, "kind" "PartKind" NOT NULL, "amountBs" INTEGER NOT NULL,
  "status" "PartStatus" NOT NULL DEFAULT 'PENDING', "verifiedBy" TEXT, "verifiedAt" TIMESTAMP(3),
  CONSTRAINT "PaymentPart_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentPart_paymentId_kind_idx" ON "PaymentPart"("paymentId","kind");
CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL, "actorId" TEXT, "action" TEXT NOT NULL, "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL, "details" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType","entityId","createdAt");
CREATE TABLE "Session" (
  "id" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "DriverShift" ADD CONSTRAINT "DriverShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverShift" ADD CONSTRAINT "DriverShift_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentPart" ADD CONSTRAINT "PaymentPart_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
