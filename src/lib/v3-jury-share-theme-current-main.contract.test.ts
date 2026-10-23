import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023211000_v3_jury_share_theme_backend.sql",
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
  it("adopts JSC-7 into the canonical post-S13 migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.results.jury-share-edition-theme-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("without backfilling historical themes");
  });

  it("stores only bounded versioned Edition composition, never duplicate Jury truth or image bytes", () => {
    expect(migration).toContain("create table public.edition_jury_share_themes");
    expect(migration).toContain("unique (edition_id, version)");
    expect(migration).toContain("where state = 'ready'");
    expect(migration).toContain("pg_column_size(composition) <= 65536");
    expect(migration).toContain("composition_hash text not null");
    expect(migration).toContain("on delete restrict");
    expect(migration).not.toMatch(/create\s+table\s+(?:public\.)?jury_(?:votes|ballot_submissions)\b/i);
    expect(migration).not.toMatch(/\b(bytea|image_binary|render_binary|blob_data)\b/i);
  });

  it("keeps theme storage behind RLS and capability-checked RPCs", () => {
    expect(migration).toContain("edition.share_theme.view");
    expect(migration).toContain("edition.share_theme.manage");
    expect(migration).toContain(
      "alter table public.edition_jury_share_themes enable row level security",
    );
    expect(migration).toContain(
      "revoke all on table public.edition_jury_share_themes\n  from public, anon, authenticated",
    );
    expect(functionBody("public.studio2_jury_share_theme_snapshot")).toContain(
      "public.studio2_access_allowed('edition.share_theme.view', p_edition_id, false)",
    );
    expect(functionBody("public.studio2_save_jury_share_theme_draft")).toContain(
      "public.studio2_access_allowed('edition.share_theme.manage', p_edition_id, false)",
    );
    expect(functionBody("public.studio2_set_jury_share_theme_state")).toContain(
      "public.studio2_access_allowed('edition.share_theme.manage', p_edition_id, false)",
    );
  });

  it("accepts only the structured Organizer composition contract and rejects arbitrary web content", () => {
    const body = functionBody("private.v3_validate_jury_share_edition_theme");
    expect(body).toContain(
      "array['artwork','scoreboard','header','background','footer','decorativeAssets','safeArea']",
    );
    expect(body).toContain("UNKNOWN_TOP_LEVEL_KEYS");
    expect(body).toContain("UNKNOWN_SCOREBOARD_KEYS");
    expect(body).toContain("UNKNOWN_HEADER_KEYS");
    expect(body).toContain("UNKNOWN_BACKGROUND_KEYS");
    expect(body).toContain("UNKNOWN_FOOTER_KEYS");
    expect(body).toContain("UNKNOWN_ARTWORK_KEYS");
    expect(body).toContain("UNKNOWN_DECORATIVE_ASSET_KEYS");
    expect(body).toContain("UNKNOWN_SAFE_AREA_KEYS");
    expect(body).toContain(
      "(https?://|javascript:|<script|</script|customcss|customhtml|customjavascript|data:text/html)",
    );
    expect(body).toContain("ARTWORK_ASSET_NOT_EDITION_OWNED");
    expect(body).toContain("DECORATIVE_ASSET_NOT_EDITION_OWNED");
    expect(body).toContain("BACKGROUND_REQUIRES_ARTWORK");
  });

  it("pins bounded Story geometry and the ten-row composition before renderer validation", () => {
    const body = functionBody("private.v3_validate_jury_share_edition_theme");
    expect(body).toContain("v_row_height < 72 or v_row_height > 128");
    expect(body).toContain("rowRadius");
    expect(body).toContain("SAFE_AREA_VERTICAL_INVALID");
    expect(body).toContain("SAFE_AREA_HORIZONTAL_INVALID");
    expect(body).toContain("TEN_ROWS_GEOMETRY_INVALID");
    expect(body).toContain("1920");
    expect(body).toContain("1080");
  });

  it("binds authoritative renderer evidence to the exact saved composition hash", () => {
    expect(migration).toContain(
      "create table private.v3_jury_share_theme_render_validations",
    );
    expect(migration).toContain("composition_hash text not null");
    expect(migration).toContain("evidence_hash text not null");
    expect(migration).toContain(
      "unique (\n    theme_id,\n    composition_hash,\n    validator_contract_version,\n    validator_build",
    );

    const record = functionBody(
      "public.v3_record_jury_share_theme_render_validation",
    );
    expect(record).toContain(
      "v_theme.composition_hash is distinct from p_composition_hash",
    );
    expect(record).toContain("message = 'VERSION_CONFLICT'");
    expect(record).toContain("p_validator_contract_version is distinct from 1");
    expect(record).toContain("VALIDATION_EVIDENCE_CONFLICT");
  });

  it("requires the full canonical render-validation checklist, including PNG and JPEG export", () => {
    const wellFormed = functionBody(
      "private.v3_jury_share_render_checks_well_formed",
    );
    for (const check of [
      "assets",
      "typography",
      "glyphCoverage",
      "longNameFit",
      "tenRowsFit",
      "safeZoneLayout",
      "contrast",
      "pngExport",
      "jpegExport",
    ]) {
      expect(wellFormed).toContain(`p_checks -> '${check}'`);
    }
    expect(wellFormed).toContain("jsonb_object_length(p_checks) = 9");

    const valid = functionBody("private.v3_jury_share_render_checks_valid");
    expect(valid).toContain("(p_checks ->> 'pngExport')::boolean");
    expect(valid).toContain("(p_checks ->> 'jpegExport')::boolean");
    expect(valid).toContain("(p_checks ->> 'glyphCoverage')::boolean");
    expect(valid).toContain("(p_checks ->> 'longNameFit')::boolean");
    expect(valid).toContain("(p_checks ->> 'contrast')::boolean");
  });

  it("keeps renderer evidence service-only and private", () => {
    expect(migration).toContain(
      "alter table private.v3_jury_share_theme_render_validations enable row level security",
    );
    expect(migration).toContain(
      "revoke all on table private.v3_jury_share_theme_render_validations\n  from public, anon, authenticated",
    );

    const record = functionBody(
      "public.v3_record_jury_share_theme_render_validation",
    );
    expect(record).toContain("private.studio2_request_is_service_role()");
    expect(migration).toContain(
      "grant execute on function public.v3_record_jury_share_theme_render_validation(\n  uuid, text, integer, text, jsonb\n) to service_role",
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.v3_record_jury_share_theme_render_validation[\s\S]*?to authenticated/i,
    );
  });

  it("exposes a non-mutating authoritative Ready preflight with explicit blockers", () => {
    const body = functionBody(
      "public.studio2_jury_share_theme_ready_preflight",
    );
    expect(body).toContain("'VERSION_CONFLICT'");
    expect(body).toContain("'EDITION_ARCHIVED'");
    expect(body).toContain("'STATE_CHANGED'");
    expect(body).toContain("'STRUCTURAL_VALIDATION_FAILED'");
    expect(body).toContain("'RENDER_VALIDATION_REQUIRED'");
    expect(body).toContain("'RENDER_VALIDATION_FAILED'");
    expect(body).toContain("'ready', jsonb_array_length(v_blockers) = 0");
    expect(body).toContain("'compositionHash', v_theme.composition_hash");
    expect(body).toContain("'renderValidation'");
    expect(body).not.toMatch(/\bupdate\s+public\.edition_jury_share_themes\b/i);
    expect(body).not.toMatch(/\binsert\s+into\b/i);
  });

  it("makes Ready fail closed unless exact-version renderer evidence is valid", () => {
    const body = functionBody("public.studio2_set_jury_share_theme_state");
    const structural = body.indexOf(
      "private.v3_validate_jury_share_edition_theme(",
    );
    const evidence = body.indexOf(
      "private.v3_jury_share_theme_render_validations",
    );
    const readyWrite = body.indexOf("state = 'ready'");

    expect(structural).toBeGreaterThanOrEqual(0);
    expect(evidence).toBeGreaterThan(structural);
    expect(readyWrite).toBeGreaterThan(evidence);
    expect(body).toContain(
      "validation.composition_hash = v_theme.composition_hash",
    );
    expect(body).toContain("validation.validator_contract_version = 1");
    expect(body).toContain("and validation.valid");
    expect(body).toContain(
      "Authoritative PNG/JPEG, typography, glyph, fit, safe-zone and contrast validation is required",
    );
  });

  it("preserves immutable historical Edition themes and creates a new version after Ready/Archive", () => {
    const guard = functionBody("private.v3_guard_archived_jury_share_theme");
    expect(guard).toContain("old.state = 'archived'");
    expect(guard).toContain("Archived Jury Share theme versions are immutable");

    const save = functionBody("public.studio2_save_jury_share_theme_draft");
    expect(save).toContain("v_current.state in ('draft', 'invalid')");
    expect(save).toContain("v_current.version + 1");

    const transition = functionBody("public.studio2_set_jury_share_theme_state");
    expect(transition).toContain("v_runtime_state is distinct from 'archived'");
    expect(transition).toContain("v_theme.state <> 'ready'");
    expect(transition).toContain("state = 'archived'");
  });

  it("uses canonical S2 idempotency, receipts, concurrency and reconciliation for Organizer mutations", () => {
    for (const name of [
      "public.studio2_save_jury_share_theme_draft",
      "public.studio2_set_jury_share_theme_state",
    ]) {
      const body = functionBody(name);
      expect(body).toContain("private.studio2_claim_operation(");
      expect(body).toContain("public.studio2_reconcile_operation(");
      expect(body).toContain("private.studio2_complete_operation(");
      expect(body).toContain("pg_advisory_xact_lock");
    }

    const save = functionBody("public.studio2_save_jury_share_theme_draft");
    expect(save).toContain("'R1'");
    expect(save).toContain("'edition.share_theme.save_draft'");

    const transition = functionBody("public.studio2_set_jury_share_theme_state");
    expect(transition).toContain("'R2'");
    expect(transition).toContain("'edition.share_theme.' || v_target");
  });

  it("publishes Edition recipes only after canonical publication and exact render validation", () => {
    const body = functionBody("public.v3_jury_share_edition_theme");
    expect(body).toContain(
      "public.show_publication_enabled(p_show_id, 'results')",
    );
    expect(body).toContain(
      "public.show_publication_enabled(p_show_id, 'jury_results')",
    );
    expect(body).toContain(
      "(v_runtime_state = 'archived' and theme.state = 'archived')",
    );
    expect(body).toContain(
      "(v_runtime_state is distinct from 'archived' and theme.state = 'ready')",
    );
    expect(body).toContain(
      "validation.composition_hash = v_theme.composition_hash",
    );
    expect(body).toContain("validation.validator_contract_version = 1");
    expect(body).toContain("and validation.valid");
    expect(body).toContain("'reason', 'RENDER_VALIDATION_REQUIRED'");
  });

  it("is transactional and reloads PostgREST only after installing the complete contract", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});
