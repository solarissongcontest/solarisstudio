import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyV3ConsequenceRelease } from "./v3-consequence-release-classification";
import { V3_EDITION_CHANGE_CONSEQUENCE } from "./v3-edition-change-consequence";
import { scanV3S16StaticAuthority } from "./v3-s16-mutation-authority";

const read = (path: string) => readFileSync(path, "utf8");

describe("V3 canonical edition authority", () => {
  const authority = read("supabase/migrations/20261027204500_v3_edition_authority.sql");
  const theme = read("supabase/migrations/20261027205200_v3_edition_theme_authority.sql");
  const retirement = read("supabase/migrations/20261027210000_v3_retire_confirmation_round_legacy_writers.sql");
  const internalCutover = read("supabase/migrations/20261027211000_v3_edition_internal_writer_cutover.sql");

  it("defines distinct governed commands per semantic edition operation", () => {
    for (const command of [
      "public.v3_create_edition",
      "public.v3_apply_edition_metadata_change",
      "public.v3_apply_edition_editing_change",
      "public.v3_apply_edition_visual_change",
    ]) expect(authority).toContain(`function ${command}`);
    expect(theme).toContain("function public.v3_apply_edition_theme_change");
    expect(authority).toContain("public.studio2_access_allowed('edition.manage'");
    expect(authority).toContain("private.v3_require_active_auth_session()");
    expect(theme).toContain("private.v3_require_active_auth_session()");
  });

  it("uses row locking/CAS and stable semantic operation identity where concurrent edits matter", () => {
    expect(authority).toContain("where id = p_edition_id\n  for update");
    expect(authority).toContain("v_current.data_revision <> p_expected_revision");
    expect(authority).toContain("data_revision = data_revision + 1");
    expect(authority).toContain("private.studio2_request_fingerprint(");
    expect(authority).toContain("private.studio2_claim_operation(");
    expect(authority).toContain("private.studio2_complete_operation(");
    expect(theme).toContain("v_current.theme_id is distinct from p_expected_theme_id");
    expect(theme).toContain("for update");
  });

  it("removes raw API-role edition DML rather than trusting RLS as the sole wall", () => {
    expect(authority).toContain("drop policy if exists \"editions capability write insert\"");
    expect(authority).toContain("drop policy if exists \"editions capability write update\"");
    expect(authority).toContain("drop policy if exists \"editions capability write delete\"");
    expect(authority).toContain(
      "revoke insert, update, delete, truncate on public.editions from anon, authenticated, service_role",
    );
  });

  it("retires the old Confirmation edition and round peer writers", () => {
    for (const legacy of [
      "admin_confirmation_set_edition_editing",
      "admin_confirmation_set_round_editing",
      "admin_confirmation_delete_edition",
    ]) {
      expect(authority).toContain(`function public.${legacy}`);
      expect(authority).toContain("LEGACY_RETIRED");
    }
    for (const legacy of [
      "admin_confirmation_save_round",
      "admin_confirmation_delete_round",
      "admin_confirmation_set_round_status",
    ]) {
      expect(retirement).toContain(`function public.${legacy}`);
      expect(retirement).toContain("LEGACY_RETIRED");
    }
    expect(read("src/integrations/confirmations/admin.ts")).not.toMatch(
      /\.rpc\(\s*["']admin_confirmation_(?:save_round|delete_round|set_round_status|set_round_editing|set_edition_editing|delete_edition)["']/,
    );
  });

  it("retires V2 lifecycle authority without reopening accepted V3 transition semantics", () => {
    expect(internalCutover).toContain("function public.studio2_transition_edition_v2");
    expect(internalCutover).toContain("LEGACY_RETIRED: use studio2_transition_edition_v3");
    expect(internalCutover).toContain(
      "revoke all on function public.studio2_transition_edition_v2(uuid,text,text,uuid)",
    );
    expect(read("supabase/migrations/20261019112100_v3_s14_archive_consequence_reconciliation.sql"))
      .toContain("function public.studio2_transition_edition_v3");
  });

  it("keeps sanctioned derived edition writers non-callable and pinned", () => {
    for (const fn of [
      "bump_edition_data_revision",
      "bump_country_edition_revisions",
      "sync_edition_publication_from_shows",
      "sync_edition_year_from_event_date",
    ]) {
      expect(authority).toContain(`alter function public.${fn}() security definer`);
      expect(authority).toContain(`alter function public.${fn}() set search_path = pg_catalog, public, private`);
      expect(authority).toContain(`revoke all on function public.${fn}()`);
    }
    expect(internalCutover).toContain("alter function public.sync_edition_design_to_shows() security definer");
    expect(internalCutover).toContain(
      "alter function public.sync_edition_design_to_shows()\n  set search_path = pg_catalog, public, private",
    );
    expect(internalCutover).toContain("revoke all on function public.sync_edition_design_to_shows()");
  });

  it("removes direct public.editions writers from the migrated Organizer surfaces", () => {
    for (const path of [
      "src/routes/_authenticated/admin/editions.tsx",
      "src/routes/_authenticated/admin/anniversary-dates.tsx",
      "src/routes/_authenticated/admin/design.$slug.tsx",
      "src/components/EditionPublicDesignPanel.tsx",
      "src/lib/visual-theme.ts",
    ]) {
      const findings = scanV3S16StaticAuthority([{ path, source: read(path) }]);
      expect(findings).not.toContainEqual(expect.objectContaining({
        domain: "contest-lifecycle",
        subject: "public.editions",
        kind: "direct_application_writer",
      }));
    }
  });

  it("does not confuse explicitly configured televoting.editions with public.editions", () => {
    const client = read("src/integrations/televoting/client.server.ts");
    expect(client).toContain('schema: "televoting"');
    for (const path of [
      "src/integrations/televoting/editions.server.ts",
      "src/integrations/televoting/solaris-sync.server.ts",
    ]) {
      const findings = scanV3S16StaticAuthority([{ path, source: read(path) }]);
      expect(findings).not.toContainEqual(expect.objectContaining({
        domain: "contest-lifecycle",
        subject: "public.editions",
        kind: "direct_application_writer",
      }));
    }
  });

  it("keeps lifecycle, host, publication and show authority semantically separate", () => {
    const editions = read("src/routes/_authenticated/admin/editions.tsx");
    const design = read("src/routes/_authenticated/admin/design.$slug.tsx");
    expect(editions).toContain("applyShowPublicationChange");
    expect(editions).not.toContain("studio2_transition_edition_v3");
    expect(design).toContain("applyEditionThemeChange");
    expect(design).toMatch(/\.from\(\s*["']shows["']\s*\)\.update/);
    expect(V3_EDITION_CHANGE_CONSEQUENCE.commands).not.toContain("public.studio2_transition_edition_v3");
    expect(V3_EDITION_CHANGE_CONSEQUENCE.asyncConsumers).toEqual([]);
  });

  it("uses a compact derived edition.changed event rather than making consumers authoritative", () => {
    expect(classifyV3ConsequenceRelease("edition.changed")).toBe("derived");
    expect(V3_EDITION_CHANGE_CONSEQUENCE.payload).toContain("changed field names");
    expect(V3_EDITION_CHANGE_CONSEQUENCE.failureSemantics).toContain("aborts the command transaction");
    expect(authority).toContain("'changedFields'");
    expect(authority).toContain("'revision'");
    expect(authority).not.toContain("'patch', p_patch,\n      'revision'");
  });

  it("keeps stateful proof local-only", () => {
    const rehearsal = read(".github/scripts/v3-canonical-writer-rehearsal.sh");
    expect(rehearsal).toContain("Refusing non-local writer rehearsal");
    expect(rehearsal).toContain("Refusing non-local writer database");
    expect(rehearsal).toContain("v3-edition-authority.sql");
  });
});
