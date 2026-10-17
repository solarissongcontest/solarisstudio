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

  it("uses only disposable local Supabase for the destructive rehearsal", () => {
    expect(workflow).toContain("supabase start");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase status -o env");
    expect(workflow).toContain('export VITE_SUPABASE_URL="$API_URL"');
    expect(workflow).toContain('export DATABASE_URL="$DB_URL"');
    expect(workflow).toContain("SUPABASE_PROJECT_ID=local");
    expect(workflow).toContain("V3_DESTRUCTIVE_VERIFICATION: \"1\"");
    expect(workflow).toContain("V3_SERVICE_ROLE_SCOPE: local");
    expect(workflow).toContain("check-v3-production-isolation.ts");
    expect(workflow).not.toContain("supabase.co");
  });

  it("runs the single stateful driver rather than substituting focused rehearsals", () => {
    expect(workflow).toContain("bash .github/scripts/v3-full-contest-rehearsal.sh");
    expect(workflow).not.toContain("v3-confirmation-security-rehearsal.sh");
    expect(workflow).not.toContain("v3-jury-security-rehearsal.sh");
    expect(workflow).not.toContain("v3-televote-reconciliation-rehearsal.sh");
  });

  it("keeps incomplete S14 evidence explicitly partial and non-certifying", () => {
    expect(workflow).toContain('V3_S14_ALLOW_PARTIAL: "1"');
    expect(workflow).toContain("s14-full-contest.partial.json");
    expect(workflow).toContain("evidence.passed !== false");
    expect(workflow).toContain("evidence.partial !== true");
    expect(workflow).toContain("pendingStages");
    expect(workflow).toContain("It is not release certification");
    expect(workflow).not.toContain("s16-certification.json");
  });

  it("always uploads evidence and stops the local stack", () => {
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("supabase stop --no-backup || true");
    expect(workflow).toContain("retention-days: 30");
  });
});
