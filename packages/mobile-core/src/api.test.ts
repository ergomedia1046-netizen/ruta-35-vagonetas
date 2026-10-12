import { describe, expect, it, vi } from "vitest";
import { ApiError, Ruta35Api, type TokenStore } from "./api.js";

const store: TokenStore = { get: async () => "secure-token", set: async () => {}, clear: async () => {} };
describe("Ruta35Api", () => {
  it("shares bearer auth and idempotency key with the configured backend", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ id: "b1" }), { status: 201 }));
    const api = new Ruta35Api("https://api.example.test/", store, transport as typeof fetch);
    await api.createBooking({ direction: "YACUIBA_TO_VILLAMONTES", origin: "Yacuiba", destination: "Villamontes", pickupPoint: "PRUEBA: plaza", passengers: 1, kind: "ORDINARY", paymentMethod: "CASH", qrBs: 0, cashBs: 0 }, "attempt-123456");
    expect(transport).toHaveBeenCalledWith("https://api.example.test/api/v1/bookings", expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ Authorization: "Bearer secure-token", "Idempotency-Key": "attempt-123456" })
    }));
  });
  it("refuses non-TLS API endpoints except localhost", () => {
    expect(() => new Ruta35Api("http://example.test", store)).toThrow(/HTTPS/);
    expect(() => new Ruta35Api("http://localhost:3000", store)).not.toThrow();
  });
  it("preserves server error codes and treats disconnects as connection errors", async () => {
    const failed = new Ruta35Api("https://api.example.test", store, vi.fn(async () => new Response('{"error":"forbidden"}', { status: 403 })) as typeof fetch);
    await expect(failed.me()).rejects.toMatchObject<ApiError>({ status: 403, code: "forbidden" });
    const disconnected = new Ruta35Api("https://api.example.test", store, vi.fn(async () => { throw new TypeError("offline"); }) as typeof fetch);
    await expect(disconnected.me()).rejects.toMatchObject({ status: 0, code: "connection_unavailable" });
  });
});
