export const SEAT_LIMIT = 7;
export const ORDINARY_FARE_BS = 35;
export const EXPRESS_FARE_BS = 245;

export type Direction = "YACUIBA_TO_VILLAMONTES" | "VILLAMONTES_TO_YACUIBA";
export type BookingKind = "ORDINARY" | "EXPRESS";
export type PaymentMethod = "CASH" | "QR" | "COMBINED";

export function quoteFare(passengers: number, kind: BookingKind, surchargeBs = 0): number {
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > SEAT_LIMIT)
    throw new Error("passengers must be an integer between 1 and 7");
  if (!Number.isInteger(surchargeBs) || surchargeBs < 0)
    throw new Error("surcharge must be a non-negative integer");
  if (kind === "EXPRESS" && passengers !== SEAT_LIMIT)
    throw new Error("express reserves all seven seats");
  return (kind === "EXPRESS" ? EXPRESS_FARE_BS : ORDINARY_FARE_BS * passengers) + surchargeBs;
}

export function assertCanAssign(args: {
  direction: Direction;
  requestedDirection: Direction;
  occupiedSeats: number;
  requestedPassengers: number;
  kind: BookingKind;
}): void {
  if (args.direction !== args.requestedDirection) throw new Error("incompatible direction");
  if (!Number.isInteger(args.occupiedSeats) || args.occupiedSeats < 0 || args.occupiedSeats > SEAT_LIMIT)
    throw new Error("invalid occupied seat count");
  if (!Number.isInteger(args.requestedPassengers) || args.requestedPassengers < 1 || args.requestedPassengers > SEAT_LIMIT)
    throw new Error("invalid passenger count");
  if (args.kind === "EXPRESS" && (args.occupiedSeats !== 0 || args.requestedPassengers !== SEAT_LIMIT))
    throw new Error("express booking requires an empty vehicle and all seven seats");
  if (args.occupiedSeats + args.requestedPassengers > SEAT_LIMIT)
    throw new Error("vehicle capacity exceeded");
}

export function validatePaymentParts(method: PaymentMethod, totalBs: number, qrBs: number, cashBs: number): void {
  for (const amount of [totalBs, qrBs, cashBs]) {
    if (!Number.isInteger(amount) || amount < 0) throw new Error("payment amounts must be non-negative integers");
  }
  if (method === "COMBINED" && qrBs + cashBs !== totalBs)
    throw new Error("combined payment parts must equal the booking total");
  if (method === "QR" && (qrBs !== totalBs || cashBs !== 0))
    throw new Error("QR amount must equal the booking total");
  if (method === "CASH" && (cashBs !== totalBs || qrBs !== 0))
    throw new Error("cash amount must equal the booking total");
}

export type PartStatus = "PENDING" | "RECEIVED" | "VERIFIED" | "REJECTED";
export function paymentStatus(method: PaymentMethod, qr: PartStatus, cash: PartStatus): "PENDING" | "PARTIAL" | "PAID" {
  const qrPaid = method === "CASH" || qr === "VERIFIED";
  const cashPaid = method === "QR" || cash === "RECEIVED";
  if (qrPaid && cashPaid) return "PAID";
  if ((qrPaid && !cashPaid) || (!qrPaid && cashPaid)) return "PARTIAL";
  return "PENDING";
}

export function canUsePaymentMethod(method: PaymentMethod, combinedRestricted: boolean): boolean {
  return method !== "COMBINED" || !combinedRestricted;
}
