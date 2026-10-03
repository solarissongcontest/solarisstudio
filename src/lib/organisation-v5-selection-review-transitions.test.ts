import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 selection review transitions", () => {
  const migration = source(
    "supabase/migrations/20261003180000_organisation_os_v5_selection_review_transitions.sql",
  );
  const route = source("src/routes/confirmations/admin/responses/$id.tsx");

  it("versions the whole submission review truth", () => {
    expect(migration).toContain("studio2_confirmation_review_versions");
    expect(migration).toContain("studio2_touch_confirmation_review_version");
    expect(migration).toContain("on public.internal_entries");
    expect(migration).toContain("on public.national_final_entries");
    expect(migration).toContain("on public.national_finals");
    expect(migration).toContain(
      "public.studio2_confirmation_review_versions.version + 1",
    );
  });

  it("previews and applies entry review through one versioned R2 operation", () => {
    expect(migration).toContain("studio2_confirmation_entry_review_preview");
    expect(migration).toContain("studio2_apply_confirmation_entry_review");
    expect(migration).toContain("private.studio2_claim_operation");
    expect(migration).toContain("'confirmation.entry.review'");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("p_expected_version bigint");
    expect(migration).toContain("using errcode = '40001'");
    expect(route).toContain('"studio2_confirmation_entry_review_preview"');
    expect(route).toContain('"studio2_apply_confirmation_entry_review"');
  });

  it("keeps internal and National Final state vocabularies distinct", () => {
    expect(migration).toContain(
      "v_target_status not in ('pending', 'accepted', 'declined')",
    );
    expect(migration).toContain(
      "v_target_status not in ('pending', 'accepted', 'declined', 'removed')",
    );
    expect(migration).toContain("removed = v_target_status = 'removed'");
  });

  it("never lets a winning NF candidate become non-accepted silently", () => {
    expect(migration).toContain(
      "Clear the National Final winner before changing its accepted review state",
    );
    expect(migration).toContain(
      "Only an accepted active National Final candidate can be selected as winner",
    );
  });

  it("versions winner select and clear and rejects stale mutations", () => {
    expect(migration).toContain("studio2_confirmation_winner_change_preview");
    expect(migration).toContain("studio2_apply_confirmation_winner_change");
    expect(migration).toContain("'confirmation.nf_winner.' || v_action");
    expect(migration).toContain("'winner_selected'");
    expect(migration).toContain("'winner_cleared'");
    expect(migration).toContain(
      "National Final winner state changed since this preview was loaded.",
    );
    expect(route).toContain('"studio2_confirmation_winner_change_preview"');
    expect(route).toContain('"studio2_apply_confirmation_winner_change"');
  });

  it("closes direct browser and legacy RPC bypasses", () => {
    expect(migration).toContain(
      "Selection review transitions must use the Organisation OS V5 operation contract.",
    );
    expect(migration).toContain(
      "before update of review_status, review_reason, reviewed_at, reviewed_by",
    );
    expect(migration).toContain("before update of winning_entry_id");
    expect(migration).toContain(
      "drop function if exists public.admin_review_confirmation_entry",
    );
    expect(migration).toContain(
      "drop function if exists public.admin_set_confirmation_winner",
    );
    expect(migration).toContain(
      "drop function if exists public.admin_clear_confirmation_winner",
    );

    expect(route).not.toContain('"admin_review_confirmation_entry"');
    expect(route).not.toContain('"admin_set_confirmation_winner"');
    expect(route).not.toContain('"admin_clear_confirmation_winner"');
  });

  it("keeps one operation identity per mutation attempt", () => {
    expect(route).toContain("createOrganisationCommand");
    expect(route).toContain("p_operation_id: command.operationId");
    expect(route).toContain("p_idempotency_key: command.idempotencyKey");
    expect(route).toContain("p_expected_version: preview.expectedVersion");
  });
});
