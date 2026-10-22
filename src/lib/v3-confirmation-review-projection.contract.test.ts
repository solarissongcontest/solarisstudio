import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019212000_v3_confirmation_review_projection.sql",
  ),
  "utf8",
);

const readAuthority = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261017143200_confirmation_maintenance_read_authority.sql",
  ),
  "utf8",
);

describe("V3 exact-edition Confirmation review projection", () => {
  it("registers an additive S13 contract and preserves the legacy all-editions RPC", () => {
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain(
      "'20261019212000_v3_confirmation_review_projection'",
    );
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      "create or replace function public.admin_confirmation_responses_v2(",
    );
    expect(migration).not.toContain(
      "create or replace function public.admin_confirmation_responses()",
    );
  });

  it("requires an exact edition and uses the canonical read-only capability predicate", () => {
    expect(migration).toContain("p_edition_id uuid");
    expect(migration).toContain(
      "private.solaris_confirmation_admin_read_allowed(p_edition_id, false)",
    );
    expect(readAuthority).toContain("'confirmation.read'");
    expect(migration).toContain("message = 'EDITION_NOT_FOUND'");
    expect(migration).toContain("message = 'AUTHORIZATION'");
  });

  it("never broadens the response query beyond the requested edition", () => {
    const editionPredicates = migration.match(
      /submission\.edition_id = p_edition_id/g,
    );
    expect(editionPredicates?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(migration).not.toContain("p_edition_id is null or");
    expect(migration).not.toContain("admin_confirmation_responses()");
  });

  it("bounds every page and uses a stable two-column keyset cursor", () => {
    expect(migration).toContain(
      "least(greatest(coalesce(p_limit, 100), 1), 200)",
    );
    expect(migration).toContain("p_before_submitted_at timestamptz default null");
    expect(migration).toContain("p_before_submission_id uuid default null");
    expect(migration).toContain(
      "(submission.submitted_at, submission.id)\n           < (p_before_submitted_at, p_before_submission_id)",
    );
    expect(migration).toContain(
      "order by submission.submitted_at desc, submission.id desc",
    );
    expect(migration).toContain("limit v_limit + 1");
    expect(migration).toContain("'hasMore', v_has_more");
    expect(migration).toContain("'nextCursor'");
  });

  it("preserves the legacy review-list data while adding canonical stale-state identity", () => {
    for (const field of [
      "'country', submission.country",
      "'participating', submission.participating",
      "'selection_method', submission.selection_method",
      "'submission_rounds'",
      "'editions'",
      "'internal_entries'",
      "'national_finals'",
    ]) {
      expect(migration).toContain(field);
    }

    expect(migration).toContain("'review_version', coalesce(review_version.version, 1)");
    expect(migration).toContain("'current_version_id', internal_entry.current_version_id");
    expect(migration).toContain("'reviewed_version_id', internal_entry.reviewed_version_id");
    expect(migration).toContain("'content_revision', internal_entry.content_revision");
    expect(migration).toContain("'current_version_id', nf_entry.current_version_id");
  });

  it("returns projection metadata sufficient for reconciliation without exposing raw history", () => {
    expect(migration).toContain("'schemaVersion', 1");
    expect(migration).toContain("'editionId', p_edition_id");
    expect(migration).toContain("'totalCount', v_total_count");
    expect(migration).toContain("'stateVersion', v_state_version");
    expect(migration).toContain("'serverTime', now()");
    expect(migration).not.toContain("submission_review_history");
    expect(migration).not.toContain("recovery_code");
  });

  it("keeps the SECURITY DEFINER RPC narrow", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("to authenticated;");
  });
});
