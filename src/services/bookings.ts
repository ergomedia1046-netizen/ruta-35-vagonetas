import { Prisma, type PrismaClient } from "@prisma/client";
import { quoteFare, validatePaymentParts, type BookingKind, type Direction, type PaymentMethod } from "../domain/booking.js";

export async function createBooking(db: PrismaClient, args: {
  passengerId: string; direction: Direction; origin: string; destination: string;
  pickupPoint: string; pickupReference?: string; passengers: number; kind: BookingKind;
  paymentMethod: PaymentMethod; qrBs: number; cashBs: number; idempotencyKey: string;
}) {
  if (args.origin.trim().toLowerCase() === args.destination.trim().toLowerCase())
    throw new Error("origin and destination must differ");
  const fare = quoteFare(args.passengers, args.kind);
  validatePaymentParts(args.paymentMethod, fare, args.qrBs, args.cashBs);
  const expected = args.direction === "YACUIBA_TO_VILLAMONTES"
    ? ["yacuiba", "villamontes"] : ["villamontes", "yacuiba"];
  if (args.origin.trim().toLowerCase() !== expected[0] || args.destination.trim().toLowerCase() !== expected[1])
    throw new Error("origin and destination do not match direction");

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.booking.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      if (existing) {
        if (existing.passengerId !== args.passengerId) throw new Error("idempotency key already used");
        return existing;
      }
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${args.passengerId} FOR UPDATE`;
      const passenger = await tx.user.findUnique({ where: { id: args.passengerId }, select: { active: true, combinedPaymentRestricted: true } });
      if (!passenger?.active) throw new Error("passenger account is unavailable");
      if (args.paymentMethod === "COMBINED" && passenger.combinedPaymentRestricted)
        throw new Error("combined payment is restricted for this account");
      const booking = await tx.booking.create({ data: {
        passengerId: args.passengerId, direction: args.direction,
        origin: args.origin.trim(), destination: args.destination.trim(),
        pickupPoint: args.pickupPoint.trim(), pickupReference: args.pickupReference?.trim(),
        passengers: args.passengers, kind: args.kind, totalBs: fare,
        paymentMethod: args.paymentMethod, idempotencyKey: args.idempotencyKey
      }});
      await tx.payment.create({ data: {
        bookingId: booking.id, method: args.paymentMethod, totalBs: fare,
        parts: { create: [
          ...(args.qrBs > 0 ? [{ kind: "QR" as const, amountBs: args.qrBs }] : []),
          ...(args.cashBs > 0 ? [{ kind: "CASH" as const, amountBs: args.cashBs }] : [])
        ]}
      }});
      await tx.auditEvent.create({ data: {
        actorId: args.passengerId, action: "BOOKING_CREATED", entityType: "Booking",
        entityId: booking.id, details: { totalBs: fare, passengers: args.passengers, method: args.paymentMethod }
      }});
      return booking;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.booking.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      if (existing?.passengerId === args.passengerId) return existing;
    }
    throw error;
  }
}

export async function listPassengerBookings(db: PrismaClient, passengerId: string) {
  return db.booking.findMany({
    where: { passengerId },
    include: {
      assignment: {
        include: {
          vehicle: { select: { plate: true } },
          trip: { include: { events: { where: { action: { not: "JOIN_DESTINATION_QUEUE" } }, orderBy: { createdAt: "asc" } } } }
        }
      },
      payment: { include: { parts: true } }
    },
    orderBy: { createdAt: "desc" }, take: 100
  });
}

export async function cancelPendingBooking(db: PrismaClient, bookingId: string, passengerId: string) {
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.passengerId !== passengerId) throw new Error("booking not found");
    if (booking.status !== "PENDING") throw new Error("booking can no longer be cancelled");
    const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
    await tx.auditEvent.create({ data: {
      actorId: passengerId, action: "BOOKING_CANCELLED", entityType: "Booking",
      entityId: bookingId, details: { previousStatus: booking.status }
    }});
    return updated;
  });
}
