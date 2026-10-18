import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019002500_v3_jury_share_theme_backend.sql",
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

describe("System V3 Jury Share Edition theme backend", () => {
  it("adds narrow edition share-theme capabilities without coupling them to result publication roles", () => {
    expect(migration).toContain("'edition.share_theme.view'");
    expect(migration).toContain("'edition.share_theme.manage'");
    expect(migration).toContain("('organizer', 'edition.share_theme.view')");
    expect(migration).toContain("('organizer', 'edition.share_theme.manage')");
    expect(migration).not.toContain("('results_manager', 'edition.share_theme.manage')");
  });

  it("stores bounded versioned composition recipes rather than arbitrary CSS or another general theme", () => {
    expect(migration).toContain("public.edition_jury_share_themes");
    expect(migration).toContain("unique (edition_id, version)");
    expect(migration).toContain("pg_column_size(composition) <= 65536");
    expect(migration).toContain("where state = 'ready'");
    expect(migration).toContain("UNSAFE_OR_ARBITRARY_CONTENT");
    expect(migration).toContain("customcss");
    expect(migration).toContain("customhtml");
    expect(migration).toContain("customjavascript");
  });

  it("validates the implementation-ready theme shape and 1080x1920 safe area", () => {
    const body = functionBody("private.v3_validate_jury_share_edition_theme");
    for (const key of ["scoreboard", "header", "background", "footer", "safeArea"]) {
      expect(body).toContain(`'${key}'`);
    }
    expect(body).toContain("DECORATIVE_ASSETS_NOT_ARRAY");
    expect(body).toContain("TOO_MANY_DECORATIVE_ASSETS");
    expect(body).toContain("ARTWORK_ASSET_NOT_EDITION_OWNED");
    expect(body).toContain(">= 1920");
    expect(body).toContain(">= 1080");
  });

  it("makes archived Edition theme versions immutable", () => {
    const body = functionBody("private.v3_guard_archived_jury_share_theme");
    expect(body).toContain("old.state = 'archived'");
    expect(body).toContain("Archived Jury Share theme versions are immutable");
    expect(migration).toContain("before update or delete on public.edition_jury_share_themes");
  });

  it("keeps browser writes behind capability-checked RPCs", () => {
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

  it("uses the canonical S2 operation receipt contract for draft saves", () => {
    const body = functionBody("public.studio2_save_jury_share_theme_draft");
    expect(body).toContain("private.studio2_claim_operation(");
    expect(body).toContain("'edition.share_theme.save_draft'");
    expect(body).toContain("'R1'");
    expect(body).toContain("p_expected_version");
    expect(body).toContain("using errcode = 'PT409', message = 'VERSION_CONFLICT'");
    expect(body).toContain("private.studio2_complete_operation");
    expect(body).toContain("public.studio2_reconcile_operation");
  });

  it("edits a draft in place but forks a new version from Ready or Archived configuration", () => {
    const body = functionBody("public.studio2_save_jury_share_theme_draft");
    expect(body).toContain("v_current.state in ('draft', 'invalid')");
    expect(body).toContain("v_current.version + 1");
    expect(body).toContain("v_runtime_state = 'archived'");
    expect(body).toContain("message = 'STATE_CHANGED'");
  });

  it("makes Ready/Archived transitions receipted R2 operations and requires live validation", () => {
    const body = functionBody("public.studio2_set_jury_share_theme_state");
    expect(body).toContain("'edition.share_theme.' || v_target");
    expect(body).toContain("'R2'");
    expect(body).toContain("private.v3_validate_jury_share_edition_theme");
    expect(body).toContain("v_theme.state not in ('draft', 'invalid')");
    expect(body).toContain("v_runtime_state is distinct from 'archived'");
    expect(body).toContain("state = 'archived'");
    expect(body).toContain("state = 'ready'");
  });

  it("archives the previous Ready version before activating a replacement", () => {
    const body = functionBody("public.studio2_set_jury_share_theme_state");
    const archivePrevious = body.indexOf("and state = 'ready'");
    const activateNew = body.indexOf("set state = 'ready'");
    expect(archivePrevious).toBeGreaterThanOrEqual(0);
    expect(activateNew).toBeGreaterThan(archivePrevious);
  });

  it("exposes only validated Ready/Archived recipes to the public share renderer", () => {
    const body = functionBody("public.v3_jury_share_edition_theme");
    expect(body).toContain("show_publication_enabled(p_show_id, 'results')");
    expect(body).toContain("show_publication_enabled(p_show_id, 'jury_results')");
    expect(body).toContain("theme.state in ('ready', 'archived')");
    expect(body).toContain("(theme.validation ->> 'valid')::boolean");
    expect(body).toContain("order by theme.version desc");
    expect(body).toContain("'composition', v_theme.composition");
  });

  it("explicitly revokes default function execution before exposing each intended boundary", () => {
    expect(migration).toContain(
      "revoke all on function private.v3_validate_jury_share_edition_theme(uuid, jsonb)\n  from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke all on function public.studio2_save_jury_share_theme_draft(\n  uuid, jsonb, integer, uuid, text, uuid\n) from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function public.v3_jury_share_edition_theme(uuid)\n  from public, anon, authenticated, service_role;",
    );
  });

  it("is transactional and reloads the PostgREST schema after the complete contract", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});
