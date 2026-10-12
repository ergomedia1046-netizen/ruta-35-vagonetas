import { Prisma, type PrismaClient } from "@prisma/client";

export async function confirmBooking(db: PrismaClient, bookingId: string, adminId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.status !== "PENDING") throw new Error("booking is not pending");
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CONFIRMED", confirmedAt: new Date() }
    });
    await tx.auditEvent.create({ data: {
      actorId: adminId, action: "BOOKING_CONFIRMED", entityType: "Booking",
      entityId: bookingId, details: { previousStatus: "PENDING" }
    }});
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
