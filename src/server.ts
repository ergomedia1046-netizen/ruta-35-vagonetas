import Fastify from "fastify";
import { z } from "zod";
import { quoteFare } from "./domain/booking.js";

const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.headers.cookie"] } });
app.get("/health", async () => ({ status: "ok", service: "ruta-35-api" }));
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
