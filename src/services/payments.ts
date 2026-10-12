import type { PrismaClient } from "@prisma/client";
import { validatePaymentParts, type PaymentMethod } from "../domain/booking.js";

export async function createPayment(db: PrismaClient, args: {
  bookingId: string; method: PaymentMethod; totalBs: number; qrBs: number; cashBs: number;
}) {
  validatePaymentParts(args.method, args.totalBs, args.qrBs, args.cashBs);
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: args.bookingId }, include: { payment: true } });
    if (!booking) throw new Error("booking not found");
    if (booking.payment) throw new Error("payment already exists");
    if (booking.totalBs !== args.totalBs || booking.paymentMethod !== args.method)
      throw new Error("payment does not match booking");
    return tx.payment.create({ data: {
      bookingId: booking.id, method: args.method, totalBs: args.totalBs,
      parts: { create: [
        ...(args.qrBs > 0 ? [{ kind: "QR" as const, amountBs: args.qrBs }] : []),
        ...(args.cashBs > 0 ? [{ kind: "CASH" as const, amountBs: args.cashBs }] : [])
      ]}
    }});
  });
}

async function refreshPaymentStatus(tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0], paymentId: string) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { parts: true } });
  if (!payment) return;
  const allPaid = payment.parts.every((part) => part.kind === "QR" ? part.status === "VERIFIED" : part.status === "RECEIVED");
  const anyPaid = payment.parts.some((part) => part.kind === "QR" ? part.status === "VERIFIED" : part.status === "RECEIVED");
  const rejected = payment.parts.some((part) => part.status === "REJECTED");
  await tx.payment.update({ where: { id: paymentId }, data: {
    status: allPaid ? "PAID" : rejected ? "REJECTED" : anyPaid ? "PARTIAL" : "PENDING"
  }});
}

export async function recordCashReceived(db: PrismaClient, paymentId: string, actorId: string) {
  return db.$transaction(async (tx) => {
    const part = await tx.paymentPart.findFirst({ where: { paymentId, kind: "CASH" } });
    if (!part || part.status !== "PENDING") throw new Error("cash part is unavailable");
    const updated = await tx.paymentPart.update({ where: { id: part.id }, data: { status: "RECEIVED" } });
    await tx.auditEvent.create({ data: {
      actorId, action: "CASH_RECEIVED", entityType: "PaymentPart", entityId: part.id,
      details: { paymentId, amountBs: part.amountBs }
    }});
    return updated;
  });
}

export async function verifyQrManually(db: PrismaClient, paymentId: string, partId: string, adminId: string, verified: boolean) {
  return db.$transaction(async (tx) => {
    const part = await tx.paymentPart.findFirst({ where: { id: partId, paymentId, kind: "QR" } });
    if (!part || part.status !== "PENDING") throw new Error("QR part is unavailable for review");
    const updated = await tx.paymentPart.update({ where: { id: partId }, data: {
      status: verified ? "VERIFIED" : "REJECTED", verifiedBy: adminId, verifiedAt: new Date()
    }});
    await tx.auditEvent.create({ data: {
      actorId: adminId, action: verified ? "QR_MANUALLY_VERIFIED" : "QR_MANUALLY_REJECTED",
      entityType: "PaymentPart", entityId: partId,
      details: { paymentId, amountBs: part.amountBs, method: "manual_admin_review" }
    }});
    return updated;
  });
}
