import { describe, expect, it } from "vitest";
import { api } from "../public/api-client.js";

describe("portal API client", () => {
  it("omits JSON content type for bodyless POST requests", async () => {
    let requestOptions: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestOptions = init;
      return new Response("{}", { status: 200 });
    };

    await api("/api/v1/admin/bookings/example/confirm", { method: "POST" }, fetchImpl);

    expect(requestOptions?.credentials).toBe("same-origin");
    expect(new Headers(requestOptions?.headers).has("content-type")).toBe(false);
  });

  it("sets JSON content type when the request has a body", async () => {
    let requestOptions: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestOptions = init;
      return new Response("{}", { status: 200 });
    };

    await api("/api/v1/example", { method: "POST", body: "{}" }, fetchImpl);

    expect(new Headers(requestOptions?.headers).get("content-type")).toBe("application/json");
  });
});

