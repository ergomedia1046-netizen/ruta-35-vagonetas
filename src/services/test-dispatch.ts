import { Prisma, type PrismaClient } from "@prisma/client";
import { assertCanAssign } from "../domain/booking.js";

export const PRESENCE_TTL_MS = 2 * 60 * 1000;
export const manualTestDispatchEnabled = () => process.env.RUTA35_TEST_MODE === "true"
  && process.env.RUTA35_TEST_TARGET === "ruta35-android-pruebas"
  && process.env.RUTA35_TEST_MANUAL_DISPATCH === "true";

export async function heartbeatDriver(db: PrismaClient, userId: string) {
  const now = new Date();
  const shift = await db.driverShift.findFirst({
    where: { userId, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    select: { id: true }
  });
  if (!shift) throw new Error("active driver shift required");
  return db.driverPresence.upsert({ where: { userId }, create: { userId, lastSeenAt: now }, update: { lastSeenAt: now } });
}

export async function listManualDispatchCandidates(db: PrismaClient, bookingId: string) {
  const now = new Date();
  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true, direction: true, passengers: true, kind: true, totalBs: true, status: true, assignment: { select: { id: true } } } });
  if (!booking) throw new Error("booking not found");
  if (booking.status !== "CONFIRMED" || booking.assignment) throw new Error("booking must be confirmed and unassigned");
  if (booking.kind === "EXPRESS" && (booking.passengers !== 7 || booking.totalBs !== 245)) throw new Error("invalid express fare or seats");
  const vehicles = await db.vehicle.findMany({
    where: { status: "QUEUED", shifts: { some: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], user: { active: true, role: "DRIVER" } } }, queueEntries: { some: { active: true, direction: booking.direction } } },
    select: { id: true, plate: true, capacity: true, status: true,
      shifts: { where: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], user: { active: true, role: "DRIVER" } }, select: { startsAt: true, user: { select: { id: true, email: true, driverPresence: { select: { lastSeenAt: true } } } } }, orderBy: { startsAt: "desc" }, take: 1 },
      queueEntries: { where: { active: true, direction: booking.direction }, select: { direction: true, position: true, arrivedAt: true }, take: 1 },
      assignments: { where: { booking: { status: { in: ["ASSIGNED", "CONFIRMED"] } } }, select: { booking: { select: { passengers: true, direction: true } } } }
    }
  });
  const queue = await db.queueEntry.findMany({ where: { active: true, direction: booking.direction }, orderBy: [{ arrivedAt: "asc" }, { position: "asc" }], select: { vehicleId: true } });
  let firstFeasibleVehicle: string | null = null;
  for (const entry of queue) {
    const candidate = vehicles.find(v => v.id === entry.vehicleId);
    if (!candidate || candidate.status !== "QUEUED" || candidate.capacity !== 7 || !candidate.shifts.length) continue;
    const occupied = candidate.assignments.reduce((n, a) => n + a.booking.passengers, 0);
    try {
      assertCanAssign({ direction: candidate.assignments[0]?.booking.direction ?? booking.direction, requestedDirection: booking.direction,
        occupiedSeats: occupied, requestedPassengers: booking.passengers, kind: booking.kind });
      firstFeasibleVehicle = candidate.id;
      break;
    } catch { /* the next vehicle in queue may be feasible */ }
  }
  const evaluated = vehicles.map((v) => {
    const occupiedSeats = v.assignments.reduce((n, a) => n + a.booking.passengers, 0);
    let compatible = v.capacity === 7 && v.status === "QUEUED";
    try {
      assertCanAssign({ direction: v.assignments[0]?.booking.direction ?? booking.direction, requestedDirection: booking.direction,
        occupiedSeats, requestedPassengers: booking.passengers, kind: booking.kind });
    } catch { compatible = false; }
    const shift = v.shifts[0];
    const lastSeenAt = shift?.user.driverPresence?.lastSeenAt ?? null;
    return { id: v.id, plate: v.plate, capacity: v.capacity, status: v.status, occupiedSeats,
      freeSeats: Math.max(0, v.capacity - occupiedSeats), direction: v.queueEntries[0]?.direction ?? null,
      queuePosition: v.queueEntries[0]?.position ?? null, queueOrder: queue.findIndex(q => q.vehicleId === v.id) + 1 || null,
      driverId: shift?.user.id ?? null, driverEmail: shift?.user.email ?? null, lastSeenAt,
      connectedRecently: !!lastSeenAt && now.getTime() - lastSeenAt.getTime() >= 0 && now.getTime() - lastSeenAt.getTime() <= PRESENCE_TTL_MS,
      compatible, available: compatible && !!shift, firstFeasibleVehicle: null as string | null };
  });
  return { bookingId, candidates: evaluated.map(v => ({ ...v, firstFeasibleVehicle })) };
}

