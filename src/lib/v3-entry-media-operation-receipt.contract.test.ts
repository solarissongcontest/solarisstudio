import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authority = readFileSync(
  "supabase/migrations/20261019235500_v3_p14_entry_media_participant_authority.sql",
  "utf8",
);
const receipt = readFileSync(
  "supabase/migrations/20261019235900_v3_p14_entry_media_commit_receipt.sql",
  "utf8",
);

describe("V3 P14 Entry media migration and receipt authority", () => {
  it("adopts both P14 migrations under the hard S13 contract", () => {
    expect(authority).toContain("public.v3_register_migration_contract(");
    expect(authority).toContain("'v3.public.p14-entry-media-participant-authority'");
    expect(receipt).toContain("public.v3_register_migration_contract(");
    expect(receipt).toContain("'v3.public.p14-entry-media-commit-receipt'");
    expect(authority).toContain("'forward_fix_only'");
    expect(receipt).toContain("'forward_fix_only'");
  });

  it("claims the shared S2 operation before authoritative Entry metadata mutation", () => {
    const claim = receipt.indexOf("private.studio2_claim_operation(");
    const mutation = receipt.indexOf("update public.entries");

    expect(claim).toBeGreaterThan(-1);
    expect(mutation).toBeGreaterThan(claim);
    expect(receipt).toContain("'entry.media.commit'");
    expect(receipt).toContain("'R2'");
    expect(receipt).toContain("'entry-media-commit:' || p_token_id::text");
  });

  it("uses the server-minted upload token as stable operation and receipt identity", () => {
    expect(receipt).toContain("p_token_id,\n    'entry-media-commit:' || p_token_id::text");
    expect(receipt).toContain("'operationId', p_token_id");
    expect(receipt).toContain("'receiptId', p_token_id");
    expect(receipt).toContain("private.studio2_complete_operation(p_token_id, v_result)");
  });

  it("does not blindly retry an uncertain canonical commit", () => {
    expect(receipt).toContain("v_claim ->> 'status' = 'succeeded'");
    expect(receipt).toContain("public.studio2_reconcile_operation(p_token_id)");
    expect(receipt).toContain("'reconciliationRequired', true");
  });

  it("preserves exact Entry/delegation scope and per-slot optimistic concurrency", () => {
    expect(receipt).toContain("private.v3_next_in_line_actor_controls_country(");
    expect(receipt).toContain("'entryId', v_entry.id");
    expect(receipt).toContain("'assetType', v_asset_type");
    expect(receipt).toContain("v_current_source is distinct from v_expected_source");
    expect(receipt).toContain("message = 'STATE_CHANGED'");
  });

  it("never lets transmission or verification alone manufacture Organizer acceptance", () => {
    expect(receipt).toContain("'state', 'validating'");
    expect(receipt).not.toContain("'state', 'accepted'");
    expect(authority).toContain("review.decision = 'approved'");
    expect(authority).toContain("v_state := 'accepted'");
  });
});
