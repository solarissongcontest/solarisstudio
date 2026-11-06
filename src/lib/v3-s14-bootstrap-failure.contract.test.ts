import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type BootstrapEvidence = {
  schemaVersion: number;
  candidateSha: string;
  passed: boolean;
  partial: boolean;
  runtimeFailure: boolean;
  failurePhase: string;
  failureStage: string;
  exitCode: number;
  completedStages: string[];
  pendingStages: string[];
  pendingContestExtensions: string[];
  runIdentity: { candidateSha: string; databaseFingerprint: string | null };
};

function runWithStubbedLocalSupabase(cliOutput: string) {
  const root = mkdtempSync(join(tmpdir(), "solaris-s14-bootstrap-"));
  const bin = join(root, "bin");
  const evidenceDir = join(root, "evidence");
  const forbiddenTraffic = join(root, "network-attempted");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "supabase"),
    `#!/usr/bin/env bash
if [[ "$1" != "status" || "$2" != "-o" || "$3" != "env" ]]; then exit 98; fi
cat <<'STUB_LOCAL_ENV'
${cliOutput}
STUB_LOCAL_ENV
`,
    { mode: 0o755 },
  );
  for (const executable of ["curl", "psql"]) {
    writeFileSync(
      join(bin, executable),
      `#!/usr/bin/env bash
touch "$S14_NETWORK_SENTINEL"
exit 97
`,
      { mode: 0o755 },
    );
  }

  try {
    const result = spawnSync("bash", [".github/scripts/v3-full-contest-rehearsal.sh"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        V3_RELEASE_EVIDENCE_DIR: evidenceDir,
        S14_NETWORK_SENTINEL: forbiddenTraffic,
        API_URL: "",
        DB_URL: "",
        ANON_KEY: "",
        SERVICE_ROLE_KEY: "",
      },
    });
    const evidencePath = join(evidenceDir, "s14-full-contest.partial.json");
    const payload = existsSync(evidencePath)
      ? (JSON.parse(readFileSync(evidencePath, "utf8")) as BootstrapEvidence)
      : null;
    return {
      exitCode: result.status,
      error: result.error,
      stderr: result.stderr,
      payload,
      attemptedNetwork: existsSync(forbiddenTraffic),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("S14 local Supabase bootstrap failure evidence", () => {
  const checkedOutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  it("records an exact-checkout partial failure before any lifecycle stage if the local CLI supplies no endpoints", () => {
    const run = runWithStubbedLocalSupabase("");
    expect(run.error).toBeUndefined();
    expect(run.exitCode).not.toBe(0);
    expect(run.attemptedNetwork).toBe(false);
    expect(run.payload).toMatchObject({
      schemaVersion: 3,
      candidateSha: checkedOutSha,
      passed: false,
      partial: true,
      runtimeFailure: true,
      failurePhase: "bootstrap",
      failureStage: "bootstrap:local-supabase-initialization",
      completedStages: [],
      exitCode: run.exitCode,
      runIdentity: { candidateSha: checkedOutSha, databaseFingerprint: null },
    });
    expect(run.payload?.pendingStages).toHaveLength(10);
    expect(run.payload?.pendingContestExtensions).toHaveLength(4);
  });

  it("rejects hosted Supabase CLI output, retaining failure evidence without any request", () => {
    const run = runWithStubbedLocalSupabase(
      [
        "API_URL=https://hosted.example.supabase.co",
        "DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        "ANON_KEY=stub-local-only",
        "SERVICE_ROLE_KEY=stub-local-only",
      ].join("\n"),
    );
    expect(run.error).toBeUndefined();
    expect(run.exitCode).not.toBe(0);
    expect(run.stderr).toContain("refusing S14 against non-local API_URL");
    expect(run.attemptedNetwork).toBe(false);
    expect(run.payload?.passed).toBe(false);
    expect(run.payload?.runtimeFailure).toBe(true);
    expect(run.payload?.candidateSha).toBe(checkedOutSha);
  });
});
