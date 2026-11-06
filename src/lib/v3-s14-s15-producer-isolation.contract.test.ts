import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const s14 = read(".github/workflows/v3-s14-full-contest-rehearsal.yml");
const s15 = read(".github/workflows/v3-s15-zero-orphan-certification.yml");
const inventory = read("scripts/check-v3-s15-zero-orphan-readiness-core.ts");
const evidence = read("scripts/build-v3-s15-zero-orphan-evidence.ts");

describe("S14 and S15 exact-SHA evidence producers", () => {
  it("keeps S14's complete contest lifecycle and failure evidence independent from unfinished S15 cutover", () => {
    expect(s14).toContain("name: S14 full contest lifecycle through Archive (exact SHA)");
    expect(s14).toContain("Run complete one-state S14 contest lifecycle");
    expect(s14).toContain("Validate exact-SHA S14 evidence");
    expect(s14).toContain("data.get(\"completedStages\") != expected_stages");
    expect(s14).toContain("Release-grade S14 evidence valid for exact candidate");
    expect(s14).toContain("Upload exact-SHA S14 evidence");
    expect(s14).not.toContain("Build exact-SHA S15 zero-orphan evidence");
    expect(s14).not.toContain("scripts/check-v3-s15-zero-orphan-readiness.ts --require-zero");
  });

  it("requires S15 independently on the exact candidate with its own blocking status", () => {
    expect(s15).toContain("branches: [main]");
    expect(s15).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(s15).toContain("git rev-parse HEAD");
    expect(s15).toContain("build-v3-s15-zero-orphan-evidence.ts --require-zero");
    expect(s15).toContain("RELEASE_GATE: ${{ github.event_name == 'workflow_dispatch' }}");
    expect(s15).toContain('if [[ "$RELEASE_GATE" == "true" ]]');
    expect(s15).toContain("S15 physical ownership conflicts require repair before integration");
    expect(s15).toContain("CUTOVER_UNRESOLVED ");
        expect(s15).not.toContain("continue-on-error: true");
    expect(s15).toContain("Validate S15 evidence integrity even after a failed gate");
    expect(s15).toContain("if: always()");
    expect(s15).toContain("if-no-files-found: error");
    expect(s15).toContain("evidence.candidateSha !== sha");
    expect(s15).toContain("evidence.findings.length !== 0");
  });

  it("preserves unresolved Public and Organizer cutover inventory instead of concealing it", () => {
    expect(inventory).toContain("PUBLIC_CUTOVER_UNRESOLVED");
    expect(inventory).toContain("ORGANIZER_CUTOVER_UNRESOLVED");
    expect(inventory).toContain("findings.push(`PUBLIC_CUTOVER_UNRESOLVED");
    expect(inventory).toContain("findings.push(`ORGANIZER_CUTOVER_UNRESOLVED");
    expect(inventory).toContain("if (requireZero && findings.length) process.exit(1)");
    expect(evidence).toContain("...readiness,");
    expect(evidence).toContain("if (requireZero && readiness.zeroOrphans !== true) process.exit(1)");
  });

  it("never exposes hosted Supabase to the new CI producer", () => {
    expect(s15).toContain("VITE_SUPABASE_URL: http://127.0.0.1:54321");
    expect(s15).toContain("VITE_CONFIRMATIONS_SUPABASE_URL: http://127.0.0.1:54321");
    expect(s15).toContain("SUPABASE_PROJECT_REF: local");
    expect(s15).not.toMatch(/https:\/\/[^\s"']+\.supabase\.co/i);
    expect(s15).not.toMatch(/\$\{\{\s*secrets\./);
  });
});
