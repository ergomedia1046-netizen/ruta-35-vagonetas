import { Prisma, type PrismaClient } from "@prisma/client";
import { assertCanAssign } from "../domain/booking.js";
import { attachAssignmentToTrip } from "./trips.js";

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
    const earlier = await tx.booking.findMany({
      where: { direction: booking.direction, status: "CONFIRMED", confirmedAt: { not: null }, assignment: { is: null } },
      orderBy: [{ confirmedAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, passengers: true, kind: true, direction: true }
    });
    for (const candidate of earlier) {
      try {
        assertCanAssign({
          direction: current[0]?.booking.direction ?? candidate.direction,
          requestedDirection: candidate.direction,
          occupiedSeats,
          requestedPassengers: candidate.passengers,
          kind: candidate.kind
        });
        if (candidate.id !== bookingId) throw new Error("earlier compatible booking has priority");
        break;
      } catch (error) {
        if (error instanceof Error && error.message === "earlier compatible booking has priority") throw error;
      }
    }
    const queue = await tx.queueEntry.findMany({
      where: { direction: booking.direction, active: true },
      orderBy: [{ arrivedAt: "asc" }, { position: "asc" }],
      select: { vehicleId: true }
    });
    if (queue.length > 0) {
      let firstFeasibleVehicle: string | null = null;
      for (const entry of queue) {
        const entries = await tx.assignment.findMany({
          where: { vehicleId: entry.vehicleId, booking: { status: { in: ["ASSIGNED", "CONFIRMED"] } } },
          include: { booking: { select: { passengers: true, kind: true, direction: true } } }
        });
        const seats = entries.reduce((n, a) => n + a.booking.passengers, 0);
        try {
          assertCanAssign({
            direction: entries[0]?.booking.direction ?? booking.direction,
            requestedDirection: booking.direction, occupiedSeats: seats,
            requestedPassengers: booking.passengers, kind: booking.kind
          });
          firstFeasibleVehicle = entry.vehicleId;
          break;
        } catch {
          continue;
        }
      }
      if (firstFeasibleVehicle && firstFeasibleVehicle !== vehicleId)
        throw new Error("vehicle queue priority");
    }
    const assignment = await tx.assignment.create({ data: { bookingId, vehicleId } });
    await attachAssignmentToTrip(tx, vehicleId, bookingId, booking.direction, actorId);
    await tx.booking.update({ where: { id: bookingId }, data: { status: "ASSIGNED" } });
    await tx.auditEvent.create({ data: {
      actorId, action: "BOOKING_ASSIGNED", entityType: "Booking", entityId: bookingId,
      details: { vehicleId, occupiedSeatsAfter: occupiedSeats + booking.passengers }
    }});
    return assignment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
