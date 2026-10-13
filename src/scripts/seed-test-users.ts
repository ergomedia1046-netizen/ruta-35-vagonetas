import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep, isAbsolute } from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { expectedTestIdentities, validateSeedTarget } from "./test-seed-config.js";

type CredentialRow = { email: string; password: string; userId: string };
const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
const csvLine = (values: string[]) => `${values.map(csvCell).join(",")}\r\n`;
const password = () => randomBytes(32).toString("base64url");

async function assertPrivateOutput(path: string) {
  const root = await realpath(process.cwd());
  const parent = await realpath(dirname(path));
  const rel = relative(root, parent);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel)))
    throw new Error("output files must be kept outside the repository");
}

async function readCredentialFile(path: string): Promise<Map<string, CredentialRow>> {
  try {
    const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
    if (lines.shift() !== '"Identificador de prueba","Rol","Ciudad","Correo","Contraseña temporal","ID de usuario","Vehículo asignado","Estado"')
      throw new Error("private credential file has an invalid format");
    const rows = new Map<string, CredentialRow>();
    // Seed-generated values are base64url and the other fields contain no commas.
    for (const line of lines) {
      const fields = line.match(/^"((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)"$/);
      if (!fields) throw new Error("private credential file has an invalid row");
      const unquote = (value: string | undefined) => (value ?? "").replaceAll('""', '"');
      const [email, secret, userId] = [unquote(fields[4]), unquote(fields[5]), unquote(fields[6])];
      rows.set(email, { email, password: secret, userId });
    }
    return rows;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
}

async function persistCredentials(path: string, identities: ReturnType<typeof expectedTestIdentities>, rows: Map<string, CredentialRow>) {
  await mkdir(dirname(path), { recursive: true });
  await assertPrivateOutput(path);
  const contents = ['"Identificador de prueba","Rol","Ciudad","Correo","Contraseña temporal","ID de usuario","Vehículo asignado","Estado"\r\n'];
  identities.forEach((identity, index) => {
    const row = rows.get(identity.email)!;
    const label = identity.role === "PASSENGER" ? `pasajero${String(index + 1).padStart(3, "0")}` : identity.email.split("@")[0]!;
    contents.push(csvLine([label, identity.role, identity.city, identity.email, row.password, row.userId, identity.plate, "ACTIVA"]));
  });
  const temp = `${path}.tmp`;
  await writeFile(temp, contents.join(""), { encoding: "utf8", mode: 0o600, flag: "w" });
  await rename(temp, path);
}

async function run() {
  const target = validateSeedTarget(process.env, process.cwd());
  process.env.DATABASE_URL = target.databaseUrl;
  const identities = expectedTestIdentities();
  for (const path of [target.credentialsPath, target.reportPath]) {
    await mkdir(dirname(path), { recursive: true });
    await assertPrivateOutput(path);
  }
  const credentials = await readCredentialFile(target.credentialsPath);
  const existing: Array<{ id: string; email: string; role: "PASSENGER" | "DRIVER" | "ADMIN"; active: boolean }> = await prisma.user.findMany({
    where: { email: { in: identities.map(({ email }) => email) } },
    select: { id: true, email: true, role: true, active: true }
  });
  const byEmail = new Map(existing.map(user => [user.email, user]));
  for (const identity of identities) {
    const user = byEmail.get(identity.email);
    if (user && (user.role !== identity.role || !user.active)) throw new Error("an existing test identity has an incompatible role or inactive status");
    if (user && !credentials.has(identity.email)) throw new Error("existing test identities require their local credential file; no database changes were made");
    if (credentials.has(identity.email) && user && credentials.get(identity.email)!.userId && credentials.get(identity.email)!.userId !== user.id)
      throw new Error("private credential file does not match the existing test identity");
    if (!credentials.has(identity.email)) {
      const usedPasswords = new Set([...credentials.values()].map(row => row.password));
      let generated = password();
      while (usedPasswords.has(generated)) generated = password();
      credentials.set(identity.email, { email: identity.email, password: generated, userId: "" });
    }
  }

  const savedPasswords = [...credentials.values()].map(row => row.password);
  if (savedPasswords.some(value => value.length < 14) || new Set(savedPasswords).size !== savedPasswords.length)
    throw new Error("private credential file has invalid or duplicate test passwords");

  // Persist generated credentials before the transaction so a failed or interrupted run can be retried safely.
  await persistCredentials(target.credentialsPath, identities, credentials);
  const passwordHashes = new Map<string, string>();
  for (const identity of identities) {
    if (!byEmail.has(identity.email)) passwordHashes.set(identity.email, await argon2.hash(credentials.get(identity.email)!.password, { type: argon2.argon2id }));
  }

  const report = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const now = new Date();
    const users = new Map<string, { id: string; role: string }>();
    for (const identity of identities) {
      const existingUser = byEmail.get(identity.email);
      const user = existingUser ?? await tx.user.create({
        data: { email: identity.email, role: identity.role, passwordHash: passwordHashes.get(identity.email)! }
      });
      users.set(identity.email, user);
      const credential = credentials.get(identity.email)!;
      if (!credential.userId) credential.userId = user.id;
    }

    const reportRows: string[][] = [];
    const passengers = identities.filter(item => item.role === "PASSENGER");
    for (const identity of passengers) {
      const user = users.get(identity.email)!;
      reportRows.push([user.id, identity.email, identity.role, "", "", "", "", "", "", "ACTIVA"]);
    }

    const drivers = identities.filter(item => item.role === "DRIVER");
    for (const [index, identity] of drivers.entries()) {
      const user = users.get(identity.email)!;
      let vehicle = await tx.vehicle.findUnique({ where: { plate: identity.plate } });
      if (vehicle && vehicle.capacity !== 7) throw new Error("an existing test vehicle has incompatible capacity");
      if (!vehicle) vehicle = await tx.vehicle.create({ data: { plate: identity.plate, capacity: 7 } });
      if (vehicle.status === "INACTIVE" || vehicle.status === "ON_TRIP") throw new Error("an existing test vehicle is not available for test seeding");

      const activeShifts = await tx.driverShift.findMany({ where: { endsAt: null, OR: [{ userId: user.id }, { vehicleId: vehicle.id }] } });
      if (activeShifts.some(shift => shift.userId !== user.id || shift.vehicleId !== vehicle.id))
        throw new Error("an existing test driver or vehicle has a conflicting active shift");
      let shift = activeShifts[0];
      if (!shift) shift = await tx.driverShift.create({ data: { userId: user.id, vehicleId: vehicle.id, startsAt: now } });

      const direction = identity.city === "Yacuiba" ? "YACUIBA_TO_VILLAMONTES" as const : "VILLAMONTES_TO_YACUIBA" as const;
      let queue = await tx.queueEntry.findFirst({ where: { vehicleId: vehicle.id, active: true } });
      if (queue && queue.direction !== direction) throw new Error("an existing test vehicle is queued in the wrong direction");
      if (!queue) {
        const last = await tx.queueEntry.findFirst({ where: { direction, active: true }, orderBy: [{ arrivedAt: "desc" }, { position: "desc" }] });
        queue = await tx.queueEntry.create({
          data: { vehicleId: vehicle.id, direction, position: (last?.position ?? 0) + 1,
            arrivedAt: new Date(Math.max(now.getTime(), (last?.arrivedAt.getTime() ?? 0) + 1) + index) }
        });
        await tx.vehicle.update({ where: { id: vehicle.id }, data: { status: "QUEUED" } });
      } else if (vehicle.status !== "QUEUED") {
        throw new Error("existing queue entry and vehicle status are inconsistent");
      }

      reportRows.push([user.id, identity.email, identity.role, identity.city, vehicle.plate, String(vehicle.capacity), shift.id,
        queue.id, String(queue.position), "TURNO_ACTIVO / EN_FILA"]);
    }

    const [passengerCount, driverCount, vehicleCount] = await Promise.all([
      tx.user.count({ where: { email: { in: passengers.map(item => item.email) }, role: "PASSENGER", active: true } }),
      tx.user.count({ where: { email: { in: drivers.map(item => item.email) }, role: "DRIVER", active: true } }),
      tx.vehicle.count({ where: { plate: { in: drivers.map(item => item.plate) }, capacity: 7 } })
    ]);
    const driverIds = drivers.map(item => users.get(item.email)!.id);
    const plates = drivers.map(item => item.plate);
    const actualVehicleIds = (await tx.vehicle.findMany({ where: { plate: { in: plates }, capacity: 7 }, select: { id: true } })).map(vehicle => vehicle.id);
    const [activeShifts, activeQueues] = await Promise.all([
      tx.driverShift.findMany({ where: { userId: { in: driverIds }, vehicleId: { in: actualVehicleIds }, endsAt: null } }),
      tx.queueEntry.findMany({ where: { vehicleId: { in: actualVehicleIds }, active: true }, select: { vehicleId: true, direction: true } })
    ]);
    const yacuibaQueueCount = activeQueues.filter(entry => entry.direction === "YACUIBA_TO_VILLAMONTES").length;
    const villamontesQueueCount = activeQueues.filter(entry => entry.direction === "VILLAMONTES_TO_YACUIBA").length;
    if (passengerCount !== 100 || driverCount !== 20 || vehicleCount !== 20 || actualVehicleIds.length !== 20
      || activeShifts.length !== 20 || activeQueues.length !== 20 || yacuibaQueueCount !== 10 || villamontesQueueCount !== 10)
      throw new Error("post-seed verification counts did not match the requested totals");
    return reportRows;
  }, { timeout: 120_000 });

  await persistCredentials(target.credentialsPath, identities, credentials);
  const reportText = [csvLine(["ID de usuario", "Correo", "Rol", "Ciudad", "Vehículo", "Capacidad", "Turno", "Fila", "Posición", "Estado"]),
    ...report.map(row => csvLine(row))].join("");
  const reportTemp = `${target.reportPath}.tmp`;
  await writeFile(reportTemp, reportText, { encoding: "utf8", mode: 0o600, flag: "w" });
  await rename(reportTemp, target.reportPath);
  console.log("Prueba de carga completada: 100 pasajeros, 20 choferes, 20 vehículos de capacidad 7, 20 turnos y 20 filas verificadas.");
  console.log("Se guardaron los informes localmente; las contraseñas no se imprimieron.");
}

run().catch(error => {
  const detail = error instanceof Error && error.message.startsWith("test mode") ? error.message
    : error instanceof Error && error.message.startsWith("explicit test destination") ? error.message
    : error instanceof Error && error.message.startsWith("database ") ? error.message
    : error instanceof Error && error.message.startsWith("only PostgreSQL") ? error.message
    : error instanceof Error && error.message.startsWith("absolute paths") ? error.message
    : error instanceof Error && error.message.startsWith("output files") ? error.message
    : error instanceof Error && error.message.startsWith("credentials and report") ? error.message
    : error instanceof Error && error.message.startsWith("existing test") ? error.message
    : error instanceof Error && error.message.startsWith("an existing test") ? error.message
    : error instanceof Error && error.message.startsWith("private credential") ? error.message
    : error instanceof Error && error.message.startsWith("private credential file") ? error.message
    : "seed failed or verification did not pass; inspect the isolated database and local output files before retrying";
  console.error(detail);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });

