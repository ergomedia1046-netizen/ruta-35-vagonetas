import { Prisma, type PrismaClient, type TripStatus, type Direction } from "@prisma/client";

type Tx = Prisma.TransactionClient;
async function existingTripEvent(tx: Tx, actorId: string, tripId: string, action: string, key: string) {
  const event = await tx.tripEvent.findUnique({ where: { idempotencyKey: key } });
  if (!event) return null;
  if (event.tripId !== tripId || event.actorId !== actorId || event.action !== action) throw new Error("idempotency key reused");
  return tx.trip.findUniqueOrThrow({ where: { id: tripId }, include: { events: { orderBy: { createdAt: "asc" } }, assignments: { include: { booking: true } }, vehicle: true } });
}

export async function attachAssignmentToTrip(tx: Tx, vehicleId: string, bookingId: string, direction: Direction, actorId: string) {
  let trip = await tx.trip.findFirst({ where: { vehicleId, direction, status: "ASSIGNED" }, orderBy: { createdAt: "desc" } });
  if (!trip) {
    trip = await tx.trip.create({ data: { vehicleId, direction, status: "ASSIGNED" } });
    await tx.tripEvent.create({ data: {
      tripId: trip.id, actorId, action: "ASSIGNED", fromStatus: null, toStatus: "ASSIGNED",
      idempotencyKey: `trip:${trip.id}:assigned`, details: { source: "dispatch" }
    }});
  }
  await tx.assignment.update({ where: { bookingId }, data: { tripId: trip.id } });
  return trip;
}

async function requireDriverTrip(tx: Tx, actorId: string, tripId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  if (!actor?.active || actor.role !== "DRIVER") throw new Error("active driver account required");
  const trip = await tx.trip.findUnique({ where: { id: tripId }, include: { vehicle: true, assignments: { include: { booking: true } } } });
  if (!trip) throw new Error("trip not found");
  const shift = await tx.driverShift.findFirst({ where: { userId: actorId, vehicleId: trip.vehicleId, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } });
  if (!shift) throw new Error("driver is not assigned to this vehicle");
  return trip;
}

export async function applyTripAction(db: PrismaClient, actorId: string, tripId: string, action: string,
  idempotencyKey: string, actualPassengers?: Record<string, number>) {
  return db.$transaction(async (tx) => {
    const previous = await existingTripEvent(tx, actorId, tripId, action, idempotencyKey);
    if (previous) return previous;
    await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;
    const afterLock = await existingTripEvent(tx, actorId, tripId, action, idempotencyKey);
    if (afterLock) return afterLock;
    const trip = await requireDriverTrip(tx, actorId, tripId);
    const from = trip.status;
    let to: TripStatus;
    let details: Prisma.InputJsonObject = {};
    switch (action) {
      case "GO_TO_PICKUP": {
        if (from !== "ASSIGNED" || trip.vehicle.status !== "QUEUED") throw new Error("invalid trip transition");
        const queue = await tx.queueEntry.findFirst({ where: { vehicleId: trip.vehicleId, direction: trip.direction, active: true } });
        if (!queue) throw new Error("vehicle is not in the origin queue");
        await tx.queueEntry.updateMany({ where: { vehicleId: trip.vehicleId, active: true }, data: { active: false } });
        await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: "ON_TRIP" } });
        to = "TO_PICKUP";
        break;
      }
      case "CONFIRM_PICKUP": {
        if (from !== "TO_PICKUP" || !actualPassengers) throw new Error("invalid pickup transition");
        const assignedIds = trip.assignments.map((a) => a.bookingId).sort();
        const inputIds = Object.keys(actualPassengers).sort();
        if (assignedIds.length === 0 || assignedIds.join(",") !== inputIds.join(",")) throw new Error("pickup counts must cover assigned reservations");
        let total = 0;
        for (const a of trip.assignments) {
          const count = actualPassengers[a.bookingId];
          if (count === undefined || !Number.isInteger(count) || count < 0 || count > a.booking.passengers) throw new Error("invalid actual passenger count");
          total += count;
          await tx.assignment.update({ where: { bookingId: a.bookingId }, data: { actualPassengers: count } });
        }
        if (total > trip.vehicle.capacity || total < 1) throw new Error("at least one passenger and vehicle capacity are required");
        to = "PICKED_UP";
        details = { actualPassengers: { ...actualPassengers }, totalBoarded: total };
        break;
      }
      case "START_TRIP":
        if (from !== "PICKED_UP" || trip.assignments.some((a) => a.actualPassengers === null)) throw new Error("pickup must be confirmed first");
        to = "IN_TRANSIT";
        break;
      case "CONFIRM_ARRIVAL":
        if (from !== "IN_TRANSIT") throw new Error("invalid arrival transition");
        to = "ARRIVED";
        await tx.booking.updateMany({ where: { id: { in: trip.assignments.map((a) => a.bookingId) }, status: "ASSIGNED" }, data: { status: "COMPLETED" } });
        break;
      case "MARK_AVAILABLE":
        if (from !== "ARRIVED" || trip.vehicle.status !== "ON_TRIP") throw new Error("arrival must be confirmed first");
        to = "COMPLETED";
        await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: "AVAILABLE" } });
        break;
      default: throw new Error("unknown trip action");
    }
    await tx.trip.update({ where: { id: tripId }, data: { status: to } });
    await tx.tripEvent.create({ data: { tripId, actorId, action, fromStatus: from, toStatus: to, idempotencyKey, details } });
    await tx.auditEvent.create({ data: { actorId, action: `TRIP_${action}`, entityType: "Trip", entityId: tripId, details: { from, to, ...details } } });
    return tx.trip.findUniqueOrThrow({ where: { id: tripId }, include: { events: { orderBy: { createdAt: "asc" } }, assignments: { include: { booking: true } }, vehicle: true } });
  });
}

