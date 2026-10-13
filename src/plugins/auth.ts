import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import argon2 from "argon2";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";

declare module "fastify" {
  interface FastifyRequest { authUser: { id: string; role: "PASSENGER" | "DRIVER" | "ADMIN" } | null }
}
const COOKIE = "ruta35_session";
const hashToken = (token: string) => createHmac("sha256", process.env.SESSION_SECRET!).update(token).digest("hex");
// Public routes must not consult the session table just because a client sends
// an old bearer token or cookie. Protected routes continue through the lookup.
const PUBLIC_SESSION_ROUTES = new Set([
  "GET /", "GET /api/v1/config", "GET /health", "GET /api/v1/quote",
  "POST /api/v1/auth/register", "POST /api/v1/auth/login", "POST /api/v1/auth/native/login"
]);

const configureAuth: FastifyPluginAsync = async (app) => {
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.decorateRequest("authUser", null);

  app.post("/api/v1/auth/register", {
    config: { rateLimit: { max: 3, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    if (process.env.RUTA35_TEST_MODE !== "true") return reply.code(404).send({ error: "not_found" });
    const input = z.object({
      email: z.string().email().max(254).refine(value => value.trim().toLowerCase().endsWith(".test")),
      password: z.string().min(14).max(200)
    }).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: "test_email_and_password_required" });
    try {
      const user = await prisma.user.create({
        data: { email: input.data.email.trim().toLowerCase(), passwordHash: await argon2.hash(input.data.password, { type: argon2.argon2id }), role: "PASSENGER" }
      });
      return reply.code(201).send({ id: user.id, role: user.role });
    } catch {
      return reply.code(409).send({ error: "account_could_not_be_created" });
    }
  });

  app.addHook("preHandler", async (request: FastifyRequest) => {
    const routeKey = `${request.method} ${request.routeOptions.url ?? request.url.split("?")[0]}`;
    if (PUBLIC_SESSION_ROUTES.has(routeKey)) return;
    const authorization = request.headers.authorization;
    const bearer = authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
    const token = bearer ?? request.cookies[COOKIE];
    if (!token) return;
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, role: true, active: true } } }
    });
    if (session && session.expiresAt > new Date() && session.user.active) {
      request.authUser = { id: session.user.id, role: session.user.role };
    }
  });

  app.post("/api/v1/auth/login", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const input = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) }).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: "invalid_request" });
    const email = input.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await argon2.verify(user.passwordHash, input.data.password)))
      return reply.code(401).send({ error: "invalid_credentials" });

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await prisma.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt } });
    reply.setCookie(COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "strict", path: "/", expires: expiresAt
    });
    return { id: user.id, role: user.role };
  });

  // Native clients use an explicitly separate endpoint because React Native does
  // not provide reliable HttpOnly cookie persistence across Android versions.
  app.post("/api/v1/auth/native/login", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const input = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) }).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: "invalid_request" });
    const email = input.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await argon2.verify(user.passwordHash, input.data.password)))
      return reply.code(401).send({ error: "invalid_credentials" });

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await prisma.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt } });
    reply.header("Cache-Control", "no-store");
    return { id: user.id, role: user.role, accessToken: token, expiresAt: expiresAt.toISOString() };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const bearer = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
    const token = bearer ?? request.cookies[COOKIE];
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    reply.clearCookie(COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    if (!request.authUser) return reply.code(401).send({ error: "unauthorized" });
    return request.authUser;
  });
};

export const authPlugin = fp(configureAuth, { name: "ruta35-auth", fastify: "5.x" });

export function requireRole(...roles: Array<"PASSENGER" | "DRIVER" | "ADMIN">) {
  return async (request: FastifyRequest, reply: import("fastify").FastifyReply): Promise<void> => {
    if (!request.authUser) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    if (!roles.includes(request.authUser.role)) {
      reply.code(403).send({ error: "forbidden" });
      return;
    }
  };
}
