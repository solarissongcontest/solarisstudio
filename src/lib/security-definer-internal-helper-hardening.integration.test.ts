import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_security_definer_internal_helper_hardening.sql"),
);
if (!migrationName) throw new Error("Final SECURITY DEFINER helper hardening migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

describe("final SECURITY DEFINER helper hardening", () => {
  it("removes direct API execution from Integrity trigger bodies", () => {
    expect(migration).toContain("integrity_apply_case_retention_to_evidence");
    expect(migration).toContain("integrity_validate_evidence_lineage");
    expect(migration).toContain("Trigger helper still directly executable");
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });

  it("keeps nested privileged helpers service-role only", () => {
    for (const fn of [
      "can_manage_country_national_finals",
      "integrity_case_snapshot",
      "integrity_expire_stale_identity_approvals",
      "integrity_finalize_evidence_token",
      "integrity_reporter_resolution_snapshot",
      "rulebook_effective_changes",
    ]) {
      expect(migration).toContain(fn);
    }

    expect(migration).toContain("'grant execute on function %s to service_role'");
    expect(migration).toContain("Internal helper privilege boundary invalid");
  });

  it("converges clean replay legacy helpers to the production privilege boundary", () => {
    for (const fn of [
      "claim_country_from_signup",
      "refresh_public_results_after_child_change",
      "refresh_public_results_after_show_change",
      "refresh_show_results",
      "sync_edition_publication_after_show_change",
      "sync_one_edition_publication",
      "owns_country",
      "update_owned_country_identity",
    ]) {
      expect(migration).toContain(fn);
    }
    expect(migration).toContain("Replay-only internal helper still directly executable");
    expect(migration).toContain("Authenticated compatibility RPC privilege boundary invalid");
  });

  it("fails closed on any new anonymous SECURITY DEFINER surface", () => {
    expect(migration).toContain("Unexpected anonymous SECURITY DEFINER function(s)");
    expect(migration).toContain("public.public_current_rulebook_release()");
    expect(migration).toContain("public.studio2_access_allowed(p_capability text, p_edition_id uuid, p_strict_before_cutover boolean)");
    expect(migration).toContain("televoting.submit_vote_checked(");
  });

  it("does not revoke intentional browser-facing RPCs", () => {
    const hardeningOnly = migration.split(
      "-- Keep the remaining anonymous SECURITY DEFINER surface explicit.",
    )[0];

    for (const signature of [
      "public.public_create_anonymous_integrity_case(",
      "public.public_current_rulebook_release(",
      "public.public_check_entry_duplicate(",
      "public.manage_country_national_finals(",
      "public.studio2_publish_notice(",
      "public.submit_confirmation(",
      "televoting.submit_vote_checked(",
    ]) {
      expect(hardeningOnly).not.toContain(signature);
    }
  });
});
