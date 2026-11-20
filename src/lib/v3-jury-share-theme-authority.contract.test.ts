import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023211500_v3_jury_share_theme_authority.sql",
  ),
  "utf8",
);

function functionBody(name: string) {
  const marker = `create or replace function ${name}(`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 Jury Share Edition theme authority", () => {
  it("is an S13-registered forward-only migration on the current Jury Share lineage", () => {
    expect(migration).toContain("'v3.results.jury-share-edition-theme-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });

  it("adds narrow Edition share-theme capabilities without granting result publication power", () => {
    expect(migration).toContain("'edition.share_theme.view'");
    expect(migration).toContain("'edition.share_theme.manage'");
    expect(migration).toContain("('organizer', 'edition.share_theme.view')");
    expect(migration).toContain("('organizer', 'edition.share_theme.manage')");
    expect(migration).not.toContain("('results_manager', 'edition.share_theme.manage')");
  });

  it("stores bounded versioned recipes rather than arbitrary CSS or a duplicate ballot store", () => {
    expect(migration).toContain("create table public.edition_jury_share_themes");
    expect(migration).toContain("unique (edition_id, version)");
    expect(migration).toContain("pg_column_size(composition) <= 65536");
    expect(migration).toContain("where state = 'ready'");
    expect(migration).toContain("UNSAFE_OR_ARBITRARY_CONTENT");
    expect(migration).toContain("customcss");
    expect(migration).toContain("customhtml");
    expect(migration).toContain("customjavascript");
    expect(migration).not.toContain("create table public.jury_votes");
    expect(migration).not.toContain("create table public.jury_ballot_submissions");
  });

  it("binds every stored composition to a server-derived SHA-256 fingerprint", () => {
    const fingerprint = functionBody("private.v3_jury_share_theme_fingerprint");
    expect(fingerprint).toContain("extensions.digest");
    expect(fingerprint).toContain("'sha256'");
    expect(migration).toContain("composition_fingerprint text not null");
    expect(functionBody("private.v3_guard_jury_share_theme_row")).toContain(
      "private.v3_jury_share_theme_fingerprint(new.composition)",
    );
  });

  it("keeps Ready/Archived history immutable and forbids destructive theme deletion", () => {
    const guard = functionBody("private.v3_guard_jury_share_theme_row");
    expect(guard).toContain("Jury Share theme versions are not destructively deleted");
    expect(guard).toContain("old.state = 'archived'");
    expect(guard).toContain("Archived Jury Share theme versions are immutable");
    expect(guard).toContain("old.state = 'ready'");
    expect(guard).toContain("new.state <> 'archived'");
    expect(guard).toContain("Ready Jury Share themes may only transition to Archived");
    expect(migration).toContain("references public.editions(id) on delete restrict");
  });

  it("turns expectedVersion into a real composition CAS token for draft saves", () => {
    const save = functionBody("public.studio2_save_jury_share_theme_draft");
    expect(save).toContain("coalesce(v_current.version, 0) is distinct from p_expected_version");
    expect(save).toContain("message = 'VERSION_CONFLICT'");
    expect(save).toContain("v_current.composition = p_composition");
    expect(save).toContain("set version = v_current.version + 1");
    expect(save).toContain("v_current.version + 1");
    expect(save).toContain("private.studio2_claim_operation(");
    expect(save).toContain("'edition.share_theme.save_draft'");
    expect(save).toContain("private.studio2_complete_operation");
    expect(save).toContain("public.studio2_reconcile_operation");
  });

  it("keeps browser writes behind capability-checked authoritative RPCs", () => {
    expect(migration).toContain(
      "revoke all on table public.edition_jury_share_themes from public, anon, authenticated;",
    );
    expect(functionBody("public.studio2_save_jury_share_theme_draft")).toContain(
      "studio2_access_allowed('edition.share_theme.manage'",
    );
    expect(functionBody("public.studio2_set_jury_share_theme_state")).toContain(
      "studio2_access_allowed('edition.share_theme.manage'",
    );
    expect(functionBody("public.studio2_jury_share_theme_snapshot")).toContain(
      "studio2_access_allowed('edition.share_theme.view'",
    );
  });

  it("stores immutable renderer evidence only for the exact theme version and composition fingerprint", () => {
    expect(migration).toContain("create table private.v3_jury_share_theme_render_validations");
    expect(migration).toContain("theme_version integer not null");
    expect(migration).toContain("composition_fingerprint text not null");
    expect(migration).toContain("assets_ok boolean not null");
    expect(migration).toContain("typography_ok boolean not null");
    expect(migration).toContain("layout_ok boolean not null");
    expect(migration).toContain("contrast_ok boolean not null");
    expect(migration).toContain("png_ok boolean not null");
    expect(migration).toContain("jpeg_ok boolean not null");
    expect(migration).toContain("Jury Share renderer validation evidence is immutable");
  });

  it("allows only service-side renderer evidence recording and makes retries semantic-idempotent", () => {
    const record = functionBody("public.studio2_record_jury_share_theme_render_validation");
    expect(record).toContain("private.studio2_request_is_service_role()");
    expect(record).toContain("Service role required");
    expect(record).toContain("v_theme.composition_fingerprint is distinct from p_expected_composition_fingerprint");
    expect(record).toContain("on conflict (id) do nothing");
    expect(record).toContain("IDEMPOTENCY_KEY_REUSED");
    expect(migration).toContain(
      ") to service_role;\n\ncreate or replace function public.studio2_jury_share_theme_snapshot",
    );
  });

  it("fails Ready closed until structural and authoritative render/export validation both pass", () => {
    const transition = functionBody("public.studio2_set_jury_share_theme_state");
    expect(transition).toContain("private.v3_validate_jury_share_edition_theme");
    expect(transition).toContain("private.v3_jury_share_theme_render_validation_summary");
    expect(transition).toContain("RENDER_VALIDATION_REQUIRED");
    expect(transition).toContain("(v_render_validation ->> 'readyEligible')::boolean");
    expect(transition).toContain("v_theme.state not in ('draft', 'invalid')");
    expect(transition).toContain("v_runtime_state = 'archived'");
  });

  it("makes renderer readiness explicitly cover assets, typography, layout, contrast, PNG and JPEG", () => {
    const summary = functionBody("private.v3_jury_share_theme_render_validation_summary");
    for (const check of ["assets", "typography", "layout", "contrast", "png", "jpeg"]) {
      expect(summary).toContain(`'${check}'`);
    }
    expect(migration).toContain(
      "assets_ok and typography_ok and layout_ok and contrast_ok and png_ok and jpeg_ok",
    );
  });

  it("returns renderer readiness in the Organizer snapshot instead of asking the browser to invent it", () => {
    const snapshot = functionBody("public.studio2_jury_share_theme_snapshot");
    expect(snapshot).toContain("'renderValidation', render_state.summary");
    expect(snapshot).toContain("'readyEligible'");
    expect(snapshot).toContain("limit 50");
    expect(snapshot).toContain("'truncated', v_total > 50");
  });

  it("keeps Edition renderer projection behind rollout and canonical result publication", () => {
    const projection = functionBody("public.v3_jury_share_edition_theme");
    expect(projection).toContain("private.studio2_feature_enabled_for(");
    expect(projection).toContain("'jury_share_cards_v1'");
    expect(projection).toContain("show_publication_enabled(p_show_id, 'results')");
    expect(projection).toContain("show_publication_enabled(p_show_id, 'jury_results')");
    expect(projection).toContain("theme.state in ('ready', 'archived')");
    expect(projection).toContain("private.v3_jury_share_theme_render_validation_summary");
    expect(projection).toContain("'compositionFingerprint', v_theme.composition_fingerprint");
  });

  it("keeps the existing Organizer RPC surface source-compatible while strengthening authority", () => {
    expect(migration).toContain("public.studio2_jury_share_theme_snapshot(p_edition_id uuid)");
    expect(migration).toContain("public.studio2_save_jury_share_theme_draft(");
    expect(migration).toContain("p_expected_version integer");
    expect(migration).toContain("public.studio2_set_jury_share_theme_state(");
    expect(migration).toContain("p_target_state text");
  });
});
