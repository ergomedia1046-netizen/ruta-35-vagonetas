CREATE TYPE "IncidentStatus" AS ENUM ('OPEN','REVIEWED','CORRECTED');
CREATE TYPE "IncidentDecision" AS ENUM ('SUBSTANTIATED','NOT_SUBSTANTIATED');
ALTER TABLE "User" ADD COLUMN "combinedPaymentRestricted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Incident" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "reportedById" TEXT NOT NULL,
  "amountBs" INTEGER NOT NULL,
  "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" TEXT,
  "decision" "IncidentDecision",
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "correctedAt" TIMESTAMP(3),
  "correctionNotes" TEXT,
  CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Incident_status_reportedAt_idx" ON "Incident"("status","reportedAt");
CREATE INDEX "Incident_bookingId_reportedAt_idx" ON "Incident"("bookingId","reportedAt");

CREATE TABLE "PaymentRestriction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "revokedById" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "PaymentRestriction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentRestriction_incidentId_key" ON "PaymentRestriction"("incidentId");
CREATE INDEX "PaymentRestriction_userId_active_idx" ON "PaymentRestriction"("userId","active");

ALTER TABLE "Incident" ADD CONSTRAINT "Incident_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRestriction" ADD CONSTRAINT "PaymentRestriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRestriction" ADD CONSTRAINT "PaymentRestriction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRestriction" ADD CONSTRAINT "PaymentRestriction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRestriction" ADD CONSTRAINT "PaymentRestriction_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
