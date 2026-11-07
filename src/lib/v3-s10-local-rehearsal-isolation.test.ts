import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const helper = resolve(process.cwd(), "scripts/check-v3-s10-local-rehearsal-targets.mjs");
const rehearsal = resolve(process.cwd(), ".github/scripts/v3-s10-sli-snapshot-rehearsal.sh");
const safeStatus = [
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
].join("\n");

function check(status: string, overrides: Record<string, string> = {}) {
  return spawnSync("node", [helper], {
    encoding: "utf8",
    input: `${status}\n`,
    env: { PATH: process.env.PATH ?? "", ...overrides },
    timeout: 5000,
  });
}

describe("S10 local-only rehearsal target protection", () => {
  it("accepts precisely parsed local Supabase CLI endpoints", () => {
    const result = check(safeStatus);
    expect(result.status).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual([
      "http://127.0.0.1:54321",
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    ]);
  });

  it.each([
    ["external API userinfo", safeStatus.replace("127.0.0.1:54321", "localhost:54321@evil.example")],
    ["external PostgreSQL userinfo", safeStatus.replace("127.0.0.1:54322", "127.0.0.1:54322@evil.example")],
    ["host override", safeStatus.replace("54322/postgres", "54322/postgres?host=evil.example")],
    ["hostaddr override", safeStatus.replace("54322/postgres", "54322/postgres?hostaddr=evil.example")],
    ["missing database", 'API_URL="http://localhost:54321"'],
    ["duplicate endpoints", `${safeStatus}\nAPI_URL="http://localhost:54321"`],
    ["shell expression", safeStatus.replace("http://127.0.0.1:54321", "$(touch /tmp/s10-rehearsal-should-not-run)")],
    ["malformed quoting", safeStatus.replace('API_URL="', 'API_URL="unfinished ')],
    ["remote database", safeStatus.replace("127.0.0.1:54322", "db.example.com:54322")],
  ])("fails closed for %s", (_name, status) => {
    const result = check(status);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/Refusing non-local S10 rehearsal/);
  });

  it.each([
    ["PGHOST", "evil.example"],
    ["PGHOSTADDR", "127.0.0.1,evil.example"],
    ["PGSERVICE", "remote-db"],
    ["PGSERVICEFILE", "/tmp/pg_service.conf"],
    ["PGDATABASE", "postgresql://remote.example/postgres"],
    ["SUPABASE_URL", "https://production.supabase.co"],
    ["VITE_CONFIRMATIONS_SUPABASE_URL", "https://production.supabase.co"],
    ["SUPABASE_PROJECT_REF", "some-hosted-project"],
    ["SUPABASE_SERVICE_ROLE_KEY", "some-secret"],
  ])("refuses ambient authority override %s", (key, value) => {
    expect(check(safeStatus, { [key]: value }).status).not.toBe(0);
  });

  it("keeps local libpq configuration valid", () => {
    expect(check(safeStatus, { PGHOST: "localhost", PGDATABASE: "postgres", PGPORT: "54322" }).status).toBe(0);
  });

  it("wires the validated values before invoking psql and never evals Supabase status", () => {
    const source = readFileSync(rehearsal, "utf8");
    expect(source).toContain("check-v3-s10-local-rehearsal-targets.mjs");
    expect(source).not.toMatch(/\beval\s+\"\$\(supabase status/);
    expect(source.indexOf("check-v3-s10-local-rehearsal-targets.mjs")).toBeLessThan(source.indexOf("db_exec()"));
  });
});
