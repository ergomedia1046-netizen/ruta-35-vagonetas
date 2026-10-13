import { isAbsolute, relative, resolve, sep } from "node:path";

export type SeedEnvironment = Record<string, string | undefined>;

export function validateSeedTarget(env: SeedEnvironment, repositoryRoot: string): {
  databaseUrl: string;
  credentialsPath: string;
  reportPath: string;
} {
  if (env.RUTA35_TEST_MODE !== "true") throw new Error("test mode must be enabled");
  if (env.RUTA35_TEST_SEED_TARGET !== "ruta35-android-pruebas") throw new Error("explicit test destination confirmation is required");

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("database URL is required");
  let parsed: URL;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("database URL is invalid"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("only PostgreSQL test databases are supported");
  if (parsed.pathname.replace(/^\//, "") !== "neondb" || parsed.searchParams.get("sslmode") !== "require")
    throw new Error("database URL does not identify the isolated Neon test database");
  const host = parsed.hostname.toLowerCase();
  const allowedHost = env.RUTA35_TEST_SEED_ALLOWED_HOST?.trim().toLowerCase();
  if (!host.endsWith(".neon.tech") || !allowedHost || host !== allowedHost)
    throw new Error("database host is not explicitly pinned to the authorized Neon test project");

  const credentialsPath = env.RUTA35_TEST_CREDENTIALS_FILE;
  const reportPath = env.RUTA35_TEST_REPORT_FILE;
  if (!credentialsPath || !reportPath || !isAbsolute(credentialsPath) || !isAbsolute(reportPath))
    throw new Error("absolute paths for private credentials and report files are required");
  for (const path of [credentialsPath, reportPath]) {
    const resolved = resolve(path);
    const rel = relative(resolve(repositoryRoot), resolved);
    if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel)))
      throw new Error("output files must be kept outside the repository");
  }
  if (resolve(credentialsPath).toLowerCase() === resolve(reportPath).toLowerCase())
    throw new Error("credentials and report files must be separate");
  return { databaseUrl, credentialsPath: resolve(credentialsPath), reportPath: resolve(reportPath) };
}

export function expectedTestIdentities() {
  const passengers = Array.from({ length: 100 }, (_, index) => ({
    email: `pasajero${String(index + 1).padStart(3, "0")}@example.test`, role: "PASSENGER" as const, city: "", plate: ""
  }));
  const yacuiba = Array.from({ length: 10 }, (_, index) => ({
    email: `chofer-yacuiba${String(index + 1).padStart(2, "0")}@example.test`, role: "DRIVER" as const,
    city: "Yacuiba", plate: `TEST-YAC-${String(index + 1).padStart(2, "0")}`
  }));
  const villamontes = Array.from({ length: 10 }, (_, index) => ({
    email: `chofer-villamontes${String(index + 1).padStart(2, "0")}@example.test`, role: "DRIVER" as const,
    city: "Villamontes", plate: `TEST-VMT-${String(index + 1).padStart(2, "0")}`
  }));
  return [...passengers, ...yacuiba, ...villamontes];
}

