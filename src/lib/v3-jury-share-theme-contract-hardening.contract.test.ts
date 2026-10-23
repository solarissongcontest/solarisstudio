import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hardening = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023205800_v3_jury_share_theme_contract_hardening.sql",
  ),
  "utf8",
);

const validatorFix = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023205900_v3_jury_share_theme_validator_fix.sql",
  ),
  "utf8",
);

function functionBody(source: string, name: string) {
  const marker = `create or replace function ${name}(`;
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("create or replace function", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("System V3 Jury Share theme contract hardening", () => {
  it("registers semantic forward-only hardening migrations", () => {
    expect(hardening).toContain("'v3.results.jury-share-theme-contract-hardening-v1'");
    expect(validatorFix).toContain("'v3.results.jury-share-theme-validator-fix-v1'");
    expect(hardening).toContain("'forward_fix_only'");
    expect(validatorFix).toContain("'forward_fix_only'");
  });

  it("introduces the exact share-theme view/manage capabilities requested by Organizer", () => {
    expect(hardening).toContain("'edition.share_theme.view'");
    expect(hardening).toContain("'edition.share_theme.manage'");
    expect(hardening).toContain("'read'");
    expect(hardening).toContain("'operate'");
    expect(hardening).toContain("where rc.capability = 'edition.manage'");
    expect(hardening).toContain("on conflict (role_key, capability) do nothing");
  });

  it("narrows the Organizer read boundary to edition.share_theme.view", () => {
    const state = functionBody(hardening, "public.studio2_jury_share_theme_state");
    expect(state).toContain("'edition.share_theme.view'");
    expect(state).not.toContain("studio2_access_allowed('edition.manage'");
    expect(state).toContain("'stateVersion'");
    expect(state).toContain("private.v3_jury_share_theme_state_version(p_edition_id)");
  });

  it("retires the broad-capability mutation signatures before exposing reason-aware commands", () => {
    expect(hardening).toContain(
      "drop function public.studio2_save_jury_share_theme_draft(\n  uuid, uuid, jsonb, bigint, uuid, text, uuid\n);",
    );
    expect(hardening).toContain(
      "drop function public.studio2_activate_jury_share_theme(\n  uuid, bigint, uuid, text, uuid\n);",
    );
    expect(hardening).toContain(
      "drop function public.studio2_archive_jury_share_theme(\n  uuid, bigint, uuid, text, uuid\n);",
    );
  });

  it("requires edition.share_theme.manage for every Organizer mutation", () => {
    for (const name of [
      "public.studio2_save_jury_share_theme_draft",
      "public.studio2_activate_jury_share_theme",
      "public.studio2_archive_jury_share_theme",
    ]) {
      const source = functionBody(hardening, name);
      expect(source).toContain("'edition.share_theme.manage'");
      expect(source).not.toContain("studio2_access_allowed('edition.manage'");
    }
  });

  it("requires an operator reason for new versions and Ready/archive lifecycle changes", () => {
    const save = functionBody(hardening, "public.studio2_save_jury_share_theme_draft");
    expect(save).toContain("p_theme_id is null");
    expect(save).toContain("nullif(btrim(coalesce(p_reason, '')), '') is null");
    expect(save).toContain("length(coalesce(p_reason, '')) > 500");
    expect(save).toContain("'reason', nullif(btrim(coalesce(p_reason, '')), '')");

    const activate = functionBody(hardening, "public.studio2_activate_jury_share_theme");
    expect(activate).toContain("Activation reason is required");
    expect(activate).toContain("'reason', btrim(p_reason)");

    const archive = functionBody(hardening, "public.studio2_archive_jury_share_theme");
    expect(archive).toContain("Archive reason is required");
    expect(archive).toContain("'reason', btrim(p_reason)");
  });

  it("returns deterministic stateVersion from reads and consequential command results", () => {
    expect(hardening).toContain("private.v3_jury_share_theme_state_version");
    expect(hardening).toContain("theme.composition_hash");
    expect(hardening).toContain("theme.validation_state");
    expect(hardening.match(/'stateVersion'/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("enforces the canonical structured composition envelope", () => {
    const validate = functionBody(
      validatorFix,
      "private.v3_validate_jury_share_theme_composition",
    );
    for (const key of [
      "artwork",
      "scoreboard",
      "header",
      "background",
      "footer",
      "decorativeAssets",
      "safeArea",
    ]) {
      expect(validate).toContain(`'${key}'`);
    }
    expect(validate).toContain("UNKNOWN_COMPOSITION_FIELDS");
    expect(validate).toContain("MISSING_COMPOSITION_SECTION");
    expect(validate).toContain("INVALID_COMPOSITION_SECTION_TYPE");
    expect(validate).toContain("INVALID_SAFE_AREA");
    expect(validate).toContain("INVALID_ARTWORK_TREATMENT");
    expect(validate).toContain("from jsonb_object_keys(p_composition) as keys(key)");
  });

  it("requires the implementation-ready artwork contract instead of accepting missing numeric fields", () => {
    const validate = functionBody(
      validatorFix,
      "private.v3_validate_jury_share_theme_composition",
    );
    for (const key of [
      "assetId",
      "placement",
      "focalX",
      "focalY",
      "scale",
      "opacity",
      "blurPx",
      "fadeDirection",
      "scrimStrength",
    ]) {
      expect(validate).toContain(`v_artwork ? '${key}'`);
    }
    expect(validate).toContain("'top_fade'");
    expect(validate).toContain("'bottom_fade'");
    expect(validate).toContain("'cover', 'contain'");
    expect(validate).toContain("'none', 'up', 'down', 'radial'");
  });

  it("keeps validation evidence server-owned rather than letting the browser self-approve a theme", () => {
    expect(hardening).not.toContain(
      "grant execute on function public.v3_set_jury_share_theme_validation(\n  uuid, bigint, boolean, jsonb\n) to authenticated;",
    );
  });
});
