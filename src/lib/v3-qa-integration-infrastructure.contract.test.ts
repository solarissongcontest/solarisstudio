import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const dashboard = source("scripts/generate-v3-completion-dashboard.ts");
const isolation = source("scripts/check-v3-production-isolation.ts");
const integrity = source("scripts/check-v3-release-integrity.ts");
const statusTransitions = source("scripts/check-v3-capability-status-transitions.ts");
const s14 = source("scripts/check-v3-s14-rehearsal-readiness.ts");
const s15 = source("scripts/check-v3-s15-zero-orphan-readiness.ts");
const quality = source(".github/workflows/ci.yml");
const preflight = source(".github/workflows/v3-release-candidate-preflight.yml");

describe("V3 QA integration infrastructure", () => {
  it("tracks every canonical phase family without collapsing them to one completion boolean", () => {
    for (const marker of ["S0", "S16", "P0", "P50", "O0", "O18", "N0", "N14"]) {
      expect(dashboard).toContain(`id: "${marker}"`);
    }
    expect(dashboard).toContain("missing");
    expect(dashboard).toContain("foundation");
    expect(dashboard).toContain("implemented");
    expect(dashboard).toContain("integrated");
    expect(dashboard).toContain("tested");
    expect(dashboard).toContain("parity");
    expect(dashboard).toContain("cutover");
    expect(dashboard).toContain("certified");
    expect(dashboard).not.toMatch(/completed\s*\/\s*total|completionPercent|percentageComplete/);
  });

  it("keeps current consequence migration evidence distinct from declaration-only registry rows", () => {
    expect(dashboard).toContain('implementationState === "event-backed"');
    expect(dashboard).toContain("declared consequences are event-backed");
    expect(integrity).toContain('implementationState !== "event-backed"');
  });

  it("fails closed on hosted endpoints, hosted project identity, unsafe service-role scope, and destructive targets", () => {
    for (const key of [
      "VITE_SUPABASE_URL",
      "SUPABASE_URL",
      "E2E_SUPABASE_URL",
      "VITE_CONFIRMATIONS_SUPABASE_URL",
      "CONFIRMATIONS_SUPABASE_URL",
      "DATABASE_URL",
      "SUPABASE_PROJECT_REF",
      "SUPABASE_SERVICE_ROLE_KEY",
      "V3_SERVICE_ROLE_SCOPE",
      "V3_SEED_TARGET",
      "V3_CLEANUP_TARGET",
      "V3_DESTRUCTIVE_VERIFICATION",
    ]) {
      expect(isolation).toContain(`"${key}"`);
    }
    expect(isolation).toContain("dkxmnvekiopyesuzggeu");
    expect(isolation).toContain("loopbackHost");
    expect(isolation).toContain("must fail closed");
    expect(isolation).toContain("destructive V3 verification is enabled without any verified loopback");
    expect(isolation).not.toContain("return true; // allow hosted");
  });

  it("pins ordinary and candidate QA environments to explicit local project identity", () => {
    expect(quality).toContain('echo "SUPABASE_PROJECT_ID=local"');
    expect(quality).toContain('echo "SUPABASE_PROJECT_REF=local"');
    expect(quality).toContain('echo "VITE_SUPABASE_PROJECT_ID=local"');
    expect(quality).toContain('echo "VITE_SUPABASE_PROJECT_REF=local"');
    expect(quality).toContain('echo "V3_VERIFICATION_TARGET=local"');
    expect(preflight).toContain("SUPABASE_PROJECT_ID: local");
    expect(preflight).toContain("SUPABASE_PROJECT_REF: local");
    expect(preflight).toContain("VITE_SUPABASE_PROJECT_ID: local");
    expect(preflight).toContain("VITE_SUPABASE_PROJECT_REF: local");
    expect(preflight).toContain("V3_VERIFICATION_TARGET: local");
    expect(preflight).toContain("V3_SEED_TARGET: local");
    expect(preflight).toContain("V3_CLEANUP_TARGET: local");
  });

  it("rejects capability status regressions and retired-state resurrection against an exact base SHA", () => {
    expect(statusTransitions).toContain("backward status transition");
    expect(statusTransitions).toContain("retired is terminal");
    expect(statusTransitions).toContain("requires classification=retire");
    expect(statusTransitions).toContain("capability row disappeared");
    expect(quality).toContain("Enforce V3 capability status transitions on pull requests");
    expect(quality).toContain("github.event.pull_request.base.sha");
    expect(quality).toContain("check-v3-capability-status-transitions.ts");
  });

  it("publishes live dashboard evidence from ordinary Quality CI after canonical registry guards", () => {
    const guardIndex = quality.indexOf(
      "Enforce System V3 S1 dependency and consequence registries",
    );
    const dashboardIndex = quality.indexOf("Generate V3 integration evidence");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(dashboardIndex).toBeGreaterThan(guardIndex);
    expect(quality).toContain("V3_REGISTRY_GUARDS_PASSED=1");
    expect(quality).toContain("v3-completion-dashboard.md");
    expect(quality).toContain("v3-s14-rehearsal-readiness.json");
    expect(quality).toContain("v3-s15-zero-orphan-readiness.json");
    expect(quality).toContain("V3_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(quality).toContain('GITHUB_SHA="$expected" bun run scripts/generate-v3-completion-dashboard.ts');
    expect(quality).toContain("expected exact source SHA");
  });

  it("models S14 as one contest lifecycle and refuses to substitute isolated focused rehearsals", () => {
    for (const stage of [
      "edition setup",
      "delegations",
      "confirmation rounds",
      "participant confirmations",
      "entries",
      "media",
      "Jury",
      "Televote",
      "results",
      "publication",
      "notifications",
      "Organizer tasks",
      "Public projections",
      "archive/history consequences",
    ]) {
      expect(s14).toContain(`"${stage}"`);
    }
    for (const negative of [
      "duplicate confirmation",
      "closed-round submission",
      "unauthorized jury",
      "duplicate vote",
      "wrong-country mutation",
      "network ambiguity and retry",
      "publish before lock",
      "stale notification deep link",
    ]) {
      expect(s14).toContain(`"${negative}"`);
    }
    expect(s14).toContain("focused rehearsals cannot be counted as a full contest");
    expect(s14).toContain("v3-full-contest-rehearsal.sh");
  });

  it("keeps S15 zero-orphan readiness cross-system instead of route-only", () => {
    for (const marker of [
      "SYSTEM_CONCEPT_ORPHAN",
      "PHYSICAL_OWNER_PENDING",
      "CONSEQUENCE_ORPHAN",
      "WORKFLOW_ORPHAN",
      "API_OWNER_ORPHAN",
      "SEARCH_OWNER_ORPHAN",
      "NOTIFICATION_CATEGORY_OWNER_ORPHAN",
      "NOTIFICATION_PROVIDER_OWNER_ORPHAN",
      "PUBLIC_CUTOVER_UNRESOLVED",
      "ORGANIZER_CUTOVER_UNRESOLVED",
    ]) {
      expect(s15).toContain(marker);
    }
  });

  it("binds final release evidence to runtime artifacts for one exact SHA without a self-referential commit", () => {
    expect(preflight).toContain("candidate_sha");
    expect(preflight).toContain("^[0-9a-fA-F]{40}$");
    expect(preflight).toContain("git rev-parse HEAD");
    expect(preflight).toContain('echo "V3_CANDIDATE_SHA=$actual"');
    expect(preflight).toContain('GITHUB_SHA="$expected" bun run scripts/generate-v3-completion-dashboard.ts');
    expect(preflight).toContain("release evidence identity mismatch");
    expect(preflight).toContain("check-v3-release-integrity.ts --release");
    expect(preflight).toContain("not an S16 certificate");
    expect(integrity).toContain("V3_CANDIDATE_SHA");
    expect(integrity).toContain("V3_RELEASE_EVIDENCE_DIR");
    expect(integrity).toContain("self-referential");
    expect(integrity).toContain("--certified");
    expect(integrity).toContain("candidateSha");
    expect(integrity).toContain("s14-full-contest.json");
    expect(integrity).toContain("s15-zero-orphan.json");
    expect(integrity).toContain("security-advisor-classification.json");
    expect(integrity).toContain("s16-certification.json");
  });
});