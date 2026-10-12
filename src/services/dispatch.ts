import { Prisma, type PrismaClient } from "@prisma/client";
import { assertCanAssign } from "../domain/booking.js";

type Db = PrismaClient;
export async function assignBooking(db: Db, bookingId: string, vehicleId: string, actorId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${vehicleId} FOR UPDATE`;
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || !actor.active) throw new Error("active account required");
    if (actor.role !== "ADMIN") {
      const shift = await tx.driverShift.findFirst({
        where: { userId: actorId, vehicleId, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }
      });
      if (!shift) throw new Error("driver is not assigned to this vehicle");
    }
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { assignment: true } });
    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
    if (!booking || !vehicle) throw new Error("booking or vehicle not found");
    if (booking.status !== "CONFIRMED" || !booking.confirmedAt) throw new Error("booking is not confirmed");
    if (booking.assignment) throw new Error("booking already assigned");
    const current = await tx.assignment.findMany({
      where: { vehicleId, booking: { status: { in: ["ASSIGNED", "CONFIRMED"] } } },
      include: { booking: { select: { passengers: true, kind: true, direction: true } } }
    });
    const occupiedSeats = current.reduce((n, a) => n + a.booking.passengers, 0);
    if (vehicle.capacity !== 7) throw new Error("vehicle capacity must be seven");
    assertCanAssign({
      direction: current[0]?.booking.direction ?? booking.direction,
      requestedDirection: booking.direction,
      occupiedSeats,
      requestedPassengers: booking.passengers,
      kind: booking.kind
    });
    const assignment = await tx.assignment.create({ data: { bookingId, vehicleId } });
    await tx.booking.update({ where: { id: bookingId }, data: { status: "ASSIGNED" } });
    await tx.auditEvent.create({ data: {
      actorId, action: "BOOKING_ASSIGNED", entityType: "Booking", entityId: bookingId,
      details: { vehicleId, occupiedSeatsAfter: occupiedSeats + booking.passengers }
    }});
    return assignment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
