import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { join } from "node:path";
import { z } from "zod";
import { quoteFare } from "./domain/booking.js";
import { authPlugin, requireRole } from "./plugins/auth.js";
import { prisma } from "./db.js";
import { cancelPendingBooking, createBooking, listPassengerBookings } from "./services/bookings.js";
import { confirmBooking } from "./services/booking-admin.js";
import { assignBooking } from "./services/dispatch.js";
import { recordCashReceived, verifyQrManually } from "./services/payments.js";
import { createUser, createVehicle, createDriverShift, queueVehicle } from "./services/admin.js";
import { getActiveShift, listCompatibleRequests, listDriverBookings, updateVehicleStatus } from "./services/driver.js";
import argon2 from "argon2";

const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.headers.cookie"] } });
await app.register(fastifyStatic, { root: join(process.cwd(), "public"), prefix: "/" });
await app.register(authPlugin);
app.get("/health", async () => ({ status: "ok", service: "ruta-35-api" }));

app.post("/api/v1/admin/users", { preHandler: requireRole("ADMIN") }, async (request, reply) => {
  const body = z.object({ email: z.string().email().max(254), password: z.string().min(14).max(200), role: z.enum(["PASSENGER", "DRIVER", "ADMIN"]) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "invalid_request" });
  try { return reply.code(201).send(await createUser(prisma, request.authUser!.id, body.data)); }
  catch { return reply.code(409).send({ error: "user_could_not_be_created" }); }
});
app.post("/api/v1/admin/vehicles", { preHandler: requireRole("ADMIN") }, async (request, reply) => {
  const body = z.object({ plate: z.string().trim().min(4).max(16).regex(/^[A-Za-z0-9 -]+$/) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "invalid_request" });
  try { return reply.code(201).send(await createVehicle(prisma, request.authUser!.id, body.data.plate)); }
  catch { return reply.code(409).send({ error: "vehicle_could_not_be_created" }); }
});
app.post("/api/v1/admin/vehicles/:id/queue", { preHandler: requireRole("ADMIN") }, async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
  const body = z.object({ direction: z.enum(["YACUIBA_TO_VILLAMONTES", "VILLAMONTES_TO_YACUIBA"]) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_request" });
  try { return reply.code(201).send(await queueVehicle(prisma, request.authUser!.id, params.data.id, body.data.direction)); }
  catch { return reply.code(409).send({ error: "vehicle_could_not_be_queued" }); }
});
app.post("/api/v1/admin/shifts", { preHandler: requireRole("ADMIN") }, async (request, reply) => {
  const body = z.object({ userId: z.string().min(1), vehicleId: z.string().min(1) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "invalid_request" });
  try { return reply.code(201).send(await createDriverShift(prisma, request.authUser!.id, body.data.userId, body.data.vehicleId)); }
  catch { return reply.code(409).send({ error: "shift_could_not_be_started" }); }
});
app.get("/api/v1/driver/overview", { preHandler: requireRole("DRIVER") }, async (request, reply) => {
  const shift = await getActiveShift(prisma, request.authUser!.id);
  if (!shift) return reply.code(404).send({ error: "no_active_shift" });
  const [bookings, requests] = await Promise.all([
    listDriverBookings(prisma, request.authUser!.id),
    listCompatibleRequests(prisma, request.authUser!.id)
  ]);
  return { vehicle: shift.vehicle, bookings, requests, warning: "Realiza operaciones solo con el vehículo detenido." };
});
app.post("/api/v1/driver/vehicles/:id/status", { preHandler: requireRole("DRIVER", "ADMIN") }, async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
  const body = z.object({ status: z.enum(["AVAILABLE", "QUEUED", "ON_TRIP", "INACTIVE"]) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_request" });
  try { return await updateVehicleStatus(prisma, params.data.id, request.authUser!.id, body.data.status); }
  catch { return reply.code(403).send({ error: "vehicle_status_change_denied" }); }
});


app.post("/api/v1/payments/:id/cash-received", { preHandler: requireRole("DRIVER", "ADMIN") }, async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "invalid_request" });
  try {
    return await recordCashReceived(prisma, params.data.id, request.authUser!.id);
  } catch {
    return reply.code(409).send({ error: "cash_not_receivable" });
  }
});
app.post("/api/v1/admin/payments/:paymentId/qr-parts/:partId/review", { preHandler: requireRole("ADMIN") }, async (request, reply) => {
  const params = z.object({ paymentId: z.string().min(1), partId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({ verified: z.boolean() }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "invalid_request" });
  try {
    return await verifyQrManually(prisma, params.data.paymentId, params.data.partId, request.authUser!.id, body.data.verified);
  } catch {
    return reply.code(409).send({ error: "qr_part_not_reviewable" });
  }
});


app.post("/api/v1/admin/bookings/:id/confirm", { preHandler: requireRole("ADMIN") }, async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "invalid_request" });
  try {
    return await confirmBooking(prisma, params.data.id, request.authUser!.id);
  } catch {
    return reply.code(409).send({ error: "booking_not_pending" });
  }
});
app.post("/api/v1/driver/assignments", { preHandler: requireRole("DRIVER", "ADMIN") }, async (request, reply) => {
  const body = z.object({ bookingId: z.string().min(1), vehicleId: z.string().min(1) }).safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "invalid_request" });
  try {
    return await assignBooking(prisma, body.data.bookingId, body.data.vehicleId, request.authUser!.id);
  } catch {
    return reply.code(409).send({ error: "assignment_not_available" });
  }
});


