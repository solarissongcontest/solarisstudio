import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = () =>
  readFileSync(
    "supabase/migrations/20261014040000_v3_entry_restore_provenance.sql",
    "utf8",
  );
const rehearsal = () =>
  readFileSync(
    ".github/scripts/v3-entry-restore-provenance-assert.sh",
    "utf8",
  );
const workflow = () =>
  readFileSync(
    ".github/workflows/rules-integrity-migration-rehearsal.yml",
    "utf8",
  );

describe("V3 Entry restore provenance", () => {
  it("distinguishes organizer restores from ordinary canonical writes", () => {
    const sql = migration();
    expect(sql).toContain("'organizer_restore'");
    expect(sql).toContain("restored_from_submission_version_id");
    expect(sql).toContain("v3_entry_versions_restore_provenance_check");
    expect(sql).toContain("source = 'organizer_restore' and restored_from_submission_version_id is not null");
    expect(sql).toContain("source <> 'organizer_restore' and restored_from_submission_version_id is null");
  });

  it("binds provenance to the same canonical Confirmation submission", () => {
    const sql = migration();
    expect(sql).toContain("current_setting('solaris.v3_restore_submission_version_id', true)");
    expect(sql).toContain("v.id=restore_version_uuid");
    expect(sql).toContain("v.submission_id=submission_uuid");
    expect(sql).toContain("Entry restore provenance does not belong to this Confirmation submission");
  });

  it("lets only the guarded restore wrapper establish the transaction-local provenance marker", () => {
    const sql = migration();
    expect(sql).toContain("public.admin_restore_confirmation_version_apply");
    expect(sql).toContain("perform set_config(\n    'solaris.v3_restore_submission_version_id',\n    _version_id::text,\n    true\n  )");
    expect(sql).toContain("previous_restore_version");
    expect(sql).toContain("Restore blocked: the historical snapshot contains a National Final entry removed by organizer moderation");
    expect(sql).toContain("for update");
  });

  it("returns provenance through the existing authorized Entry history RPC", () => {
    const sql = migration();
    expect(sql).toContain("create or replace function public.v3_confirmation_entry_versions");
    expect(sql).toContain("'restored_from_submission_version_id',v.restored_from_submission_version_id");
    expect(sql).toContain("public.public_country_account_confirmation_access()");
    expect(sql).toContain("public.studio2_access_allowed(");
    expect(sql).not.toContain("grant select on private.v3_entry_versions");
  });

  it("rehearses real restore evidence on isolated Supabase for clean and upgrade paths", () => {
    const check = rehearsal();
    const ci = workflow();
    expect(check).toContain("127.0.0.1");
    expect(check).toContain("Refusing hosted Supabase rehearsal");
    expect(check).toContain("source='organizer_restore'");
    expect(check).toContain("restored_from_submission_version_id='$RESTORED_FROM'::uuid");
    expect(check).toContain("submission_exists");
    expect(ci.match(/v3-entry-restore-provenance-assert\.sh/g)?.length).toBe(3);
  });
});
