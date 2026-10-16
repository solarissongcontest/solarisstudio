import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016193700_v3_entry_credits_contract.sql",
);
const rehearsal = source(
  ".github/scripts/v3-entry-credits-rehearsal.sh",
);
const upgrade = source(
  ".github/scripts/v3-production-head-upgrade-rehearsal.sh",
);

describe("System V3 P13 canonical Entry Credits contract", () => {
  it("stores bounded normalized structured credits on both canonical Entry tables", () => {
    expect(migration).toContain("private.v3_normalize_entry_credits");
    expect(migration).toContain("jsonb_array_length(p_credits)");
    expect(migration).toContain("> 32");
    expect(migration).toContain("'composer', 'lyricist', 'songwriter', 'producer', 'arranger', 'other'");
    expect(migration).toContain("char_length(v_name) > 160");
    expect(migration).toContain("add column if not exists credits jsonb not null default '[]'::jsonb");
    expect(migration).toContain("internal_entries_credits_canonical_check");
    expect(migration).toContain("national_final_entries_credits_canonical_check");
  });

  it("preserves historical empty-credit hashes while versioning non-empty Credits", () => {
    expect(migration).toContain("jsonb_array_length(row_data->'credits') > 0");
    expect(migration).toContain("jsonb_build_object('credits', private.v3_normalize_entry_credits");
    expect(rehearsal).toContain("empty backfill rewrote legacy immutable content shape");
    expect(rehearsal).toContain("Credits edit did not create a new immutable version");
    expect(rehearsal).toContain("Credits edit retained stale review authority");
  });

  it("keeps Confirmation as the sole participant writer and normalizes before database-owned idempotency hashing", () => {
    expect(migration).toContain("create or replace function public.v3_submit_confirmation(");
    expect(migration).toContain("v_payload := private.v3_normalize_confirmation_credits_payload(payload)");
    expect(migration).toContain("convert_to((v_payload - 'client_ip')::text, 'UTF8')");
    expect(migration).toContain("public.submit_confirmation(v_payload)");
    expect(migration).toContain("solaris.v3_entry_credits_context");
    expect(migration).not.toContain("grant execute on function public.submit_confirmation(jsonb)");
    expect(rehearsal).toContain("Credits edit exact replay");
    expect(rehearsal).toContain("changed Credits with reused idempotency key");
  });

  it("injects Credits before the existing immutable Entry trigger captures content", () => {
    expect(migration).toContain("v3_00_apply_internal_entry_credits_context");
    expect(migration).toContain("v3_00_apply_nf_entry_credits_context");
    expect(migration).toContain("before insert or update on public.internal_entries");
    expect(migration).toContain("before insert or update on public.national_final_entries");
    expect(migration).toContain("new.credits := private.v3_normalize_entry_credits");
  });

  it("provides an authorized current Credits projection while immutable history remains diff evidence", () => {
    expect(migration).toContain("create or replace function public.v3_confirmation_entry_credits");
    expect(migration).toContain("private.studio2_confirmation_review_context");
    expect(migration).toContain("public.studio2_access_allowed(");
    expect(migration).toContain("public.public_country_account_confirmation_access()");
    expect(migration).toContain("revoke all on function public.v3_confirmation_entry_credits(text, uuid)");
    expect(rehearsal).toContain("participant current Credits projection");
    expect(rehearsal).toContain("history lacks Credits diff evidence");
  });

  it("restores historical Credits inside the same organizer_restore revision", () => {
    expect(migration).toContain("select version.snapshot");
    expect(migration).toContain("v_snapshot -> 'internal'");
    expect(migration).toContain("v_snapshot -> 'nf_entries'");
    expect(migration).toContain("public.admin_restore_confirmation_version_apply(");
    expect(migration).toContain("solaris.v3_restore_submission_version_id");
    expect(migration).toContain("solaris.v3_entry_credits_context");
    expect(rehearsal).toContain("restore created an extra Credits-only revision");
    expect(rehearsal).toContain("organizer_restore");
  });

  it("runs destructive behavior only inside the existing loopback production-head rehearsal", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("http://127.0.0.1:*|http://localhost:*");
    expect(upgrade).toContain("v3-entry-credits-rehearsal.sh");
    expect(rehearsal).not.toContain("supabase.co");
  });
});
