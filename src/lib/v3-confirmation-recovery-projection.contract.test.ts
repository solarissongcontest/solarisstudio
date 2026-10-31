import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019212100_v3_confirmation_recovery_projection.sql",
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

describe("V3 exact-edition Confirmation recovery projection", () => {
  it("registers an additive S13 contract without replacing the legacy global RPC", () => {
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain(
      "'20261019212100_v3_confirmation_recovery_projection'",
    );
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      "create or replace function public.admin_confirmation_recovery_codes_v2(",
    );
    expect(migration).not.toContain(
      "create or replace function public.admin_confirmation_recovery_codes()",
    );
  });

  it("requires authentication and exact-edition Confirmation read authority", () => {
    expect(migration).toContain("if auth.uid() is null then");
    expect(migration).toContain("p_edition_id uuid");
    expect(migration).toContain(
      "private.solaris_confirmation_admin_read_allowed(p_edition_id, false)",
    );
    expect(readAuthority).toContain("'confirmation.read'");
    expect(migration).toContain("message = 'EDITION_NOT_FOUND'");
    expect(migration).toContain("message = 'AUTHORIZATION'");
  });

  it("filters sensitive credentials on the server and never broadens edition scope", () => {
    const editionPredicates = migration.match(
      /submission\.edition_id = p_edition_id/g,
    );
    expect(editionPredicates?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("submission.recovery_code is not null");
    expect(migration).not.toContain("p_edition_id is null or");
    expect(migration).not.toContain("admin_confirmation_recovery_codes()");
  });

  it("returns only the legacy minimum recovery-access fields", () => {
    for (const field of [
      "'id', submission.id",
      "'country', submission.country",
      "'instagram_username', submission.instagram_username",
      "'recovery_code', submission.recovery_code",
      "'submitted_at', submission.submitted_at",
      "'round_id', round.id",
      "'round_name', round.name",
      "'edition_id', edition.id",
      "'edition_name', edition.name",
      "'edition_number', edition.edition_number",
    ]) {
      expect(migration).toContain(field);
    }

    expect(migration).not.toContain("song_title");
    expect(migration).not.toContain("admin_notes");
    expect(migration).not.toContain("submission_review_history");
  });

  it("uses bounded two-column keyset pagination for archive growth", () => {
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

  it("exposes only an authenticated narrow SECURITY DEFINER surface", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("to authenticated;");
    expect(migration).toContain("'schemaVersion', 1");
    expect(migration).toContain("'editionId', p_edition_id");
    expect(migration).toContain("'totalCount', v_total_count");
    expect(migration).toContain("'serverTime', now()");
  });
});
