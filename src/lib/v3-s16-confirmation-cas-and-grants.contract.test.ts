import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hardening = readFileSync(
  "supabase/migrations/20261029153500_v3_s16_confirmation_cas_and_grants.sql",
  "utf8",
).toLowerCase();

const roundOperations = readFileSync(
  "supabase/migrations/20261003018000_organisation_os_v5_confirmation_round_operations.sql",
  "utf8",
).toLowerCase();

const confirmationAuthority = readFileSync(
  "supabase/migrations/20261012011000_v3_confirmation_authority_hardening.sql",
  "utf8",
).toLowerCase();

describe("V3 S16 Confirmation CAS and grant hardening", () => {
  it("removes raw transport DML from canonical Confirmation authority tables", () => {
    for (const table of [
      "public.studio2_confirmation_round_versions",
      "public.studio2_confirmation_requirements",
      "private.v3_confirmation_operations",
    ]) {
      expect(hardening).toContain(
        `revoke insert, update, delete, truncate\n  on table ${table}\n  from service_role`,
      );
      expect(hardening).toContain(
        `has_table_privilege('service_role', '${table}', 'insert')`,
      );
    }
  });

  it("keeps the round-version trigger as bounded CAS housekeeping", () => {
    expect(roundOperations).toContain(
      "create trigger studio2_confirmation_round_touch_version",
    );
    expect(roundOperations).toContain(
      "create trigger studio2_confirmation_submission_touch_round_version",
    );
    expect(roundOperations).toContain(
      "public.studio2_confirmation_round_versions.version + 1",
    );

    expect(hardening).toContain(
      "alter function private.studio2_touch_confirmation_round_version() owner to postgres",
    );
    expect(hardening).toContain(
      "set search_path = pg_catalog, public, private, pg_temp",
    );
    expect(hardening).toContain(
      "from public, anon, authenticated, service_role",
    );
  });

  it("removes redundant direct-round guard triggers instead of allowlisting them", () => {
    expect(hardening).toContain(
      "drop trigger if exists studio2_guard_direct_confirmation_round_update",
    );
    expect(hardening).toContain(
      "drop trigger if exists studio2_guard_direct_confirmation_round_delete",
    );
    expect(hardening).toContain(
      "drop function if exists private.studio2_guard_direct_confirmation_round_mutation()",
    );
    expect(hardening).not.toContain("sanctionedwritetriggers");
  });

  it("preserves governed command ownership of the operation ledger", () => {
    expect(confirmationAuthority).toContain(
      "insert into private.v3_confirmation_operations",
    );
    expect(confirmationAuthority).toContain(
      "create or replace function public.v3_submit_confirmation",
    );
    expect(confirmationAuthority).toContain("security definer");
  });

  it("fails migration replay on privilege or obsolete-trigger drift", () => {
    expect(hardening).toContain("do $proof$");
    expect(hardening).toContain(
      "confirmation round-version housekeeping primitive is externally executable",
    );
    expect(hardening).toContain("from pg_trigger trigger_row");
    expect(hardening).toContain(
      "to_regprocedure('private.studio2_guard_direct_confirmation_round_mutation()') is not null",
    );
  });
});
