CREATE TABLE "DriverPresence" (
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverPresence_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "DriverPresence"
ADD CONSTRAINT "DriverPresence_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
