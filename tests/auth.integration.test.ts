import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";

const suite = describe.skipIf(!process.env.DATABASE_URL);
suite("test-only passenger registration and secure session", () => {
  let app: typeof import("../src/server.js").app;
  const emails: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.RUTA35_TEST_MODE = "true";
    ({ app } = await import("../src/server.js"));
    await app.ready();
  });

  afterEach(async () => {
    for (const email of emails.splice(0)) {
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (user) {
        await prisma.session.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
    process.env.NODE_ENV = "test";
    process.env.RUTA35_TEST_MODE = "true";
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
  });

  it("creates only a fake passenger account and issues a Secure same-site session over production HTTPS", async () => {
    const email = `passenger-${randomUUID()}@example.test`;
    emails.push(email);
    const created = await app.inject({
      method: "POST", url: "/api/v1/auth/register",
      payload: { email, password: "Test-only-strong-password-2026!", role: "ADMIN" }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ role: "PASSENGER" });

    process.env.NODE_ENV = "production";
    const login = await app.inject({
      method: "POST", url: "/api/v1/auth/login",
      payload: { email, password: "Test-only-strong-password-2026!" }
    });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers["set-cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie: cookie.split(";")[0] } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ id: created.json().id, role: "PASSENGER" });
    const headers = { cookie: cookie.split(";")[0] };
    const bookings = await app.inject({ method: "GET", url: "/api/v1/bookings", headers });
    expect(bookings.statusCode).toBe(200);
    expect(bookings.json()).toEqual([]);
    for (const url of ["/api/v1/admin/audit", "/api/v1/driver/overview"]) {
      expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(403);
    }
    expect((await app.inject({ method: "GET", url: "/api/v1/bookings" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/v1/bookings", headers })).statusCode).toBe(401);
  });

  it("authenticates administrators on protected routes outside the auth plugin", async () => {
    const email = `admin-${randomUUID()}@example.test`;
    const password = "Test-only-strong-password-2026!";
    emails.push(email);
    await prisma.user.create({
      data: { email, role: "ADMIN", passwordHash: await argon2.hash(password, { type: argon2.argon2id }) }
    });
    process.env.NODE_ENV = "production";
    const login = await app.inject({
      method: "POST", url: "/api/v1/auth/login", payload: { email, password }
    });
    expect(login.statusCode).toBe(200);
    const headers = { cookie: String(login.headers["set-cookie"]).split(";")[0] };
    for (const url of ["/api/v1/admin/audit", "/api/v1/admin/bookings/pending", "/api/v1/admin/payments/pending-qr"]) {
      expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(200);
    }
  });

  it("rejects real-looking email addresses and disables public registration outside test mode", async () => {
    const invalidEmail = await app.inject({
      method: "POST", url: "/api/v1/auth/register",
      payload: { email: "person@example.com", password: "Test-only-strong-password-2026!" }
    });
    expect(invalidEmail.statusCode).toBe(400);

    process.env.RUTA35_TEST_MODE = "false";
    const disabled = await app.inject({
      method: "POST", url: "/api/v1/auth/register",
      payload: { email: `disabled-${randomUUID()}@example.test`, password: "Test-only-strong-password-2026!" }
    });
    expect(disabled.statusCode).toBe(404);
  });
});
