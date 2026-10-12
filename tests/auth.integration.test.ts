import { randomUUID } from "node:crypto";
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
