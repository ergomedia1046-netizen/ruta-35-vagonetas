CREATE TYPE "TripStatus" AS ENUM ('ASSIGNED', 'TO_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED');

CREATE TABLE "QueueDirectionLock" (
    "direction" "Direction" NOT NULL,
    CONSTRAINT "QueueDirectionLock_pkey" PRIMARY KEY ("direction")
);
INSERT INTO "QueueDirectionLock" ("direction") VALUES ('YACUIBA_TO_VILLAMONTES'), ('VILLAMONTES_TO_YACUIBA');

CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'ASSIGNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TripEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "TripStatus",
    "toStatus" "TripStatus" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Assignment" ADD COLUMN "tripId" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "actualPassengers" INTEGER;

-- Backfill only assignments whose vehicle is still queued in the same direction.
-- Historical ON_TRIP/AVAILABLE states are deliberately left untouched because their phase cannot be inferred safely.
INSERT INTO "Trip" ("id", "vehicleId", "direction", "status", "createdAt", "updatedAt")
SELECT 'trip_' || md5(a."vehicleId" || ':' || b."direction"::text), a."vehicleId", b."direction", 'ASSIGNED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Assignment" a
JOIN "Booking" b ON b."id" = a."bookingId" AND b."status" = 'ASSIGNED'
JOIN "Vehicle" v ON v."id" = a."vehicleId" AND v."status" = 'QUEUED'
WHERE EXISTS (SELECT 1 FROM "QueueEntry" q WHERE q."vehicleId" = v."id" AND q."direction" = b."direction" AND q."active" = TRUE)
GROUP BY a."vehicleId", b."direction";

UPDATE "Assignment" a SET "tripId" = t."id"
FROM "Trip" t, "Booking" b, "Vehicle" v
WHERE b."id" = a."bookingId" AND b."status" = 'ASSIGNED'
  AND v."id" = a."vehicleId" AND v."status" = 'QUEUED'
  AND t."vehicleId" = a."vehicleId" AND t."direction" = b."direction"
  AND EXISTS (SELECT 1 FROM "QueueEntry" q WHERE q."vehicleId" = v."id" AND q."direction" = b."direction" AND q."active" = TRUE);

CREATE UNIQUE INDEX "TripEvent_idempotencyKey_key" ON "TripEvent"("idempotencyKey");
CREATE INDEX "Trip_vehicleId_status_idx" ON "Trip"("vehicleId", "status");
CREATE INDEX "TripEvent_tripId_createdAt_idx" ON "TripEvent"("tripId", "createdAt");

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
