import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const runner = resolve(process.cwd(), "scripts/rehearse-v3-world-private-room-catalog.sh");
const catalog = resolve(process.cwd(), "scripts/rehearse-v3-world-private-room-catalog.sql");
const localApi = "http://127.0.0.1:54321";
const localDb = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runMocked(input: {
  api?: string;
  db?: string;
  inheritedUrl?: string;
  pgHost?: string;
}) {
  const dir = mkdtempSync(join(tmpdir(), "tg19-world-private-catalog-"));
  try {
    writeFileSync(join(dir, "supabase"), [
      "#!/bin/sh",
      "printf '%s\\n' 'API_URL=\"" + (input.api ?? localApi) + "\"' 'DB_URL=\"" +
        (input.db ?? localDb) + "\"'",
      "",
    ].join("\n"), { mode: 0o755 });
    writeFileSync(join(dir, "psql"), [
      "#!/bin/sh",
      'if [ -n "${PGHOST:-}" ]; then echo "UNSAFE_PGHOST" >&2; exit 70; fi',
      'printf "TG19_FAKE_PSQL_CALLED\\n"',
      "",
    ].join("\n"), { mode: 0o755 });

    const environment = {
      ...process.env,
      PATH: dir + ":" + (process.env.PATH ?? "/usr/bin:/bin"),
      VITE_SUPABASE_URL: input.inheritedUrl ?? "",
      SUPABASE_URL: "",
      E2E_SUPABASE_URL: "",
      VITE_CONFIRMATIONS_SUPABASE_URL: "",
      CONFIRMATIONS_SUPABASE_URL: "",
      PGHOST: input.pgHost ?? "",
    };
    return spawnSync("bash", [runner], {
      encoding: "utf8",
      env: environment,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("TG19 private World room catalog verification", () => {
  it("uses an entirely read-only rollback-only catalog rehearsal", () => {
    const sql = readFileSync(catalog, "utf8");
    expect(sql).toMatch(/^begin transaction read only;/m);
    expect(sql).toMatch(/\brollback;\s*$/);
    expect(sql).not.toMatch(/^\s*(?:insert|update|delete|truncate|alter|create|drop)\s/mi);
    for (const table of [
      "public.world_spaces",
      "private.world_space_access_grants",
      "private.world_space_grant_audit",
      "private.world_space_messages",
      "private.world_space_message_revisions",
      "private.world_space_reactions",
      "private.world_space_attachments",
    ]) expect(sql).toContain("'" + table + "'");
    expect(sql).toContain("rel.relrowsecurity = true");
    expect(sql).toContain("has_table_privilege");
    expect(sql).toContain("has_function_privilege");
    expect(sql).toContain("TG19_PRIVATE_ROOM_SERVICE_ROLE_WRITER");
    expect(sql).toContain("TG19_PRIVATE_ROOM_HELPER_PUBLIC_EXECUTE");
    expect(sql).toContain("TG19_PRIVATE_ROOM_NO_JWT_WORKSPACE_LEAK");
    expect(sql).toContain("TG19_PRIVATE_ROOM_FLAGS_MUST_REMAIN_DARK");
  });

  it("accepts only explicit disposable 127.0.0.1 Supabase and database URLs", () => {
    const result = runMocked({});
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("TG19_FAKE_PSQL_CALLED");
    expect(result.stdout).toContain("PASS: local private room");
  });

  it.each([
    ["remote API", { api: "https://production.supabase.co" }],
    ["remote database", { db: "postgresql://postgres:postgres@db.example.org:5432/postgres" }],
    ["authority-spoofed database", { db: "postgresql://postgres:postgres@127.0.0.1.evil.com:54322/postgres" }],
    ["database URL option override", { db: localDb + "?host=db.evil.com" }],
    ["hosted extra client", { inheritedUrl: "https://production.supabase.co" }],
  ])("rejects %s before calling PostgreSQL", (_label, values) => {
    const result = runMocked(values);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("TG19_FAKE_PSQL_CALLED");
  });

  it("clears inherited libpq connection overrides before invoking PostgreSQL", () => {
    const result = runMocked({ pgHost: "db.production.invalid" });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("UNSAFE_PGHOST");
    expect(result.stdout).toContain("TG19_FAKE_PSQL_CALLED");
  });
});
