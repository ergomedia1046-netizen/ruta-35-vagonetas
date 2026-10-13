export type Role = "PASSENGER" | "DRIVER" | "ADMIN";
export type Session = { id: string; role: Role; accessToken: string; expiresAt: string };
export type Direction = "YACUIBA_TO_VILLAMONTES" | "VILLAMONTES_TO_YACUIBA";
export type BookingKind = "ORDINARY" | "EXPRESS";
export type PaymentMethod = "CASH" | "QR" | "COMBINED";
export type TripAction = "GO_TO_PICKUP" | "CONFIRM_PICKUP" | "START_TRIP" | "CONFIRM_ARRIVAL" | "MARK_AVAILABLE";
export type BookingInput = {
  direction: Direction; origin: string; destination: string; pickupPoint: string;
  pickupReference?: string; passengers: number; kind: BookingKind;
  paymentMethod: PaymentMethod; qrBs: number; cashBs: number;
};

export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "ApiError";
  }
}

export class Ruta35Api {
  private readonly baseUrl: string;
  constructor(baseUrl: string, private readonly tokens: TokenStore, private readonly transport: typeof fetch = fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    if (!/^https:\/\//i.test(this.baseUrl) && !/^http:\/\/localhost(?::\d+)?$/i.test(this.baseUrl)) {
      throw new Error("API URL must use HTTPS (HTTP is allowed only for localhost development)");
    }
  }

  private async request<T>(path: string, init: RequestInit = {}, idempotencyKey?: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const token = await this.tokens.get();
      let response: Response;
      try {
        response = await this.transport(`${this.baseUrl}${path}`, {
          ...init, signal: controller.signal,
          headers: {
            Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
            ...init.headers
          }
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new ApiError(0, "connection_timeout");
        throw new ApiError(0, "connection_unavailable");
      }
      if (response.status === 204) return undefined as T;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(response.status, typeof data?.error === "string" ? data.error : "request_failed");
      return data as T;
    } finally { clearTimeout(timeout); }
  }

  async config() { return this.request<{ testMode: boolean }>("/api/v1/config"); }
  async register(email: string, password: string) {
    return this.request<{ id: string; role: Role }>("/api/v1/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  async login(email: string, password: string): Promise<Session> {
    const session = await this.request<Session>("/api/v1/auth/native/login", { method: "POST", body: JSON.stringify({ email, password }) });
    await this.tokens.set(session.accessToken);
    return session;
  }
  async me() { return this.request<{ id: string; role: Role }>("/api/v1/auth/me"); }
  async logout() {
    try { await this.request<void>("/api/v1/auth/logout", { method: "POST" }); }
    finally { await this.tokens.clear(); }
  }
  async quote(passengers: number, kind: BookingKind) {
    return this.request<{ totalBs: number; currency: string }>(`/api/v1/quote?passengers=${passengers}&kind=${kind}`);
  }
  async createBooking(input: BookingInput, idempotencyKey: string) {
    return this.request<Record<string, unknown>>("/api/v1/bookings", { method: "POST", body: JSON.stringify(input) }, idempotencyKey);
  }
  async bookings() { return this.request<Array<Record<string, any>>>("/api/v1/bookings"); }
  async cancelBooking(id: string) { return this.request<Record<string, unknown>>(`/api/v1/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST" }); }
  async driverOverview() { return this.request<Record<string, any>>("/api/v1/driver/overview"); }
  async driverPresence() { return this.request<{ lastSeenAt: string }>("/api/v1/driver/presence", { method: "POST" }); }
  async assign(bookingId: string, vehicleId: string) {
    return this.request<Record<string, unknown>>("/api/v1/driver/assignments", { method: "POST", body: JSON.stringify({ bookingId, vehicleId }) });
  }
  async cashReceived(paymentId: string) {
    return this.request<Record<string, unknown>>(`/api/v1/payments/${encodeURIComponent(paymentId)}/cash-received`, { method: "POST" });
  }
  async tripAction(tripId: string, action: TripAction, actualPassengers?: Record<string, number>) {
    const idempotencyKey = `trip-${tripId}-${action}`;
    return this.request<Record<string, any>>(`/api/v1/driver/trips/${encodeURIComponent(tripId)}/actions`, {
      method: "POST", body: JSON.stringify({ action, ...(actualPassengers ? { actualPassengers } : {}) })
    }, idempotencyKey);
  }
  async joinDestinationQueue(tripId: string) {
    return this.request<Record<string, any>>(`/api/v1/driver/trips/${encodeURIComponent(tripId)}/join-destination-queue`, { method: "POST" }, `queue-${tripId}-destination`);
  }
}

export function routeNames(direction: Direction) {
  return direction === "YACUIBA_TO_VILLAMONTES"
    ? { origin: "Yacuiba", destination: "Villamontes" }
    : { origin: "Villamontes", destination: "Yacuiba" };
}
