import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261016065000_v3_s10_sli_snapshot.sql"), "utf8");
const rehearsal = readFileSync(resolve(process.cwd(), ".github/scripts/v3-s10-sli-snapshot-rehearsal.sh"), "utf8");
const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/v3-s10-sli-snapshot-rehearsal.yml"), "utf8");

describe("System V3 S10 measured SLI snapshot", () => {
  it("collects measured operation and consequence indicators", () => {
    expect(migration).toContain("count(*) filter (where receipt.status = 'succeeded')");
    expect(migration).toContain("count(*) filter (where receipt.status = 'failed')");
    expect(migration).toContain("count(*) filter (where receipt.status = 'uncertain')");
    expect(migration).toContain("count(*) filter (where delivery.status = 'dead_letter')");
    expect(migration).toContain("delivery.attempt_count > 1");
    expect(migration).toContain("averageCompletedLagSeconds");
    expect(migration).toContain("oldestPendingAgeSeconds");
  });

  it("does not invent SLO targets before baseline measurement", () => {
    expect(migration).toContain("'targets', null");
    expect(migration).not.toContain("99.9");
    expect(rehearsal).toContain("without invented targets");
  });

  it("bounds diagnostic query cost and requires system.read", () => {
    expect(migration).toContain("studio2_access_allowed('system.read', null, false)");
    expect(migration).toContain("v_window not between 5 and 10080");
    expect(rehearsal).toContain("too-small SLI window");
    expect(rehearsal).toContain("too-large SLI window");
  });

  it("rehearses locally without deleting newer main migrations", () => {
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).toContain("20261016065000_v3_s10_sli_snapshot.sql");
    expect(workflow).toContain('cmp -s "$feature_migration" "$target"');
    expect(workflow).toContain('cp "$feature_migration" "$target"');
    expect(workflow).not.toContain("rsync");
    expect(workflow).not.toContain("--delete");
    expect(workflow).not.toMatch(/supabase\.co/i);
  });
});
