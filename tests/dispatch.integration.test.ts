import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { assignBooking } from "../src/services/dispatch.js";
import { createBooking } from "../src/services/bookings.js";
import { reportCombinedIncident, reviewIncident, restrictCombinedPayment, correctIncident } from "../src/services/incidents.js";

const suite = describe.skipIf(!process.env.DATABASE_URL);
suite("PostgreSQL dispatch concurrency", () => {
  let userId = "";
  let vehicleId = "";
  let bookingIds: string[] = [];
  let userIds: string[] = [];

  afterEach(async () => {
    if (userIds.length) {
      await prisma.paymentRestriction.deleteMany({ where: { OR: [
        { userId: { in: userIds } }, { createdById: { in: userIds } }, { revokedById: { in: userIds } }
      ] } });
      await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.incident.deleteMany({ where: { OR: [
        { bookingId: { in: bookingIds } }, { reportedById: { in: userIds } }, { reviewedById: { in: userIds } }
      ] } });
    }
    if (bookingIds.length) {
      await prisma.assignment.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.paymentPart.deleteMany({ where: { payment: { bookingId: { in: bookingIds } } } });
      await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    if (userIds.length) await prisma.driverShift.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { vehicleId }] } });
    if (vehicleId) {
      await prisma.queueEntry.deleteMany({ where: { vehicleId } });
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    }
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    bookingIds = [];
    userIds = [];
    userId = "";
    vehicleId = "";
  });
