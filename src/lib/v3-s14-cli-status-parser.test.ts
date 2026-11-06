import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(".github/scripts/v3-s14-lib.sh", "utf8");
const boundary = source.indexOf('export SUPABASE_URL="$API_URL"');
if (boundary < 0) throw new Error("S14 local credential bootstrap boundary is missing");

// Executes only the bootstrap with a stubbed CLI. No network or DB is started.
const bootstrap = source.slice(0, boundary);
const localStatus = [
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  'ANON_KEY="local-anon-key"',
  'SERVICE_ROLE_KEY="local-service-role-key"',
].join("\n");

function runStatus(status: string, exitCode = 0) {
  const script = [
    'supabase() { printf "%s\\n" "$S14_TEST_STATUS"; return "$S14_TEST_EXIT"; }',
    bootstrap,
    'printf "LOCAL_OK=%s|%s|%s|%s\\n" "$API_URL" "$DB_URL" "$ANON_KEY" "$SERVICE_ROLE_KEY"',
  ].join("\n");
  return spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      S14_TEST_STATUS: status,
      S14_TEST_EXIT: String(exitCode),
    },
    timeout: 3_000,
  });
}

describe("S14 local Supabase status parser", () => {
  it("accepts four literal local CLI records and ignores unrelated keys", () => {
    const result = runStatus([localStatus, 'STUDIO_URL="http://127.0.0.1:54323"', "# local status"].join("\n"));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "LOCAL_OK=http://127.0.0.1:54321|postgresql://postgres:postgres@127.0.0.1:54322/postgres|local-anon-key|local-service-role-key",
    );
  });

  it("does not execute substitutions in unrecognized status records", () => {
    const directory = mkdtempSync(join(tmpdir(), "solaris-s14-status-"));
    const marker = join(directory, "should-not-exist");
    try {
      const result = runStatus([localStatus, 'UNEXPECTED="$(touch ' + marker + ')"'].join("\n"));
      expect(result.status).toBe(0);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses substitution in a recognized status key before any command runs", () => {
    const directory = mkdtempSync(join(tmpdir(), "solaris-s14-key-"));
    const marker = join(directory, "should-not-exist");
    try {
      const result = runStatus(localStatus.replace(
        'API_URL="http://127.0.0.1:54321"',
        'API_URL="$(touch ' + marker + ')"',
      ));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("unsafe local Supabase status value for API_URL");
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses duplicate or malformed status records", () => {
    const duplicate = runStatus([localStatus, 'API_URL="http://127.0.0.1:54321"'].join("\n"));
    expect(duplicate.status).not.toBe(0);
    expect(duplicate.stderr).toContain("duplicate local Supabase status key: API_URL");

    const malformed = runStatus(localStatus.replace('ANON_KEY="local-anon-key"', 'ANON_KEY="unfinished'));
    expect(malformed.status).not.toBe(0);
    expect(malformed.stderr).toContain("malformed quoted local Supabase status key: ANON_KEY");

    const junk = runStatus([localStatus, "not a status assignment"].join("\n"));
    expect(junk.status).not.toBe(0);
    expect(junk.stderr).toContain("malformed local Supabase status assignment");
  });

  it("fails closed on CLI error or missing service key", () => {
    const failed = runStatus(localStatus, 7);
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain("could not read local Supabase status");

    const missing = runStatus(localStatus.replace('SERVICE_ROLE_KEY="local-service-role-key"', ""));
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("missing local Supabase SERVICE_ROLE_KEY");
  });
});