export async function joinDestinationQueue(db: PrismaClient, actorId: string, tripId: string, idempotencyKey: string) {
  return db.$transaction(async (tx) => {
    const previous = await tx.tripEvent.findUnique({ where: { idempotencyKey }, include: { trip: true } });
    if (previous) {
      if (previous.tripId !== tripId || previous.actorId !== actorId || previous.action !== "JOIN_DESTINATION_QUEUE") throw new Error("idempotency key reused");
      const details = previous.details as { direction?: string };
      return tx.queueEntry.findFirst({ where: { vehicleId: previous.trip.vehicleId, active: true, direction: details.direction as Direction } });
    }
    await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;
    const afterLock = await tx.tripEvent.findUnique({ where: { idempotencyKey }, include: { trip: true } });
    if (afterLock) {
      if (afterLock.tripId !== tripId || afterLock.actorId !== actorId || afterLock.action !== "JOIN_DESTINATION_QUEUE") throw new Error("idempotency key reused");
      const details = afterLock.details as { direction?: string };
      return tx.queueEntry.findFirst({ where: { vehicleId: afterLock.trip.vehicleId, active: true, direction: details.direction as Direction } });
    }
    const trip = await requireDriverTrip(tx, actorId, tripId);
    if (trip.status !== "COMPLETED" || trip.vehicle.status !== "AVAILABLE") throw new Error("vehicle must be available after arrival");
    const destinationDirection: Direction = trip.direction === "YACUIBA_TO_VILLAMONTES" ? "VILLAMONTES_TO_YACUIBA" : "YACUIBA_TO_VILLAMONTES";
    await tx.$queryRaw`SELECT "direction" FROM "QueueDirectionLock" WHERE "direction" = ${destinationDirection} FOR UPDATE`;
    const max = await tx.queueEntry.aggregate({ where: { direction: destinationDirection, active: true }, _max: { position: true } });
    const queue = await tx.queueEntry.create({ data: { vehicleId: trip.vehicleId, direction: destinationDirection, position: (max._max.position ?? 0) + 1 } });
    await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: "QUEUED" } });
    await tx.tripEvent.create({ data: { tripId, actorId, action: "JOIN_DESTINATION_QUEUE", fromStatus: "COMPLETED", toStatus: "COMPLETED", idempotencyKey,
      details: { direction: destinationDirection, position: queue.position } } });
    await tx.auditEvent.create({ data: { actorId, action: "TRIP_JOINED_DESTINATION_QUEUE", entityType: "Trip", entityId: tripId, details: { direction: destinationDirection, position: queue.position } } });
    return queue;
  });
}
