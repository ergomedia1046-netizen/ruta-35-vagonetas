import type { PrismaClient } from "@prisma/client";

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
    include: { booking: { include: { payment: { include: { parts: true } } } } },
    orderBy: { assignedAt: "asc" }
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
  return bookings;
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
    const updated = await tx.vehicle.update({ where: { id: vehicleId }, data: { status } });
    await tx.auditEvent.create({ data: {
      actorId, action: "VEHICLE_STATUS_CHANGED", entityType: "Vehicle", entityId: vehicleId,
      details: { status }
    }});
    return updated;
  });
}
