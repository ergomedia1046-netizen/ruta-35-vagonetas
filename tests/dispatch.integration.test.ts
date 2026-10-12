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
    if (bookingIds.length) {
      await prisma.auditEvent.deleteMany({ where: { entityId: { in: bookingIds } } });
      await prisma.assignment.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    if (vehicleId) {
      await prisma.queueEntry.deleteMany({ where: { vehicleId } });
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    }
    if (userId) {
      await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    bookingIds = [];
    vehicleId = "";
    userId = "";
  });

  async function seedBooking(passengers: number, suffix: string, confirmedAt = new Date()) {
    const booking = await prisma.booking.create({ data: {
      direction: "YACUIBA_TO_VILLAMONTES",
      origin: "Yacuiba", destination: "Villamontes", pickupPoint: "Terminal",
      passengers, kind: "ORDINARY", totalBs: passengers * 35, status: "CONFIRMED",
      paymentMethod: "CASH", confirmedAt, idempotencyKey: `integration-${suffix}-${crypto.randomUUID()}`
    }});
    bookingIds.push(booking.id);
    return booking;
  }

  async function setup() {
    const user = await prisma.user.create({ data: {
      email: `integration-${crypto.randomUUID()}@example.test`,
      passwordHash: "not-used-in-this-service-test", role: "ADMIN"
    }});
    userId = user.id;\n    userIds.push(user.id);
    const vehicle = await prisma.vehicle.create({ data: { plate: `T-${crypto.randomUUID().slice(0, 8)}`, capacity: 7 } });
    vehicleId = vehicle.id;
  }

  it("allows 5+2 passengers but refuses any additional seat", async () => {
    await setup();
    const first = await seedBooking(5, "five");
    const second = await seedBooking(2, "two", new Date(Date.now() + 1));
    const third = await seedBooking(1, "one", new Date(Date.now() + 2));
    await assignBooking(prisma, first.id, vehicleId, userId);
    await assignBooking(prisma, second.id, vehicleId, userId);
    await expect(assignBooking(prisma, third.id, vehicleId, userId)).rejects.toThrow();
  });

  it("lets only one concurrent driver operation claim the same request", async () => {
    await setup();
    const booking = await seedBooking(2, "claim");
    const outcomes = await Promise.allSettled([
      assignBooking(prisma, booking.id, vehicleId, userId),
      assignBooking(prisma, booking.id, vehicleId, userId)
    ]);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.assignment.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it("does not overbook when two four-seat requests race", async () => {
    await setup();
    const first = await seedBooking(4, "first", new Date(Date.now() - 1_000));
    const second = await seedBooking(4, "second", new Date());
    const outcomes = await Promise.allSettled([
      assignBooking(prisma, first.id, vehicleId, userId),
      assignBooking(prisma, second.id, vehicleId, userId)
    ]);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const assigned = await prisma.assignment.findMany({ where: { vehicleId }, include: { booking: true } });
    expect(assigned.reduce((sum, item) => sum + item.booking.passengers, 0)).toBeLessThanOrEqual(7);
    expect(assigned[0]?.booking.id).toBe(first.id);
  });
});
