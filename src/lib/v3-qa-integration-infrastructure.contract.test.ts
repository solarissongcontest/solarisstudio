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
const s15Core = source("scripts/check-v3-s15-zero-orphan-readiness-core.ts");
const quality = source(".github/workflows/ci.yml");
const preflight = source(".github/workflows/v3-release-candidate-preflight.yml");

describe("V3 QA integration infrastructure", () => {
  it("tracks every canonical phase family without collapsing them to one completion boolean", () => {
    for (const marker of ["S0", "S16", "P0", "P50", "O0", "O18", "N0", "N14"]) expect(dashboard).toContain(`id: "${marker}"`);
    for (const status of ["missing", "foundation", "implemented", "integrated", "tested", "parity", "cutover", "certified"]) expect(dashboard).toContain(status);
    expect(dashboard).not.toMatch(/completed\s*\/\s*total|completionPercent|percentageComplete/);
  });

  it("keeps current consequence migration evidence distinct from declaration-only registry rows", () => {
    expect(dashboard).toContain('implementationState === "event-backed"');
    expect(dashboard).toContain("declared consequences are event-backed");
    expect(integrity).toContain('implementationState !== "event-backed"');
  });

  it("fails closed on hosted endpoints, hosted project identity, unsafe service-role scope, and destructive targets", () => {
    for (const key of ["VITE_SUPABASE_URL", "SUPABASE_URL", "E2E_SUPABASE_URL", "VITE_CONFIRMATIONS_SUPABASE_URL", "CONFIRMATIONS_SUPABASE_URL", "DATABASE_URL", "SUPABASE_PROJECT_REF", "SUPABASE_SERVICE_ROLE_KEY", "V3_SERVICE_ROLE_SCOPE", "V3_SEED_TARGET", "V3_CLEANUP_TARGET", "V3_DESTRUCTIVE_VERIFICATION"]) expect(isolation).toContain(`"${key}"`);
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
    const guardIndex = quality.indexOf("Enforce System V3 S1 dependency and consequence registries");
    const dashboardIndex = quality.indexOf("Generate V3 integration evidence");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(dashboardIndex).toBeGreaterThan(guardIndex);
    expect(quality).toContain("V3_REGISTRY_GUARDS_PASSED=1");
    expect(quality).toContain("v3-completion-dashboard.md");
    expect(quality).toContain("v3-s14-rehearsal-readiness.json");
    expect(quality).toContain("v3-s15-zero-orphan-readiness.json");
    expect(quality).toContain("V3_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(quality).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(quality).toContain('checkout_sha="$(git rev-parse HEAD');
    expect(quality).toContain("V3 evidence checkout is $checkout_sha, expected exact source SHA $expected");
    expect(quality).toContain('GITHUB_SHA="$expected" bun run scripts/generate-v3-completion-dashboard.ts');
    expect(quality).toContain("expected exact source SHA");
  });

  it("models S14 as one contest lifecycle and refuses to substitute isolated focused rehearsals", () => {
    for (const stage of ["edition setup", "delegations", "confirmation rounds", "participant confirmations", "entries", "media", "Jury", "Televote", "results", "publication", "notifications", "Organizer tasks", "Public projections", "archive/history consequences"]) expect(s14).toContain(`"${stage}"`);
    for (const negative of ["duplicate confirmation", "closed-round submission", "unauthorized jury", "duplicate vote", "wrong-country mutation", "network ambiguity and retry", "publish before lock", "stale notification deep link"]) expect(s14).toContain(`"${negative}"`);
    expect(s14).toContain("focused rehearsals cannot be counted as a full contest");
    expect(s14).toContain("v3-full-contest-rehearsal.sh");
  });

  it("keeps S15 zero-orphan readiness cross-system instead of route-only", () => {
    for (const marker of ["SYSTEM_CONCEPT_ORPHAN", "PHYSICAL_OWNER_PENDING", "CONSEQUENCE_ORPHAN", "WORKFLOW_ORPHAN", "API_OWNER_ORPHAN", "SEARCH_OWNER_ORPHAN", "NOTIFICATION_CATEGORY_OWNER_ORPHAN", "NOTIFICATION_PROVIDER_OWNER_ORPHAN", "PUBLIC_CUTOVER_UNRESOLVED", "ORGANIZER_CUTOVER_UNRESOLVED"]) expect(`${s15}\n${s15Core}`).toContain(marker);
  });

  it("rescans every canonical S15 discovery surface in the final zero-orphan report", () => {
    expect(s15).toContain("check-v3-s15-zero-orphan-readiness-core.ts");
    expect(s15).toContain("...core.inventory");

    for (const marker of [
      "SYSTEM_COMMAND_ORPHAN",
      "SYSTEM_EVENT_ORPHAN",
      "SYSTEM_PROJECTION_ORPHAN",
      "SYSTEM_JOB_ORPHAN",
      "PUBLIC_LEGACY_ALIAS_ORPHAN",
      "ORGANIZER_LEGACY_ALIAS_ORPHAN",
      "RUNTIME_API_ROUTE_ORPHAN",
      "ORGANIZER_CONTROL_ROUTE_ORPHAN",
      "PUBLIC_SURFACE_ROUTE_ORPHAN",
      "FEATURE_FLAG_ORPHAN",
      "ORGANIZER_CONTROL_ORPHAN",
      "PUBLIC_SOURCE_SURFACE_ORPHAN",
      "NOTIFICATION_DEEP_LINK_ORPHAN",
      "NOTIFICATION_DYNAMIC_DEEP_LINK_ORPHAN",
    ]) expect(s15Core).toContain(marker);
    for (const inventoryKey of [
      "runtimeRoutes",
      "legacyAliases",
      "v3FeatureFlags",
      "organizerControls",
      "publicSourceSurfaces",
      "notificationDeepLinks",
    ]) expect(s15Core).toContain(inventoryKey);
    expect(s15Core).toContain("src/routes");
    expect(s15Core).toContain("SOLARIS_FEATURE_FLAGS");
    expect(s15Core).toContain("SOLARIS_V6_FEATURE_SURFACES");
    expect(s15Core).toContain("V3_ORGANIZER_DISCOVERED_IDS");
  });

  it("binds release evidence and fail-closed manifest generation to one exact SHA", () => {
    expect(preflight).toContain("candidate_sha");
    expect(preflight).toContain("^[0-9a-fA-F]{40}$");
    expect(preflight).toContain("git rev-parse HEAD");
    expect(preflight).toContain('echo "V3_CANDIDATE_SHA=$actual"');
    expect(preflight).toContain('GITHUB_SHA="$expected" bun run scripts/generate-v3-completion-dashboard.ts');
    expect(preflight).toContain("release evidence identity mismatch");
    expect(preflight).toContain("check-v3-s16-mutation-authority.ts --static");
    expect(preflight).toContain("check-v3-results-integration.ts");
    expect(preflight).toContain("check-v3-release-integrity.ts --release");
    expect(preflight).toContain("Discovery is not a release certificate");
    expect(preflight).toContain("build-v3-release-manifest.ts");
    expect(integrity).toContain("V3_CANDIDATE_SHA");
    expect(integrity).toContain("V3_RELEASE_EVIDENCE_DIR");
    expect(integrity).toContain("releaseEvidenceDir");
    expect(integrity).toContain("--certified");
    expect(integrity).toContain("candidateSha");
    expect(integrity).toContain("s14-full-contest.json");
    expect(integrity).toContain("s15-zero-orphan.json");
    expect(integrity).toContain("s16-mutation-authority.json");
    expect(integrity).toContain("security-advisor-classification.json");
    expect(integrity).toContain("results-integration.json");
  });
});
