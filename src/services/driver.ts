import type { PrismaClient } from "@prisma/client";
import { assertCanAssign } from "../domain/booking.js";

export async function getActiveShift(db: PrismaClient, userId: string) {
  return db.driverShift.findFirst({
    where: { userId, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
    include: { vehicle: { include: { queueEntries: { where: { active: true }, orderBy: { arrivedAt: "asc" } } } } },
    orderBy: { startsAt: "desc" }
  });
}

export async function listDriverBookings(db: PrismaClient, userId: string) {
  const shift = await getActiveShift(db, userId);
  if (!shift) throw new Error("no active shift");
  return db.assignment.findMany({
    where: { vehicleId: shift.vehicleId, booking: { status: { in: ["ASSIGNED", "CONFIRMED"] } } },
    include: { booking: { include: { payment: { include: { parts: true } } } }, trip: { include: { events: { orderBy: { createdAt: "asc" } } } } },
    orderBy: { assignedAt: "asc" }
  });
}

export async function getDriverCurrentTrip(db: PrismaClient, userId: string) {
  const shift = await getActiveShift(db, userId);
  if (!shift) throw new Error("no active shift");
  return db.trip.findFirst({
    where: { vehicleId: shift.vehicleId }, orderBy: { createdAt: "desc" },
    include: { events: { orderBy: { createdAt: "asc" } }, assignments: { include: { booking: { include: { payment: { include: { parts: true } } } } } } }
  });
}

export async function listCompatibleRequests(db: PrismaClient, userId: string) {
  const shift = await getActiveShift(db, userId);
  if (!shift) throw new Error("no active shift");
  const queue = await db.queueEntry.findFirst({ where: { vehicleId: shift.vehicleId, active: true }, orderBy: { arrivedAt: "asc" } });
  if (!queue) return [];
  const bookings = await db.booking.findMany({
    where: { status: "CONFIRMED", confirmedAt: { not: null }, direction: queue.direction, assignment: { is: null } },
    orderBy: [{ confirmedAt: "asc" }, { createdAt: "asc" }], take: 50
  });
  const assigned = await db.assignment.findMany({
    where: { vehicleId: shift.vehicleId, booking: { status: { in: ["ASSIGNED", "CONFIRMED"] } } },
    include: { booking: { select: { passengers: true, direction: true } } }
  });
  const occupiedSeats = assigned.reduce((n, item) => n + item.booking.passengers, 0);
  return bookings.filter((booking) => {
    try {
      assertCanAssign({
        direction: assigned[0]?.booking.direction ?? booking.direction,
        requestedDirection: booking.direction,
        occupiedSeats, requestedPassengers: booking.passengers, kind: booking.kind
      });
      return true;
    } catch {
      return false;
    }
  });
}

export async function updateVehicleStatus(db: PrismaClient, vehicleId: string, actorId: string,
  status: "AVAILABLE" | "QUEUED" | "ON_TRIP" | "INACTIVE") {
  return db.$transaction(async (tx) => {
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || !actor.active) throw new Error("active account required");
    if (actor.role !== "ADMIN") {
      const shift = await tx.driverShift.findFirst({
        where: { userId: actorId, vehicleId, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }
      });
      if (!shift) throw new Error("driver is not assigned to this vehicle");
    }
    await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${vehicleId} FOR UPDATE`;
    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new Error("vehicle not found");
    if (vehicle.status === status) throw new Error("vehicle status is already set");
    if (await tx.trip.findFirst({ where: { vehicleId, status: { in: ["ASSIGNED", "TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVED"] } } }))
      throw new Error("vehicle status is controlled by its active trip");
    if (actor.role !== "ADMIN") {
      const allowed = (vehicle.status === "QUEUED" && status === "ON_TRIP")
        || (vehicle.status === "ON_TRIP" && status === "AVAILABLE");
      if (!allowed) throw new Error("invalid driver vehicle transition");
    } else if (vehicle.status === "ON_TRIP" && status === "INACTIVE") {
      throw new Error("vehicle cannot be deactivated during a trip");
    }
    const updated = await tx.vehicle.update({ where: { id: vehicleId }, data: { status } });
    if (status === "ON_TRIP") {
      await tx.queueEntry.updateMany({ where: { vehicleId, active: true }, data: { active: false } });
    }
    await tx.auditEvent.create({ data: {
      actorId, action: "VEHICLE_STATUS_CHANGED", entityType: "Vehicle", entityId: vehicleId,
      details: { previousStatus: vehicle.status, status }
    }});
    return updated;
  });
}
