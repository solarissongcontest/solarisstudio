import { describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

/**
 * Exercise the real production operator's *pre-network* gates against a
 * disposable Git checkout and a fake Supabase CLI. These tests must NEVER
 * contact or even resolve hosted Supabase.
 */
describe("V3 production operator exact-SHA gate", () => {
  it("refuses missing or stale approval SHA before calling Supabase", () => {
    const checkout = mkdtempSync(join(tmpdir(), "solaris-prod-gate-"));
    const fakeBin = mkdtempSync(join(tmpdir(), "solaris-prod-bin-"));
    try {
      mkdirSync(join(checkout, "supabase", "migrations"), { recursive: true });
      writeFileSync(join(checkout, "supabase", "migrations", "20261017212902_fixture.sql"), "-- fixture only\n");
      const fakeSupabase = join(fakeBin, "supabase");
      writeFileSync(
        fakeSupabase,
        '#!/bin/sh\nprintf "FAKE_SUPABASE_CALLED\\n" >&2\nexit 91\n',
      );
      chmodSync(fakeSupabase, 0o755);

      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: checkout, encoding: "utf8" }).trim();
      git("init", "-q");
      git("add", ".");
      git("-c", "user.name=V3 Test", "-c", "user.email=local@example.invalid", "commit", "-q", "-m", "Disposable fixture");
      const actualSha = git("rev-parse", "HEAD");

      const script = fileURLToPath(new URL("../../scripts/v3-production-supabase-push.sh", import.meta.url));
      const environment = {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        CI: "",
        GITHUB_ACTIONS: "",
        SOLARIS_PRODUCTION_SUPABASE_PROJECT_REF: "dkxmnvekiopyesuzggeu",
        SOLARIS_PRODUCTION_DEPLOY_APPROVED: "YES",
        SOLARIS_PRODUCTION_COMMIT: "",
      };
      const run = (approvedSha?: string) =>
        spawnSync("bash", [script], {
          cwd: checkout,
          encoding: "utf8",
          env: { ...environment, SOLARIS_PRODUCTION_CANDIDATE_SHA: approvedSha ?? "" },
        });

      const missing = run();
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain("set SOLARIS_PRODUCTION_CANDIDATE_SHA");
      expect(missing.stderr).not.toContain("FAKE_SUPABASE_CALLED");

      const wrong = run("0".repeat(40) === actualSha ? "1".repeat(40) : "0".repeat(40));
      expect(wrong.status).toBe(1);
      expect(wrong.stderr).toContain("approval was for");
      expect(wrong.stderr).not.toContain("FAKE_SUPABASE_CALLED");

      // The same deliberately fake CLI proves that a correctly pinned SHA
      // advances past local safety gates. No real Supabase API is reachable.
      const pinned = run(actualSha);
      expect(pinned.status).toBe(91);
      expect(pinned.stderr).toContain("FAKE_SUPABASE_CALLED");
    } finally {
      rmSync(checkout, { recursive: true, force: true });
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });
});
