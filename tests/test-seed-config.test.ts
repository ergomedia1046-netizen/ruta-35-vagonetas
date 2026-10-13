import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectedTestIdentities, validateSeedTarget } from "../src/scripts/test-seed-config.js";

const repo = join(tmpdir(), "ruta35-seed-test-repo");
const privateDir = join(tmpdir(), "ruta35-seed-test-private");
const env = (overrides: Record<string, string | undefined> = {}) => ({
  RUTA35_TEST_MODE: "true",
  RUTA35_TEST_SEED_TARGET: "ruta35-android-pruebas",
  DATABASE_URL: "postgresql://test:secret@ep-test.us-east-2.aws.neon.tech/neondb?sslmode=require",
  RUTA35_TEST_SEED_ALLOWED_HOST: "ep-test.us-east-2.aws.neon.tech",
  RUTA35_TEST_CREDENTIALS_FILE: join(privateDir, "ruta35-credentials.csv"),
  RUTA35_TEST_REPORT_FILE: join(privateDir, "ruta35-report.csv"),
  ...overrides
});

describe("test seed safety configuration", () => {
  it("requires test mode, exact destination, and pinned Neon host", () => {
    expect(() => validateSeedTarget(env({ RUTA35_TEST_MODE: "false" }), repo)).toThrow("test mode");
    expect(() => validateSeedTarget(env({ RUTA35_TEST_SEED_TARGET: "production" }), repo)).toThrow("destination confirmation");
    expect(() => validateSeedTarget(env({ RUTA35_TEST_SEED_ALLOWED_HOST: "other.neon.tech" }), repo)).toThrow("not explicitly pinned");
  });

  it("rejects non-Neon databases and output paths within the repository", () => {
    expect(() => validateSeedTarget(env({ DATABASE_URL: "postgresql://u:p@db.render.com/neondb?sslmode=require" }), repo)).toThrow();
    expect(() => validateSeedTarget(env({ RUTA35_TEST_REPORT_FILE: join(repo, "report.csv") }), repo)).toThrow("outside the repository");
  });

  it("creates the exact unique synthetic user and vehicle naming plan", () => {
    const identities = expectedTestIdentities();
    expect(identities).toHaveLength(120);
    expect(identities.filter(item => item.role === "PASSENGER")).toHaveLength(100);
    expect(identities.filter(item => item.role === "DRIVER" && item.city === "Yacuiba")).toHaveLength(10);
    expect(identities.filter(item => item.role === "DRIVER" && item.city === "Villamontes")).toHaveLength(10);
    expect(new Set(identities.map(item => item.email)).size).toBe(120);
    expect(identities.every(item => item.email.endsWith("@example.test"))).toBe(true);
  });
});

