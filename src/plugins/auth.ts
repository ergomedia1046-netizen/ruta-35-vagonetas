import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";

declare module "fastify" {
  interface FastifyRequest { authUser: { id: string; role: "PASSENGER" | "DRIVER" | "ADMIN" } | null }
}
const COOKIE = "ruta35_session";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const authPlugin: FastifyPluginAsync = async (app) => {
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.decorateRequest("authUser", null);

  app.addHook("preHandler", async (request: FastifyRequest) => {
    const token = request.cookies[COOKIE];
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

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const token = request.cookies[COOKIE];
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    reply.clearCookie(COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    if (!request.authUser) return reply.code(401).send({ error: "unauthorized" });
    return request.authUser;
  });
};

export function requireRole(...roles: Array<"PASSENGER" | "DRIVER" | "ADMIN">) {
  return async (request: FastifyRequest, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    if (!request.authUser) return reply.code(401).send({ error: "unauthorized" });
    if (!roles.includes(request.authUser.role)) return reply.code(403).send({ error: "forbidden" });
  };
}
