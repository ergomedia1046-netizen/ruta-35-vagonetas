import argon2 from "argon2";
import type { PrismaClient, Role } from "@prisma/client";

export async function createUser(db: PrismaClient, actorId: string, args: { email: string; password: string; role: Role }) {
  const passwordHash = await argon2.hash(args.password, { type: argon2.argon2id });
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: args.email.trim().toLowerCase(), passwordHash, role: args.role }
    });
    await tx.auditEvent.create({ data: {
      actorId, action: "USER_CREATED", entityType: "User", entityId: user.id,
      details: { email: user.email, role: user.role }
    }});
    return { id: user.id, email: user.email, role: user.role };
  });
}
