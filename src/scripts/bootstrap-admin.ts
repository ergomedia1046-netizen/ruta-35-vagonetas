import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../db.js";

const email = process.env.RUTA35_BOOTSTRAP_EMAIL?.trim().toLowerCase();
const password = process.env.RUTA35_BOOTSTRAP_PASSWORD;

try {
  if (!email && !password) {
    console.log("Admin bootstrap skipped; no bootstrap credentials are configured.");
  } else {
    const input = z.object({
      email: z.string().email().max(254).refine(value => process.env.RUTA35_TEST_MODE !== "true" || value.endsWith(".test")),
      password: z.string().min(14).max(200)
    }).safeParse({ email, password });
    if (!input.success) throw new Error("Set a valid RUTA35_BOOTSTRAP_EMAIL and a RUTA35_BOOTSTRAP_PASSWORD of at least 14 characters.");
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount > 0) {
      console.log("Admin bootstrap skipped; an administrator already exists.");
    } else {
      const existingUser = await prisma.user.findUnique({
        where: { email: input.data.email },
        select: { role: true }
      });
      if (existingUser) {
        throw new Error("Bootstrap email is already assigned to a non-admin account; choose another test-only email.");
      }
      const passwordHash = await argon2.hash(input.data.password, { type: argon2.argon2id });
      await prisma.user.create({
        data: { email: input.data.email, passwordHash, role: "ADMIN" }
      });
      console.log("Initial Ruta 35 administrator created.");
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "bootstrap failed");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
