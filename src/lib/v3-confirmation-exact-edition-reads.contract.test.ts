import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020001500_confirmation_exact_edition_reads.sql",
  ),
  "utf8",
);

describe("V3 Confirmation exact-edition Organizer reads", () => {
  it("registers the additive migration through the S13 contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261020001500_confirmation_exact_edition_reads");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/\bdrop\s+(?:table|function|view|schema)\b/i);
  });

  it("requires an explicit edition and bounds the response projection", () => {
    expect(migration).toContain("admin_confirmation_responses_for_edition");
    expect(migration).toContain(
      "private.solaris_confirmation_admin_read_allowed(_edition_id, false)",
    );
    expect(migration).toContain("where s.edition_id = _edition_id");
    expect(migration).toContain("Response page limit must be between 1 and 200");
    expect(migration).toContain("'has_more'");
    expect(migration).toContain("'state_version'");
    expect(migration).toContain("'server_time'");
  });

  it("exposes canonical entry revision identity in the bounded review queue", () => {
    expect(migration).toContain("'content_revision', i.content_revision");
    expect(migration).toContain("'current_version_id', i.current_version_id");
    expect(migration).toContain("'reviewed_version_id', i.reviewed_version_id");
    expect(migration).toContain("'content_revision', nfe.content_revision");
    expect(migration).toContain("'current_version_id', nfe.current_version_id");
    expect(migration).toContain("'reviewed_version_id', nfe.reviewed_version_id");
  });

  it("binds response detail to edition plus submission before returning data", () => {
    expect(migration).toContain("admin_confirmation_response_for_edition");
    expect(migration).toContain("v_actual_edition_id <> _edition_id");
    expect(migration).toContain("Submission not found for edition");
    expect(migration).toContain("Submission scope changed while loading");
  });

  it("keeps technical and recovery secrets exact-edition and manage-only", () => {
    expect(migration).toContain("admin_confirmation_technical_for_edition");
    expect(migration).toContain("admin_confirmation_recovery_codes_for_edition");
    expect(migration.match(/studio2_access_allowed\('confirmation\.manage', _edition_id, false\)/g)?.length).toBe(2);
    expect(migration).toContain("and s.edition_id = _edition_id");
    expect(migration).toContain("Recovery page limit must be between 1 and 200");
  });

  it("does not expose the security-definer RPCs to anonymous callers", () => {
    expect(migration).toContain(
      "revoke all on function public.admin_confirmation_responses_for_edition(uuid, integer, integer) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke all on function public.admin_confirmation_technical_for_edition(uuid, uuid) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.admin_confirmation_responses_for_edition(uuid, integer, integer) to authenticated, service_role;",
    );
  });
});
