import { describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

describe("V3 production migration operator revalidation", () => {
  it("aborts when the hosted frontier advances between dry-run and commit", () => {
    const checkout = mkdtempSync(join(tmpdir(), "solaris-race-checkout-"));
    const fakeBin = mkdtempSync(join(tmpdir(), "solaris-race-bin-"));
    const state = mkdtempSync(join(tmpdir(), "solaris-race-state-"));
    try {
      const migrations = join(checkout, "supabase", "migrations");
      mkdirSync(migrations, { recursive: true });
      writeFileSync(join(migrations, "20261017212902_baseline.sql"), "-- local fixture baseline\n");
      writeFileSync(join(migrations, "20261018100000_new_work.sql"), "-- local fixture pending migration\n");

      const source = readFileSync(new URL("../../scripts/v3-production-supabase-push.sh", import.meta.url), "utf8");
      expect(source).toContain('EXPECTED_REPO_HEAD="20261017212902"');
      expect(source).toContain('EXPECTED_PENDING_COUNT="0"');
      const adapted = source
        .replace('EXPECTED_REPO_HEAD="20261017212902"', 'EXPECTED_REPO_HEAD="20261018100000"')
        .replace('EXPECTED_PENDING_COUNT="0"', 'EXPECTED_PENDING_COUNT="1"')
        .replace('EXPECTED_PENDING_VERSIONS=()', 'EXPECTED_PENDING_VERSIONS=("20261018100000")');
      const operator = join(checkout, "operator.sh");
      writeFileSync(operator, adapted);

      const fakeSupabase = join(fakeBin, "supabase");
      writeFileSync(fakeSupabase, [
        "#!/bin/sh",
        "set -eu",
        'if [ "$1" = "link" ]; then exit 0; fi',
        'if [ "$1" = "migration" ] && [ "$2" = "list" ]; then',
        '  count=0; if [ -f "$FAKE_COUNTER" ]; then count="$(cat "$FAKE_COUNTER")"; fi',
        '  count="$((count + 1))"; printf "%s" "$count" > "$FAKE_COUNTER"',
        "  printf '%s\\n' ' Local | Remote | Time'",
        "  printf '%s\\n' ' 20261017212902 | 20261017212902 |'",
        "  printf '%s\\n' ' 20261018100000 |                |'",
        '  if [ "$count" -ge 3 ]; then',
        "    printf '%s\\n' '                | 20261017220000 |'",
        "  fi",
        "  exit 0",
        "fi",
        'if [ "$1" = "db" ] && [ "$2" = "push" ]; then',
        '  for arg in "$@"; do if [ "$arg" = "--dry-run" ]; then exit 0; fi; done',
        '  touch "$FAKE_PUSH_MARKER"; exit 0',
        "fi",
        'echo "Unexpected fake CLI invocation" >&2; exit 99',
        "",
      ].join("\n"));
      chmodSync(fakeSupabase, 0o755);
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: checkout, encoding: "utf8" }).trim();
      git("init", "-q");
      git("add", ".");
      git("-c", "user.name=V3 Offline Test", "-c", "user.email=local@example.invalid",
        "commit", "-q", "-m", "Disposable race fixture");
      const sha = git("rev-parse", "HEAD");

      const pushMarker = join(state, "unwanted-hosted-push");
      const result = spawnSync("bash", [operator], {
        cwd: checkout,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          CI: "",
          GITHUB_ACTIONS: "",
          FAKE_COUNTER: join(state, "calls"),
          FAKE_PUSH_MARKER: pushMarker,
          SOLARIS_PRODUCTION_SUPABASE_PROJECT_REF: "dkxmnvekiopyesuzggeu",
          SOLARIS_PRODUCTION_CANDIDATE_SHA: sha,
          SOLARIS_PRODUCTION_DEPLOY_APPROVED: "YES",
          SOLARIS_PRODUCTION_COMMIT: "YES",
        },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("hosted migration frontier moved after dry-run");
      expect(existsSync(pushMarker)).toBe(false);
      expect(readFileSync(join(state, "calls"), "utf8")).toBe("3");
    } finally {
      rmSync(checkout, { recursive: true, force: true });
      rmSync(fakeBin, { recursive: true, force: true });
      rmSync(state, { recursive: true, force: true });
    }
  });
});
