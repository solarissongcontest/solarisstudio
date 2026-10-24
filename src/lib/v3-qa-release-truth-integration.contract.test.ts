import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const workflow = source(".github/workflows/v3-release-candidate-preflight.yml");
const cli = source("scripts/check-v3-qa-release-truth.ts");
const truth = source("src/lib/v3-qa-release-truth.ts");

describe("V3 QA release-truth preflight integration", () => {
  it("binds the generated truth artifact to the exact requested candidate SHA", () => {
    expect(workflow).toContain("V3_CANDIDATE_SHA=$actual");
    expect(workflow).toContain("scripts/check-v3-qa-release-truth.ts");
    expect(workflow).toContain("v3-release-preflight/release-truth.json");
    expect(workflow).toContain("truth_sha=");
    expect(workflow).toContain('truth=$truth_sha');
    expect(workflow).toContain('truth_sha" != "$expected');
  });

  it("fails preflight closed until S10-S15 exact-candidate evidence is ready for S16", () => {
    expect(workflow).toContain(
      "bun run scripts/check-v3-qa-release-truth.ts --require-s16-ready > /dev/null",
    );
    expect(workflow).toContain("bun run scripts/check-v3-release-integrity.ts --release");
    expect(workflow).not.toContain("scripts/check-v3-qa-release-truth.ts --require-certified");
  });

  it("keeps release truth read-only and non-certifying by default", () => {
    expect(cli).not.toMatch(/fetch\(|createClient|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL/);
    expect(cli).toContain("--require-s16-ready");
    expect(cli).toContain("--require-certified");
    expect(truth).toContain('const certified = readyForS16 && byId.get("S16")?.state === "passed"');
  });

  it("requires current S15 physical-ownership evidence instead of accepting legacy zero-orphan files", () => {
    expect(truth).toContain('value.schemaVersion < 4');
    expect(truth).toContain('zeroOwnershipConflicts !== true');
    expect(truth).toContain("S15 schemaVersion must be >= 4 for physical-ownership proof");
  });

  it("retains permanent local-only release-preflight configuration", () => {
    for (const marker of [
      "VITE_SUPABASE_URL: http://127.0.0.1:54321",
      "SUPABASE_URL: http://127.0.0.1:54321",
      "VITE_CONFIRMATIONS_SUPABASE_URL: http://127.0.0.1:54321",
      "CONFIRMATIONS_SUPABASE_URL: http://127.0.0.1:54321",
      "SUPABASE_PROJECT_REF: local",
      "V3_VERIFICATION_TARGET: local",
      "V3_SEED_TARGET: local",
      "V3_CLEANUP_TARGET: local",
      "scripts/check-v3-production-isolation.ts",
    ]) {
      expect(workflow).toContain(marker);
    }
    expect(workflow).not.toContain(".supabase.co");
  });
});
