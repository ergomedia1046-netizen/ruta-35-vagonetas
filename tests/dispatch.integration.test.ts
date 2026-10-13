import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { assignBooking } from "../src/services/dispatch.js";
import { createBooking } from "../src/services/bookings.js";
import { recordCashReceived, verifyQrManually } from "../src/services/payments.js";
import { correctIncident, reportCombinedIncident, restrictCombinedPayment, reviewIncident } from "../src/services/incidents.js";

const suite = describe.skipIf(!process.env.DATABASE_URL);
suite("PostgreSQL dispatch and incident integration", () => {
  let userId = "";
  let vehicleId = "";
  let bookingIds: string[] = [];
  let userIds: string[] = [];

  afterEach(async () => {
    const trips = vehicleId ? await prisma.trip.findMany({ where: { vehicleId }, select: { id: true } }) : [];
    const tripIds = trips.map(trip => trip.id);
    if (tripIds.length) await prisma.tripEvent.deleteMany({ where: { tripId: { in: tripIds } } });
    if (bookingIds.length) await prisma.assignment.deleteMany({ where: { bookingId: { in: bookingIds } } });
    if (vehicleId) await prisma.assignment.deleteMany({ where: { vehicleId } });
    if (tripIds.length) await prisma.trip.deleteMany({ where: { id: { in: tripIds } } });
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
      await prisma.auditEvent.deleteMany({ where: { entityId: { in: bookingIds } } });
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

  async function setup() {
    const user = await prisma.user.create({ data: {
      email: `admin-${randomUUID()}@example.test`, passwordHash: "test", role: "ADMIN"
    }});
    userId = user.id;
    userIds.push(user.id);
    const vehicle = await prisma.vehicle.create({
      data: { plate: `T-${randomUUID().slice(0, 8)}`, capacity: 7 }
    });
    vehicleId = vehicle.id;
  }

  async function seedBooking(passengers: number, suffix: string, confirmedAt = new Date()) {
    const booking = await prisma.booking.create({ data: {
      direction: "YACUIBA_TO_VILLAMONTES", origin: "Yacuiba", destination: "Villamontes",
      pickupPoint: "Terminal", passengers, kind: "ORDINARY", totalBs: passengers * 35,
      status: "CONFIRMED", paymentMethod: "CASH", confirmedAt,
      idempotencyKey: `integration-${suffix}-${randomUUID()}`
    }});
    bookingIds.push(booking.id);
    return booking;
  }

  it("allows five plus two passengers but refuses an extra seat", async () => {
    await setup();
    const first = await seedBooking(5, "five");
    const second = await seedBooking(2, "two", new Date(Date.now() + 1));
    const third = await seedBooking(1, "one", new Date(Date.now() + 2));
    await assignBooking(prisma, first.id, vehicleId, userId);
    await assignBooking(prisma, second.id, vehicleId, userId);
    await expect(assignBooking(prisma, third.id, vehicleId, userId)).rejects.toThrow();
  });

  it("serializes combined cash and QR receipts and never duplicates cash audit records", async () => {
    await setup();
    const booking = await seedBooking(1, "combined-receipts");
    await prisma.booking.update({ where: { id: booking.id }, data: { paymentMethod: "COMBINED" } });
    const payment = await prisma.payment.create({ data: {
      bookingId: booking.id, method: "COMBINED", totalBs: 35,
      parts: { create: [{ kind: "CASH", amountBs: 15 }, { kind: "QR", amountBs: 20 }] }
    }, include: { parts: true } });
    const cash = payment.parts.find(part => part.kind === "CASH")!;
    const qr = payment.parts.find(part => part.kind === "QR")!;
    await Promise.all([
      recordCashReceived(prisma, payment.id, userId),
      recordCashReceived(prisma, payment.id, userId),
      verifyQrManually(prisma, payment.id, qr.id, userId, true)
    ]);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ status: "PAID", totalBs: 35 });
    expect(await prisma.auditEvent.count({ where: { entityId: cash.id, action: "CASH_RECEIVED" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { entityId: qr.id, action: "QR_MANUALLY_VERIFIED" } })).toBe(1);
    await expect(verifyQrManually(prisma, payment.id, qr.id, userId, false)).rejects.toThrow();
    const outsider = await prisma.user.create({ data: { email: `outsider-${randomUUID()}@example.test`, passwordHash: "test", role: "DRIVER" } });
    userIds.push(outsider.id);
    await expect(recordCashReceived(prisma, payment.id, outsider.id)).rejects.toThrow("driver is not assigned");
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: "CONFIRMED", totalBs: 35 });
  });

  it("allows only one concurrent operation to claim a request", async () => {
    await setup();
    const booking = await seedBooking(2, "claim");
    const results = await Promise.allSettled([
      assignBooking(prisma, booking.id, vehicleId, userId),
      assignBooking(prisma, booking.id, vehicleId, userId)
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.assignment.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it("does not overbook when two four-seat requests race", async () => {
    await setup();
    const first = await seedBooking(4, "first", new Date(Date.now() - 1_000));
    const second = await seedBooking(4, "second", new Date());
    const results = await Promise.allSettled([
      assignBooking(prisma, first.id, vehicleId, userId),
      assignBooking(prisma, second.id, vehicleId, userId)
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const assigned = await prisma.assignment.findMany({ where: { vehicleId }, include: { booking: true } });
    expect(assigned.reduce((sum, item) => sum + item.booking.passengers, 0)).toBeLessThanOrEqual(7);
    expect(assigned[0]?.booking.id).toBe(first.id);
  });

  it("restricts only combined payment after review and reverses it on correction", async () => {
    await setup();
    const passenger = await prisma.user.create({ data: {
      email: `passenger-${randomUUID()}@example.test`, passwordHash: "test", role: "PASSENGER"
    }});
    const driver = await prisma.user.create({ data: {
      email: `driver-${randomUUID()}@example.test`, passwordHash: "test", role: "DRIVER"
    }});
    userIds.push(passenger.id, driver.id);
    await prisma.driverShift.create({ data: { userId: driver.id, vehicleId, startsAt: new Date() } });
    const booking = await prisma.booking.create({ data: {
      passengerId: passenger.id, direction: "YACUIBA_TO_VILLAMONTES", origin: "Yacuiba",
      destination: "Villamontes", pickupPoint: "Terminal", passengers: 1, kind: "ORDINARY",
      totalBs: 35, status: "ASSIGNED", paymentMethod: "COMBINED", confirmedAt: new Date(),
      idempotencyKey: `incident-${randomUUID()}`
    }});
    bookingIds.push(booking.id);
    await prisma.assignment.create({ data: { bookingId: booking.id, vehicleId } });
    await prisma.payment.create({ data: {
      bookingId: booking.id, method: "COMBINED", totalBs: 35,
      parts: { create: [{ kind: "QR", amountBs: 30 }, { kind: "CASH", amountBs: 5 }] }
    }});
    const incident = await reportCombinedIncident(prisma, booking.id, driver.id);
    expect(incident.amountBs).toBe(35);
    await reviewIncident(prisma, incident.id, userId, "SUBSTANTIATED", "Reviewed against the payment ledger");
    await restrictCombinedPayment(prisma, incident.id, userId, "Approved after review");

    const base = {
      passengerId: passenger.id, direction: "YACUIBA_TO_VILLAMONTES" as const,
      origin: "Yacuiba", destination: "Villamontes", pickupPoint: "Terminal",
      passengers: 1, kind: "ORDINARY" as const
    };
    await expect(createBooking(prisma, {
      ...base, paymentMethod: "COMBINED", qrBs: 30, cashBs: 5, idempotencyKey: `blocked-${randomUUID()}`
    })).rejects.toThrow();
    const cash = await createBooking(prisma, {
      ...base, paymentMethod: "CASH", qrBs: 0, cashBs: 35, idempotencyKey: `cash-${randomUUID()}`
    });
    bookingIds.push(cash.id);
    const qr = await createBooking(prisma, {
      ...base, paymentMethod: "QR", qrBs: 35, cashBs: 0, idempotencyKey: `qr-${randomUUID()}`
    });
    bookingIds.push(qr.id);

    await correctIncident(prisma, incident.id, userId, "Reversed after administrative re-check");
    const combined = await createBooking(prisma, {
      ...base, paymentMethod: "COMBINED", qrBs: 30, cashBs: 5, idempotencyKey: `restored-${randomUUID()}`
    });
    bookingIds.push(combined.id);
  });
});
