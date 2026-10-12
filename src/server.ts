import Fastify from "fastify";
import { z } from "zod";
import { quoteFare } from "./domain/booking.js";
import { authPlugin, requireRole } from "./plugins/auth.js";
import { prisma } from "./db.js";
import { cancelPendingBooking, createBooking, listPassengerBookings } from "./services/bookings.js";
import { confirmBooking } from "./services/booking-admin.js";
import { assignBooking } from "./services/dispatch.js";

const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.headers.cookie"] } });
await app.register(authPlugin);
app.get("/health", async () => ({ status: "ok", service: "ruta-35-api" }));

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
