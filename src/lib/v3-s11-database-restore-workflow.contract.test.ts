import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/v3-s11-database-restore-rehearsal.yml"),
  "utf8",
);

describe("System V3 S11 database restore workflow contract", () => {
  it("runs the real dump/restore rehearsal on the exact PR head", () => {
    expect(workflow).toContain("Checkout exact source");
    expect(workflow).toContain("github.event.pull_request.head.sha || github.sha");
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("bash .github/scripts/v3-s11-database-restore-rehearsal.sh");
    expect(workflow).toContain("V3_RECOVERY_EVIDENCE_SHA: ${{ steps.source.outputs.sha }}");
  });

  it("rebuilds only isolated local Supabase before the restore drill", () => {
    expect(workflow).toContain("supabase/setup-cli@v1");
    expect(workflow).toContain("version: 2.113.0");
    expect(workflow).toContain("supabase start");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase status -o env");
    expect(workflow).toContain("Refusing non-loopback DB_URL");
    expect(workflow).toContain("supabase stop --no-backup || true");
    expect(workflow).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD");
    expect(workflow).not.toContain("project-ref");
    expect(workflow).not.toContain("supabase link");
  });

  it("requires canonical restore evidence without provider or release overclaims", () => {
    expect(workflow).toContain("database_restore_rehearsal");
    expect(workflow).toContain("isolated_local_supabase");
    expect(workflow).toContain("pg_dump_custom");
    expect(workflow).toContain("criticalRelationFingerprints");
    expect(workflow).toContain("operationReceiptsPresent");
    expect(workflow).toContain("domainEventsPresent");
    expect(workflow).toContain("domainEventOutboxPresent");
    expect(workflow).toContain('evidence["issuesFound"] == []');
    expect(workflow).toContain('evidence["achieved"]["providerRpoClaim"] is False');
    expect(workflow).toContain('evidence["achieved"]["providerRtoClaim"] is False');
    expect(workflow).toContain('evidence["certificationClaim"] is False');
    expect(workflow).toContain('evidence["qaReviewRequired"] is True');
  });

  it("retains exact-head database recovery evidence as a bounded artifact", () => {
    expect(workflow).toContain("v3-s11-database-restore-evidence");
    expect(workflow).toContain("/tmp/v3-s11-database-restore.json");
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).toContain("retention-days: 14");
  });
});