export async function assignBookingManuallyForTest(db: PrismaClient, args: { bookingId: string; vehicleId: string; adminId: string; justification: string }) {
  if (!manualTestDispatchEnabled()) throw new Error("test manual dispatch is disabled");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${args.bookingId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${args.vehicleId} FOR UPDATE`;
    const now = new Date();
    const [actor, booking, vehicle, shift, queue] = await Promise.all([
      tx.user.findUnique({ where: { id: args.adminId }, select: { id: true, role: true, active: true } }),
      tx.booking.findUnique({ where: { id: args.bookingId }, include: { assignment: true } }),
      tx.vehicle.findUnique({ where: { id: args.vehicleId } }),
      tx.driverShift.findFirst({ where: { vehicleId: args.vehicleId, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], user: { active: true, role: "DRIVER" } }, include: { user: { select: { id: true } } }, orderBy: { startsAt: "desc" } }),
      tx.queueEntry.findFirst({ where: { vehicleId: args.vehicleId, active: true }, orderBy: [{ arrivedAt: "asc" }, { position: "asc" }] })
    ]);
    if (!actor || !actor.active || actor.role !== "ADMIN") throw new Error("active administrator required");
    if (!booking || !vehicle || !shift || !queue) throw new Error("booking, active driver shift, queued vehicle and direction entry required");
    if (booking.status !== "CONFIRMED" || !booking.confirmedAt || booking.assignment) throw new Error("booking must be confirmed and unassigned");
    if (vehicle.status !== "QUEUED" || vehicle.capacity !== 7 || queue.direction !== booking.direction) throw new Error("vehicle is not eligible for this direction and shift");
    if (booking.kind === "EXPRESS" && (booking.passengers !== 7 || booking.totalBs !== 245)) throw new Error("invalid express fare or seats");
    const current = await tx.assignment.findMany({ where: { vehicleId: vehicle.id, booking: { status: { in: ["ASSIGNED", "CONFIRMED"] } } }, include: { booking: { select: { passengers: true, direction: true } } } });
    const occupiedSeats = current.reduce((sum, item) => sum + item.booking.passengers, 0);
    assertCanAssign({ direction: current[0]?.booking.direction ?? booking.direction, requestedDirection: booking.direction, occupiedSeats, requestedPassengers: booking.passengers, kind: booking.kind });
    const earlierBookings = await tx.booking.findMany({
      where: { direction: booking.direction, status: "CONFIRMED", confirmedAt: { not: null }, assignment: { is: null },
        OR: [{ confirmedAt: { lt: booking.confirmedAt } }, { confirmedAt: booking.confirmedAt, createdAt: { lt: booking.createdAt } }] },
      orderBy: [{ confirmedAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, passengers: true, kind: true, direction: true }
    });
    for (const earlier of earlierBookings) {
      try {
        assertCanAssign({ direction: current[0]?.booking.direction ?? earlier.direction, requestedDirection: earlier.direction,
          occupiedSeats, requestedPassengers: earlier.passengers, kind: earlier.kind });
        throw new Error("earlier confirmed booking has priority");
      } catch (error) {
        if (error instanceof Error && error.message === "earlier confirmed booking has priority") throw error;
      }
    }
    const queueForDirection = await tx.queueEntry.findMany({
      where: { active: true, direction: booking.direction, vehicle: { status: "QUEUED", capacity: 7,
        shifts: { some: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], user: { active: true, role: "DRIVER" } } } } },
      orderBy: [{ arrivedAt: "asc" }, { position: "asc" }], select: { vehicleId: true }
    });
    let firstFeasibleVehicle: string | null = null;
    for (const entry of queueForDirection) {
      const assigned = await tx.assignment.findMany({ where: { vehicleId: entry.vehicleId, booking: { status: { in: ["ASSIGNED", "CONFIRMED"] } } }, include: { booking: { select: { passengers: true, direction: true } } } });
      const occupied = assigned.reduce((sum, item) => sum + item.booking.passengers, 0);
      try { assertCanAssign({ direction: assigned[0]?.booking.direction ?? booking.direction, requestedDirection: booking.direction, occupiedSeats: occupied, requestedPassengers: booking.passengers, kind: booking.kind }); firstFeasibleVehicle = entry.vehicleId; break; } catch { /* try next queued vehicle */ }
    }
    const bypassedQueuePriority = !!firstFeasibleVehicle && firstFeasibleVehicle !== vehicle.id;
    const assignment = await tx.assignment.create({ data: { bookingId: booking.id, vehicleId: vehicle.id } });
    await tx.booking.update({ where: { id: booking.id }, data: { status: "ASSIGNED" } });
    await tx.auditEvent.create({ data: { actorId: actor.id, action: "TEST_MANUAL_BOOKING_ASSIGNED", entityType: "Booking", entityId: booking.id,
      details: { vehicleId: vehicle.id, driverId: shift.user.id, occupiedSeatsAfter: occupiedSeats + booking.passengers,
        queuePosition: queue.position, bypassedQueuePriority, firstFeasibleVehicle, justification: args.justification.trim(), testTarget: "ruta35-android-pruebas" } } });
    return assignment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
