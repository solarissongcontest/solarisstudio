import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20261101172500_v3_confirmation_pending_nf_winner.sql",
);
const prefill = source("src/lib/prefill.ts");

describe("National Final pending winner review contract", () => {
  it("keeps participant winner intent separate from the exact-reviewed canonical winner", () => {
    expect(migration).toContain("pending_winning_entry_id uuid");
    expect(migration).toContain("solaris.v3_confirmation_participant_write");
    expect(migration).toContain("new.pending_winning_entry_id := new.winning_entry_id");
    expect(migration).toContain("new.winning_entry_id := case");
    expect(migration).toContain("then old.winning_entry_id");
  });

  it("does not weaken exact-version winner enforcement for non-participant operations", () => {
    expect(migration).toContain(
      "raise exception 'Review the exact current National Final entry version before selecting it as winner'",
    );
    expect(migration).toContain("candidate.reviewed_version_id is not distinct from candidate.current_version_id");
    expect(migration).toContain("candidate.review_status = 'accepted'");
  });

  it("clears an effective winner before participant edits invalidate its reviewed content", () => {
    expect(migration).toContain("v3_00_stage_current_nf_winner_before_participant_entry_edit");
    expect(migration).toContain(
      "private.v3_entry_content(to_jsonb(new)) is distinct from private.v3_entry_content(to_jsonb(old))",
    );
    expect(migration).toContain("set winning_entry_id = null");
  });

  it("promotes staged intent only after the exact pending version is accepted", () => {
    expect(migration).toContain("v3_promote_pending_nf_winner_after_review");
    expect(migration).toContain("new.review_status = 'accepted'");
    expect(migration).toContain("new.reviewed_version_id is not distinct from new.current_version_id");
    expect(migration).toContain("set winning_entry_id = new.id");
    expect(migration).toContain("pending_winning_entry_id = null");
  });

  it("restores staged winner intent when the participant reopens the editor", () => {
    expect(prefill).toContain(
      "nf?.pending_winning_entry_id ?? nf?.winning_entry_id ?? null",
    );
  });
});
