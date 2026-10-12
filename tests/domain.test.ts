import { describe, expect, it } from "vitest";
import { assertCanAssign, canUsePaymentMethod, paymentStatus, quoteFare, validatePaymentParts } from "../src/domain/booking.js";

const direction = "YACUIBA_TO_VILLAMONTES" as const;
describe("Ruta 35 business rules", () => {
  it("prices ordinary trips at Bs 35 per passenger", () => {
    expect(quoteFare(1, "ORDINARY")).toBe(35);
    expect(quoteFare(7, "ORDINARY")).toBe(245);
  });
  it("rejects more than seven and reserves seven for express", () => {
    expect(() => quoteFare(8, "ORDINARY")).toThrow();
    expect(quoteFare(7, "EXPRESS")).toBe(245);
    expect(() => quoteFare(2, "EXPRESS")).toThrow();
  });
  it("allows five occupied plus two compatible passengers", () => {
    expect(() => assertCanAssign({direction, requestedDirection:direction, occupiedSeats:5, requestedPassengers:2, kind:"ORDINARY"})).not.toThrow();
  });
  it("rejects over-capacity and opposite direction", () => {
    expect(() => assertCanAssign({direction, requestedDirection:direction, occupiedSeats:7, requestedPassengers:1, kind:"ORDINARY"})).toThrow();
    expect(() => assertCanAssign({direction, requestedDirection:"VILLAMONTES_TO_YACUIBA", occupiedSeats:0, requestedPassengers:1, kind:"ORDINARY"})).toThrow();
  });
  it("does not mix express seats with other bookings", () => {
    expect(() => assertCanAssign({direction, requestedDirection:direction, occupiedSeats:0, requestedPassengers:7, kind:"EXPRESS"})).not.toThrow();
    expect(() => assertCanAssign({direction, requestedDirection:direction, occupiedSeats:1, requestedPassengers:7, kind:"EXPRESS"})).toThrow();
  });
  it("requires combined amounts to match exactly", () => {
    expect(() => validatePaymentParts("COMBINED",35,30,5)).not.toThrow();
    expect(() => validatePaymentParts("COMBINED",35,30,4)).toThrow();
  });
  it("keeps QR pending until verification and cash pending until received", () => {
    expect(paymentStatus("QR","PENDING","PENDING")).toBe("PENDING");
    expect(paymentStatus("CASH","PENDING","PENDING")).toBe("PENDING");
    expect(paymentStatus("QR","VERIFIED","PENDING")).toBe("PAID");
    expect(paymentStatus("CASH","PENDING","RECEIVED")).toBe("PAID");
    expect(paymentStatus("COMBINED","VERIFIED","PENDING")).toBe("PARTIAL");
  });
  it("limits a combined-payment restriction to that method", () => {
    expect(canUsePaymentMethod("COMBINED",true)).toBe(false);
    expect(canUsePaymentMethod("CASH",true)).toBe(true);
    expect(canUsePaymentMethod("QR",true)).toBe(true);
  });
});
