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
    await expect(failed.me()).rejects.toMatchObject({ status: 403, code: "forbidden" });
    const disconnected = new Ruta35Api("https://api.example.test", store, vi.fn(async () => { throw new TypeError("offline"); }) as typeof fetch);
    await expect(disconnected.me()).rejects.toMatchObject({ status: 0, code: "connection_unavailable" });
  });
  it("uses the backend booking, history, cancel, driver overview, assignment and payment routes", async () => {
    const tokenStore = { ...store, set: vi.fn(async () => {}), clear: vi.fn(async () => {}) };
    const transport = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/native/login")) return new Response(JSON.stringify({ id: "u1", role: "PASSENGER", accessToken: "t", expiresAt: "2030-01-01T00:00:00Z" }), { status: 200 });
      if (url.includes("/api/v1/quote?")) return new Response(JSON.stringify({ totalBs: 35, currency: "BOB" }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: url.endsWith("/api/v1/bookings") ? 201 : 200 });
    });
    const api = new Ruta35Api("https://api.example.test", tokenStore, transport as typeof fetch);
    await api.login("passenger@example.test", "fake-test-password");
    await api.quote(1, "ORDINARY");
    await api.createBooking({ direction: "YACUIBA_TO_VILLAMONTES", origin: "Yacuiba", destination: "Villamontes", pickupPoint: "PRUEBA: Terminal", passengers: 1, kind: "ORDINARY", paymentMethod: "CASH", qrBs: 0, cashBs: 35 }, "fixed-attempt-key");
    await api.bookings();
    await api.cancelBooking("booking-1");
    await api.driverOverview();
    await api.assign("booking-2", "vehicle-1");
    await api.cashReceived("payment-1");
    await api.setVehicleStatus("vehicle-1", "ON_TRIP");
    expect(tokenStore.set).toHaveBeenCalledWith("t");
    const urls = transport.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual(expect.arrayContaining([
      "https://api.example.test/api/v1/auth/native/login", "https://api.example.test/api/v1/quote?passengers=1&kind=ORDINARY",
      "https://api.example.test/api/v1/bookings", "https://api.example.test/api/v1/bookings/booking-1/cancel",
      "https://api.example.test/api/v1/driver/overview", "https://api.example.test/api/v1/driver/assignments",
      "https://api.example.test/api/v1/payments/payment-1/cash-received", "https://api.example.test/api/v1/driver/vehicles/vehicle-1/status"
    ]));
  });
});
