import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_hod_legacy_helper_cutover.sql"),
);
if (!migrationName) throw new Error("HOD legacy helper cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("HOD legacy helper Permission Engine cutover", () => {
  it("replaces the Organizer bit with non-strict edition-scoped confirmation.manage", () => {
    expect(migration).toContain("public.studio2_access_allowed('confirmation.manage', p_edition_id, false)");
    expect(migration).toContain("v_can_manage_country := coalesce(");
    expect(migration).not.toContain("v_is_organizer");
    expect(migration).not.toContain("has_role");
  });

  it("preserves service, capability and country-owner authorization paths", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "if not v_is_service and not v_can_manage_country and not public.owns_country(v_actor, p_country_id) then",
    );
    expect(sql).toContain(
      "raise exception 'Country ownership or country-management capability required' using errcode = '42501';",
    );
  });

  it("uses the same inspector predicate for target-country notice acknowledgement projection", () => {
    const sql = normalized(migration);
    expect(sql).toContain("when v_is_service or v_can_manage_country then exists (");
    expect(sql).toContain("join public.country_accounts ca on ca.user_id = r.recipient_user_id");
    expect(sql).toContain("and ca.country_id = p_country_id");
    expect(sql).toContain("and ca.status = 'active'");
    expect(sql).toContain("and r.acknowledged_at is not null");
    expect(sql).toContain("and r.recipient_user_id = v_actor");
  });

  it("keeps the legacy helper service-role only as a direct RPC", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "revoke all on function public.studio2_hod_context_legacy_roster(uuid, uuid) from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function public.studio2_hod_context_legacy_roster(uuid, uuid) to service_role;",
    );
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
