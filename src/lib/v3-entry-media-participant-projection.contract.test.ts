import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019235500_v3_participant_entry_media_projection.sql",
  ),
  "utf8",
);

describe("V3 participant Entry-media projection", () => {
  it("binds participant reads to the authenticated active country account", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("from public.country_accounts account");
    expect(migration).toContain("account.user_id = v_actor");
    expect(migration).toContain("account.country_id = v_entry.country_id");
    expect(migration).toContain("account.status = 'active'");
    expect(migration).not.toMatch(/p_country_id\s+uuid/);
    expect(migration).not.toMatch(/p_delegation_id\s+uuid/);
  });

  it("derives state from the exact current canonical media source", () => {
    expect(migration).toContain("private.studio2_resolve_media_asset_source");
    expect(migration).toContain("review.source_fingerprint = v_source");
    expect(migration).toContain("review.superseded_at is null");
    expect(migration).toContain("v_review.decision = 'approved'");
    expect(migration).toContain("v_review.decision = 'invalid'");
    expect(migration).toContain("v_state := 'accepted'");
    expect(migration).toContain("v_state := 'replacement_required'");
    expect(migration).toContain("v_state := 'processing'");
    expect(migration).toContain("v_state := 'validating'");
  });

  it("keeps Organizer-only evidence and raw media sources out of the payload", () => {
    const payloadStart = migration.indexOf("v_assets := v_assets || jsonb_build_array");
    expect(payloadStart).toBeGreaterThanOrEqual(0);
    const payloadEnd = migration.indexOf("end loop;", payloadStart);
    const payload = migration.slice(payloadStart, payloadEnd);

    expect(payload).toContain("'assetKey'");
    expect(payload).toContain("'assetType'");
    expect(payload).toContain("'state'");
    expect(payload).toContain("'reason'");
    expect(payload).toContain("'sourceVersion', md5(v_source)");
    expect(payload).toContain("'updatedAt'");
    expect(payload).not.toContain("'sourceUrl'");
    expect(payload).not.toContain("'reviewedBy'");
    expect(payload).not.toContain("'authorization_secret'");
    expect(payload).not.toContain("'quarantine_path'");
  });

  it("does not turn an empty slot into fabricated failure truth", () => {
    expect(migration).toContain("if nullif(btrim(coalesce(v_source, '')), '') is null then");
    expect(migration).toContain("continue;");
    expect(migration).not.toContain("v_state := 'failed'");
    expect(migration).not.toContain("v_state := 'quarantined'");
  });

  it("keeps the participant RPC unavailable to anonymous callers", () => {
    expect(migration).toContain("raise exception 'Authentication required'");
    expect(migration).toContain(
      "revoke all on function public.studio2_my_entry_media(uuid)\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_my_entry_media(uuid)\n  to authenticated, service_role;",
    );
  });
});
