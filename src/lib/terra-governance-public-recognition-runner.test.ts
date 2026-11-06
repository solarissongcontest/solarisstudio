import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/rehearse-v3-world-public-recognition-privacy.sh");

function runWithFakeLocalCli(apiUrl: string, dbUrl: string) {
  const dir = mkdtempSync(join(tmpdir(), "world-recognition-loopback-"));
  try {
    const supabase = join(dir, "supabase");
    const psql = join(dir, "psql");
    // These stubs make NO network requests or database calls.
    writeFileSync(supabase, [
      "#!/bin/sh",
      "printf 'API_URL=%s\\nDB_URL=%s\\n' \"$TEST_API_URL\" \"$TEST_DB_URL\"",
      "",
    ].join("\n"));
    writeFileSync(psql, "#!/bin/sh\nprintf 'MOCK_PSQL_CALLED=%s\\n' \"$1\"\n");
    chmodSync(supabase, 0o755);
    chmodSync(psql, 0o755);
    return spawnSync("bash", [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: dir + ":" + (process.env.PATH ?? ""),
        TEST_API_URL: apiUrl,
        TEST_DB_URL: dbUrl,
      },
      timeout: 5000,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("World TG19 RLS rehearsal never tests hosted Supabase", () => {
  const localApi = "http://127.0.0.1:54321";
  const localDb = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  it("runs only the stub psql for explicitly loopback Supabase", () => {
    const result = runWithFakeLocalCli('"' + localApi + '"', '"' + localDb + '"');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MOCK_PSQL_CALLED=" + localDb);
  });

  it("refuses hosted API even when the DB URL is local", () => {
    const result = runWithFakeLocalCli("https://example.supabase.co", localDb);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing hosted/non-loopback API");
    expect(result.stdout).not.toContain("MOCK_PSQL_CALLED");
  });

  it("refuses a hosted database even when the API is local", () => {
    const result = runWithFakeLocalCli(localApi, "postgresql://postgres:postgres@db.example.com:5432/postgres");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing hosted/non-loopback database");
    expect(result.stdout).not.toContain("MOCK_PSQL_CALLED");
  });

  it("fails closed on missing local Supabase configuration", () => {
    const result = runWithFakeLocalCli("", localDb);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Missing local Supabase API URL");
    expect(result.stdout).not.toContain("MOCK_PSQL_CALLED");
  });

  it("rejects localhost-prefixed remote API authority spoofing", () => {
    const result = runWithFakeLocalCli("http://127.0.0.1:54321@evil.example", localDb);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing hosted/non-loopback API");
    expect(result.stdout).not.toContain("MOCK_PSQL_CALLED");
  });

  it("rejects localhost-prefixed remote DB authority spoofing", () => {
    const result = runWithFakeLocalCli(localApi, "postgresql://postgres:postgres@127.0.0.1:54322@evil.example/postgres");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing hosted/non-loopback database");
    expect(result.stdout).not.toContain("MOCK_PSQL_CALLED");
  });

  it("treats shell-looking status values as data rather than evaluating them", () => {
    const result = runWithFakeLocalCli('http://127.0.0.1:54321"; touch /tmp/world-recognition-unsafe"', localDb);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("MOCK_PSQL_CALLED");
  });
});
