import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../db.js";

const input = z.object({
  email: z.string().email().max(254),
  password: z.string().min(14).max(200)
}).safeParse({
  email: process.env.RUTA35_BOOTSTRAP_EMAIL,
  password: process.env.RUTA35_BOOTSTRAP_PASSWORD
});
if (!input.success) {
  console.error("Set a valid RUTA35_BOOTSTRAP_EMAIL and a RUTA35_BOOTSTRAP_PASSWORD of at least 14 characters.");
  process.exitCode = 1;
} else {
  try {
    const count = await prisma.user.count();
    if (count !== 0) throw new Error("bootstrap is allowed only when the user table is empty");
    const passwordHash = await argon2.hash(input.data.password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: input.data.email.toLowerCase(), passwordHash, role: "ADMIN" }
    });
    console.log("Initial Ruta 35 administrator created.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "bootstrap failed");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