app.post("/api/v1/bookings", { preHandler: requireRole("PASSENGER") }, async (request, reply) => {
  const body = z.object({
    direction: z.enum(["YACUIBA_TO_VILLAMONTES", "VILLAMONTES_TO_YACUIBA"]),
    origin: z.string().min(3).max(80), destination: z.string().min(3).max(80),
    pickupPoint: z.string().min(2).max(200), pickupReference: z.string().max(300).optional(),
    passengers: z.number().int().min(1).max(7),
    kind: z.enum(["ORDINARY", "EXPRESS"]).default("ORDINARY"),
    paymentMethod: z.enum(["CASH", "QR", "COMBINED"]),
    qrBs: z.number().int().nonnegative().default(0),
    cashBs: z.number().int().nonnegative().default(0)
  }).safeParse(request.body);
  const key = request.headers["idempotency-key"];
  if (!body.success || typeof key !== "string" || key.length < 8 || key.length > 128)
    return reply.code(400).send({ error: "invalid_request" });
  try {
    const booking = await createBooking(prisma, {
      ...body.data, passengerId: request.authUser!.id,
      idempotencyKey: key,
      pickupReference: body.data.pickupReference
    });
    return reply.code(201).send(booking);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid_booking" });
  }
});
app.get("/api/v1/bookings", { preHandler: requireRole("PASSENGER") }, async (request) => {
  return listPassengerBookings(prisma, request.authUser!.id);
});
app.post("/api/v1/bookings/:id/cancel", { preHandler: requireRole("PASSENGER") }, async (request, reply) => {
  const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "invalid_request" });
  try {
    return await cancelPendingBooking(prisma, params.data.id, request.authUser!.id);
  } catch {
    return reply.code(404).send({ error: "booking_not_found_or_not_cancellable" });
  }
});

app.get("/api/v1/quote", async (request, reply) => {
  const query = z.object({
    passengers: z.coerce.number().int().min(1).max(7),
    kind: z.enum(["ORDINARY", "EXPRESS"]).default("ORDINARY")
  }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "invalid_request" });
  try {
    return { totalBs: quoteFare(query.data.passengers, query.data.kind), currency: "BOB" };
  } catch {
    return reply.code(400).send({ error: "invalid_booking" });
  }
});

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") {
  app.listen({ port, host: "0.0.0.0" }).catch((error: unknown) => {
    app.log.error(error);
    process.exitCode = 1;
  });
}
export { app };
