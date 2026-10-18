import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/v3-s14-stateful-rehearsal.yml", "utf8");

describe("S14 stateful runtime workflow", () => {
  it("is manual and exact-SHA bound instead of running destructive fixtures on every push", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("candidate_sha:");
    expect(workflow).toContain("^[0-9a-fA-F]{40}$");
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("V3_CANDIDATE_SHA=$actual");
  });

  it("supports developmental partial runs and strict complete-candidate runs without weakening either", () => {
    expect(workflow).toContain("require_complete:");
    expect(workflow).toContain("V3_S14_ALLOW_PARTIAL=0");
    expect(workflow).toContain("V3_S14_ALLOW_PARTIAL=1");
    expect(workflow).toContain("V3_S14_REQUIRE_COMPLETE=1");
    expect(workflow).toContain("complete S14 was required but the candidate emitted only partial evidence");
  });

  it("uses only disposable loopback Supabase for the destructive rehearsal", () => {
    expect(workflow).toContain("supabase start");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase status -o env");
    expect(workflow).toContain("LOCAL_SUPABASE_URL: http://127.0.0.1:54321");
    expect(workflow).toContain('[[ "$API_URL" != "$LOCAL_SUPABASE_URL" ]]');
    expect(workflow).toContain("Refusing audit server with hosted Supabase URL");
    expect(workflow).toContain('export VITE_SUPABASE_URL="$API_URL"');
    expect(workflow).toContain('export DATABASE_URL="$DB_URL"');
    expect(workflow).toContain("SUPABASE_PROJECT_ID=local");
    expect(workflow).toContain('V3_DESTRUCTIVE_VERIFICATION: "1"');
    expect(workflow).toContain("V3_SERVICE_ROLE_SCOPE: local");
    expect(workflow).toContain("check-v3-production-isolation.ts");
    expect(workflow).not.toContain("supabase.co");
  });

  it("runs one stateful driver rather than substituting focused rehearsals", () => {
    expect(workflow).toContain("bash .github/scripts/v3-full-contest-rehearsal.sh");
    expect(workflow).not.toContain("v3-confirmation-security-rehearsal.sh");
    expect(workflow).not.toContain("v3-jury-security-rehearsal.sh");
    expect(workflow).not.toContain("v3-televote-reconciliation-rehearsal.sh");
  });

  it("rejects ambiguous, stale, or semantically false S14 evidence", () => {
    expect(workflow).toContain("S14 emitted both final and partial evidence for one candidate");
    expect(workflow).toContain("S14 emitted neither final nor partial evidence");
    expect(workflow).toContain("S14 final evidence SHA mismatch");
    expect(workflow).toContain("S14 partial evidence SHA mismatch");
    expect(workflow).toContain("Release-grade S14 evidence must prove passed=true");
    expect(workflow).toContain("Release-grade S14 evidence cannot be marked partial");
    expect(workflow).toContain("Release-grade S14 evidence still has pending stages");
    expect(workflow).toContain("Release-grade S14 evidence still has blocked contest extensions");
    expect(workflow).toContain("Incomplete S14 must remain explicit passed=false, partial=true evidence");
    expect(workflow).toContain("Partial S14 evidence must identify at least one unfinished stage or blocked contest extension");
  });

  it("keeps S14 evidence separate from S16 certification", () => {
    expect(workflow).toContain("s14-full-contest.json");
    expect(workflow).toContain("s14-full-contest.partial.json");
    expect(workflow).toContain("does not emit S16 certification semantics");
    expect(workflow).not.toContain("s16-certification.json");
  });

  it("always uploads evidence and stops the disposable local stack", () => {
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("supabase stop --no-backup || true");
    expect(workflow).toContain("retention-days: 30");
  });
});
