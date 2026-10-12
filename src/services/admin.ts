import argon2 from "argon2";
import type { PrismaClient, Role } from "@prisma/client";

export async function createUser(db: PrismaClient, actorId: string, args: { email: string; password: string; role: Role }) {
  const passwordHash = await argon2.hash(args.password, { type: argon2.argon2id });
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: args.email.trim().toLowerCase(), passwordHash, role: args.role }
    });
    await tx.auditEvent.create({ data: {
      actorId, action: "USER_CREATED", entityType: "User", entityId: user.id,
      details: { role: user.role }
    }});
    return { id: user.id, email: user.email, role: user.role };
  });
}

export async function createVehicle(db: PrismaClient, actorId: string, plate: string) {
  return db.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.create({ data: { plate: plate.trim().toUpperCase(), capacity: 7 } });
    await tx.auditEvent.create({ data: {
      actorId, action: "VEHICLE_CREATED", entityType: "Vehicle", entityId: vehicle.id,
      details: { plate: vehicle.plate, capacity: 7 }
    }});
    return vehicle;
  });
}

export async function queueVehicle(db: PrismaClient, actorId: string, vehicleId: string, direction: "YACUIBA_TO_VILLAMONTES" | "VILLAMONTES_TO_YACUIBA") {
  return db.$transaction(async (tx) => {
    const active = await tx.queueEntry.findFirst({ where: { vehicleId, active: true } });
    if (active) throw new Error("vehicle is already queued");
    const last = await tx.queueEntry.findFirst({
      where: { direction, active: true }, orderBy: [{ arrivedAt: "desc" }, { position: "desc" }]
    });
    const entry = await tx.queueEntry.create({
      data: { vehicleId, direction, position: (last?.position ?? 0) + 1 }
    });
    await tx.vehicle.update({ where: { id: vehicleId }, data: { status: "QUEUED" } });
    await tx.auditEvent.create({ data: {
      actorId, action: "VEHICLE_QUEUED", entityType: "QueueEntry", entityId: entry.id,
      details: { vehicleId, direction, position: entry.position }
    }});
    return entry;
  });
}

export async function createDriverShift(db: PrismaClient, actorId: string, userId: string, vehicleId: string) {
  return db.$transaction(async (tx) => {
    const driver = await tx.user.findUnique({ where: { id: userId } });
    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
    if (!driver || driver.role !== "DRIVER" || !driver.active || !vehicle || vehicle.status === "INACTIVE")
      throw new Error("driver or vehicle unavailable");
    const active = await tx.driverShift.findFirst({
      where: { endsAt: null, OR: [{ userId }, { vehicleId }] }
    });
    if (active) throw new Error("driver or vehicle already has an active shift");
    const shift = await tx.driverShift.create({ data: { userId, vehicleId, startsAt: new Date() } });
    await tx.auditEvent.create({ data: {
      actorId, action: "DRIVER_SHIFT_STARTED", entityType: "DriverShift", entityId: shift.id,
      details: { userId, vehicleId }
    }});
    return shift;
  });
}
