import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20261101172649_v3_confirmation_pending_nf_winner.sql",
);
const guardMigration = source(
  "supabase/migrations/20261101173758_v3_pending_nf_winner_transition_guard.sql",
);
const prefill = source("src/lib/prefill.ts");

describe("National Final pending winner review contract", () => {
  it("adopts the post-S13 migration contract without requiring it on older production stacks", () => {
    expect(migration).toContain("v3_register_migration_contract(");
    expect(migration).toContain(
      "public.v3_register_migration_contract(text,integer,text,boolean,text,text)",
    );
    expect(migration).toContain("v3.confirmation.pending-nf-winner-review");
    expect(migration).toContain("forward_fix_only");
    expect(guardMigration).toContain("v3.confirmation.pending-nf-winner-transition-guard");
  });

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

  it("keeps direct browser writes away from both canonical and pending winner fields", () => {
    expect(guardMigration).toContain("drop trigger if exists studio2_guard_nf_winner_transition");
    expect(guardMigration).toContain(
      "before update of winning_entry_id, pending_winning_entry_id",
    );
    expect(guardMigration).toContain(
      "private.studio2_guard_direct_confirmation_review_transition()",
    );
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
