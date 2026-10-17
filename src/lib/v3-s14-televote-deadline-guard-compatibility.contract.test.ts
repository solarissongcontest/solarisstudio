import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const deadlineGuardRepair = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261017002400_v3_s14_televote_deadline_guard_compatibility.sql",
  ),
  "utf8",
);

const canonicalSubmitRpc = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260819150000_televoting_pre_submit_integrity.sql"),
  "utf8",
);

describe("System V3 S14 Televote deadline guard compatibility", () => {
  it("keeps round lifecycle authority in the governed submit RPC", () => {
    expect(canonicalSubmitRpc).toContain(
      "if v_round.status<>'open' then raise exception 'Round is not open'",
    );
    expect(deadlineGuardRepair).not.toContain("v_status <> 'open'");
    expect(deadlineGuardRepair).not.toContain("raise exception 'Round is not open'");
  });

  it("still enforces every configured deadline at the final ballot row boundary", () => {
    expect(deadlineGuardRepair).toContain(
      "create or replace function private.v3_enforce_televote_submission_deadline()",
    );
    expect(deadlineGuardRepair).toContain("from televoting.rounds");
    expect(deadlineGuardRepair).toContain("if not found then");
    expect(deadlineGuardRepair).toContain(
      "v_deadline is not null and now() >= v_deadline",
    );
    expect(deadlineGuardRepair).toContain("Voting deadline has passed");
  });

  it("preserves the explicit legacy-unbounded compatibility window", () => {
    expect(deadlineGuardRepair).toContain("closes_at IS NULL are explicitly unbounded");
    expect(deadlineGuardRepair).not.toContain("coalesce(v_deadline");
  });
});
