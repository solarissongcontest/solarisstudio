import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const s14 = read(".github/workflows/v3-s14-full-contest-rehearsal.yml");
const s15 = read(".github/workflows/v3-s15-zero-orphan-certification.yml");
const inventory = read("scripts/check-v3-s15-zero-orphan-readiness-core.ts");
const evidence = read("scripts/build-v3-s15-zero-orphan-evidence.ts");
const classifier = read("scripts/v3-s15-cutover-risk-gate.mjs");

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
    expect(s15).not.toContain("continue-on-error: true");
    expect(s15).toContain("Validate exact-SHA S15 inventory and block structural ownership violations");
    expect(s15).toContain("if: always()");
    expect(s15).toContain("if-no-files-found: error");
    expect(s15).toContain("node scripts/v3-s15-cutover-risk-gate.mjs");
    expect(classifier).toContain("evidence?.candidateSha !== candidateSha");
    expect(classifier).toContain("summary.structuralFindings.length");
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

  it("keeps raw cutover debt in PR evidence but requires zero unresolved findings for full release", () => {
    expect(s15).toContain("Produce exact-SHA S15 inventory, including unfinished cutovers");
    expect(s15).toContain("bun run scripts/build-v3-s15-zero-orphan-evidence.ts");
    expect(s15).toContain("node --test scripts/v3-s15-cutover-risk-gate.test.mjs");
    expect(s15).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(s15).toContain("Enforce full-release S15 zero-orphan contract");
    expect(s15).toContain("--full-release");
    expect(s15).toContain("build-v3-s15-zero-orphan-evidence.ts --require-zero");
    expect(classifier).toContain("const pendingCutovers = evidence.findings.filter");
    expect(classifier).toContain("const structuralFindings = evidence.findings.filter");
    expect(classifier).toContain("summary.physicalOwnershipClear");
    expect(classifier).toContain("if (fullRelease && !summary.zeroOrphans)");
    expect(classifier).toContain("Full V3 release S15 zero-orphan gate failed");
    expect(s15).not.toContain("continue-on-error: true");
  });

  it("never exposes hosted Supabase to the new CI producer", () => {
    expect(s15).toContain("VITE_SUPABASE_URL: http://127.0.0.1:54321");
    expect(s15).toContain("VITE_CONFIRMATIONS_SUPABASE_URL: http://127.0.0.1:54321");
    expect(s15).toContain("SUPABASE_PROJECT_REF: local");
    expect(s15).not.toMatch(/https:\/\/[^\s"']+\.supabase\.co/i);
    expect(s15).not.toMatch(/\$\{\{\s*secrets\./);
  });
});
