import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const runner = resolve(root, "scripts/rehearse-v3-world-publication-boundary.sh");
const fixture = resolve(root, "scripts/rehearse-v3-world-publication-boundary.sql");

type MockStatus = {
  api: string;
  db: string;
  inherited?: string;
};

function runWithFakeLocalTools(input: MockStatus) {
  const directory = mkdtempSync(join(tmpdir(), "world-publication-boundary-"));
  try {
    writeFileSync(
      join(directory, "supabase"),
      ['#!/bin/sh', 'printf "%s\\n" "API_URL=' + input.api +
        '" "DB_URL=' + input.db + '"', ""].join("\n"),
      { mode: 0o755 },
    );
    writeFileSync(
      join(directory, "psql"),
      "#!/bin/sh\nprintf 'TG19_FAKE_PSQL_CALLED\\n'\n",
      { mode: 0o755 },
    );
    // The sandbox tools never connect to a database. They only record whether
    // the real runner would have invoked psql after URL validation.
    const env = {
      ...process.env,
      PATH: directory + ":" + (process.env.PATH ?? "/usr/bin:/bin"),
      VITE_SUPABASE_URL: input.inherited ?? "",
      SUPABASE_URL: "",
      E2E_SUPABASE_URL: "",
      VITE_CONFIRMATIONS_SUPABASE_URL: "",
      CONFIRMATIONS_SUPABASE_URL: "",
    };
    return spawnSync("bash", [runner], { env, encoding: "utf8" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("World TG19 publication-boundary rehearsal isolation", () => {
  const local = {
    api: "http://127.0.0.1:54321",
    db: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  };

  it("refuses hosted Supabase API before invoking psql", () => {
    const result = runWithFakeLocalTools({
      ...local, api: "https://solaristest.supabase.co",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing non-loopback Supabase API");
    expect(result.stdout).not.toContain("TG19_FAKE_PSQL_CALLED");
  });

  it("refuses remote PostgreSQL, including local-looking hostname suffixes", () => {
    for (const db of [
      "postgresql://postgres:postgres@db.example.com:5432/postgres",
      "postgresql://postgres:postgres@localhost.evil.com:54322/postgres",
    ]) {
      const result = runWithFakeLocalTools({ ...local, db });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Refusing non-loopback");
      expect(result.stdout).not.toContain("TG19_FAKE_PSQL_CALLED");
    }
  });

  it("refuses an inherited hosted secondary Supabase client", () => {
    const result = runWithFakeLocalTools({
      ...local, inherited: "https://hosted-example.supabase.co",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("VITE_SUPABASE_URL");
    expect(result.stdout).not.toContain("TG19_FAKE_PSQL_CALLED");
  });

  it("accepts the isolated loopback-only API and DB configuration", () => {
    const result = runWithFakeLocalTools(local);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("TG19_FAKE_PSQL_CALLED");
    expect(result.stdout).toContain("PASS: isolated World public/private");
  });

  it("keeps all security fixtures rollback-only, under anon and no-JWT roles", () => {
    const sql = readFileSync(fixture, "utf8");
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/\brollback;\s*$/);
    expect(sql).toContain("set local role anon;");
    expect(sql).toContain("set local role authenticated;");
    expect(sql).toContain("TG19_ANON_PRIVATE_ORGANIZATION_RLS_LEAK");
    expect(sql).toContain("TG19_ANON_PRIVATE_PROJECTION_LEAK");
    expect(sql).toContain("TG19_ANON_PRIVATE_CHILD_PROJECTION_LEAK");
    expect(sql).toContain("TG19_NO_JWT_PRIVATE_CHILD_LEAK");
    expect(sql).toContain("TG19_WORLD_DARK_ROLLOUT_REQUIRED");
    expect(sql).not.toMatch(/\bdblink\b|\bhttp_post\b/i);
  });

  it("keeps merged TG2 public RPC filtering aligned with direct office RLS", () => {
    const privacyMigration = readFileSync(resolve(
      root, "supabase/migrations/20261104120800_v3_tg2_nonpublic_organ_office_privacy.sql",
    ), "utf8");

    const policyStart = privacyMigration.indexOf("create policy world_offices_public_read");
    const policyEnd = privacyMigration.indexOf("create policy world_offices_private_scoped_read", policyStart);
    expect(policyStart).toBeGreaterThan(-1);
    expect(policyEnd).toBeGreaterThan(policyStart);
    const directPolicy = privacyMigration.slice(policyStart, policyEnd);
    expect(directPolicy).toContain("organization_row.public_visibility = 'public'");
    expect(directPolicy).toContain("visible_organ.visibility = 'public'");

    const rpcStart = privacyMigration.indexOf(
      "create or replace function public.world_organization_projection_v1",
    );
    const rpcEnd = privacyMigration.indexOf("$projection$;", rpcStart);
    expect(rpcStart).toBeGreaterThan(-1);
    expect(rpcEnd).toBeGreaterThan(rpcStart);
    const publicRpc = privacyMigration.slice(rpcStart, rpcEnd);
    expect(publicRpc).toContain("organization_row.public_visibility = 'public'");
    expect(publicRpc).toContain("organ_row.visibility = 'public'");
    expect(publicRpc).toContain("visible_organ.visibility = 'public'");
    expect(publicRpc).not.toContain("'userId'");
    expect(publicRpc).not.toContain("'email'");
  });

});
