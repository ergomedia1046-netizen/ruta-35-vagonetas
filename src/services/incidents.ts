import { Prisma, type PrismaClient } from "@prisma/client";

export async function reportCombinedIncident(db: PrismaClient, bookingId: string, driverId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
    const actor = await tx.user.findUnique({ where: { id: driverId } });
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { assignment: true, payment: { include: { parts: true } } }
    });
    if (!actor || actor.role !== "DRIVER" || !actor.active || !booking || booking.paymentMethod !== "COMBINED" || !booking.payment)
      throw new Error("incident cannot be reported");
    const vehicleId = booking.assignment?.vehicleId;
    const shift = vehicleId ? await tx.driverShift.findFirst({
      where: { userId: driverId, vehicleId, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }
    }) : null;
    if (!shift) throw new Error("driver is not assigned to this booking");
    const outstanding = booking.payment.parts
      .filter((part) => part.kind === "QR" ? part.status !== "VERIFIED" : part.status !== "RECEIVED")
      .reduce((sum, part) => sum + part.amountBs, 0);
    if (outstanding <= 0) throw new Error("no outstanding payment");
    const openIncident = await tx.incident.findFirst({ where: { bookingId, status: "OPEN" } });
    if (openIncident) throw new Error("an open incident already exists");
    const incident = await tx.incident.create({ data: {
      bookingId, reportedById: driverId, amountBs: outstanding
    }});
    await tx.auditEvent.create({ data: {
      actorId: driverId, action: "COMBINED_PAYMENT_INCIDENT_REPORTED",
      entityType: "Incident", entityId: incident.id, details: { bookingId, amountBs: outstanding }
    }});
    return incident;
  });
}

export async function listIncidents(db: PrismaClient) {
  return db.incident.findMany({
    include: { booking: { select: { id: true, passengers: true, totalBs: true, direction: true, passengerId: true } },
      reporter: { select: { id: true } }, reviewer: { select: { id: true } }, restriction: true },
    orderBy: { reportedAt: "desc" }, take: 100
  });
}

export async function reviewIncident(db: PrismaClient, incidentId: string, adminId: string,
  decision: "SUBSTANTIATED" | "NOT_SUBSTANTIATED", notes: string) {
  return db.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({ where: { id: adminId } });
    await tx.$queryRaw`SELECT id FROM "Incident" WHERE id = ${incidentId} FOR UPDATE`;
    const incident = await tx.incident.findUnique({ where: { id: incidentId } });
    if (!admin || admin.role !== "ADMIN" || !admin.active || !incident || incident.status !== "OPEN")
      throw new Error("incident is not reviewable");
    const updated = await tx.incident.update({ where: { id: incidentId }, data: {
      status: "REVIEWED", reviewedById: adminId, decision, reviewNotes: notes, reviewedAt: new Date()
    }});
    await tx.auditEvent.create({ data: {
      actorId: adminId, action: "INCIDENT_REVIEWED", entityType: "Incident", entityId: incidentId,
      details: { decision, notes }
    }});
    return updated;
  });
}

export async function restrictCombinedPayment(db: PrismaClient, incidentId: string, adminId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({ where: { id: adminId } });
    await tx.$queryRaw`SELECT id FROM "Incident" WHERE id = ${incidentId} FOR UPDATE`;
    const incident = await tx.incident.findUnique({
      where: { id: incidentId }, include: { booking: true, restriction: true }
    });
    if (!admin || admin.role !== "ADMIN" || !admin.active || !incident
      || incident.status !== "REVIEWED" || incident.decision !== "SUBSTANTIATED"
      || !incident.booking.passengerId || incident.restriction)
      throw new Error("incident is not eligible for restriction");
    const userId = incident.booking.passengerId;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const restriction = await tx.paymentRestriction.create({
      data: { userId, incidentId, createdById: adminId, reason }
    });
    await tx.user.update({ where: { id: userId }, data: { combinedPaymentRestricted: true } });
    await tx.auditEvent.create({ data: {
      actorId: adminId, action: "COMBINED_PAYMENT_RESTRICTED", entityType: "PaymentRestriction",
      entityId: restriction.id, details: { incidentId, methodScope: "COMBINED", reason }
    }});
    return restriction;
  });
}

export async function correctIncident(db: PrismaClient, incidentId: string, adminId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({ where: { id: adminId } });
    await tx.$queryRaw`SELECT id FROM "Incident" WHERE id = ${incidentId} FOR UPDATE`;
    const incident = await tx.incident.findUnique({ where: { id: incidentId }, include: { restriction: true } });
    if (!admin || admin.role !== "ADMIN" || !admin.active || !incident || incident.status === "CORRECTED")
      throw new Error("incident cannot be corrected");
    const corrected = await tx.incident.update({ where: { id: incidentId }, data: {
      status: "CORRECTED", correctedAt: new Date(), correctionNotes: reason
    }});
    if (incident.restriction?.active) {
      await tx.paymentRestriction.update({ where: { id: incident.restriction.id }, data: {
        active: false, revokedById: adminId, revokedAt: new Date()
      }});
      const otherActive = await tx.paymentRestriction.count({
        where: { userId: incident.restriction.userId, active: true }
      });
      await tx.user.update({ where: { id: incident.restriction.userId }, data: {
        combinedPaymentRestricted: otherActive > 0
      }});
    }
    await tx.auditEvent.create({ data: {
      actorId: adminId, action: "INCIDENT_CORRECTED", entityType: "Incident", entityId: incidentId,
      details: { reason, restrictionReverted: Boolean(incident.restriction?.active) }
    }});
    return corrected;
  });
}
