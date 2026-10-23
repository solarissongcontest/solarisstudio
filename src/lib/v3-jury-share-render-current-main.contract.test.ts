import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023212000_v3_jury_share_render_coordination.sql",
  ),
  "utf8",
);

function body(name: string) {
  const marker = `create or replace function ${name}(`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 Jury Share render coordination", () => {
  it("registers the current-main JSC-4 slice with S13 and stores metadata only", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.results.jury-share-render-coordination-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("create table private.v3_jury_share_render_cache");
    expect(migration).toContain("Image bytes never live in Postgres");
    expect(migration).not.toMatch(/\b(bytea|image_binary|render_binary|blob_data)\b/i);
  });

  it("binds every render key to projection state, visibility, renderer version and exact theme evidence", () => {
    const identity = body("private.v3_jury_share_render_identity");
    for (const field of [
      "rendererContractVersion",
      "ballotId",
      "resultVersionId",
      "projectionStateVersion",
      "visibility",
      "sourceIdentityVersion",
      "recipientIdentityVersionSetHash",
      "themeId",
      "themeVersion",
      "themeFingerprint",
      "themeCompositionHash",
      "themeValidationContractVersion",
      "outputTarget",
      "format",
    ]) {
      expect(identity).toContain(`'${field}'`);
    }
    expect(identity).toContain(
      "extensions.digest(convert_to(v_identity::text, 'UTF8'), 'sha256')",
    );
  });

  it("never reuses a private artifact as public merely because the ballot content is unchanged", () => {
    const identity = body("private.v3_jury_share_render_identity");
    expect(identity).toContain("v_visibility := coalesce(v_envelope ->> 'visibility', 'private')");
    expect(identity).toContain("'visibility', v_visibility");
    expect(migration).toContain("visibility text not null check (visibility in ('public', 'private'))");
    expect(migration).toContain("(visibility = 'public' and expires_at is null)");
    expect(migration).toContain("(visibility = 'private' and expires_at is not null)");
  });

  it("binds Edition renders to the exact validated recipe rather than only an edition/version label", () => {
    const identity = body("private.v3_jury_share_render_identity");
    expect(identity).toContain("public.v3_jury_share_edition_theme(p_show_id)");
    expect(identity).toContain("v_theme ->> 'compositionHash'");
    expect(identity).toContain("v_theme ->> 'renderValidationVersion'");
    expect(identity).toContain("v_theme_validation_contract is distinct from 1");
    expect(identity).toContain("'compositionHash', v_theme_composition_hash");
    expect(identity).toContain("'renderValidationVersion', v_theme_validation_contract");
    expect(migration).toContain("theme_composition_hash text");
    expect(migration).toContain("theme_validation_contract_version integer");
  });

  it("versions the renderer itself so renderer changes can invalidate otherwise identical cache identity", () => {
    const identity = body("private.v3_jury_share_render_identity");
    expect(identity).toContain("v_renderer_contract integer := 1");
    expect(identity).toContain("'rendererContractVersion', v_renderer_contract");
    expect(migration).toContain("renderer_contract_version integer not null default 1");
  });

  it("bounds the render matrix and fails Liquid Glass closed until its renderer exists", () => {
    const identity = body("private.v3_jury_share_render_identity");
    expect(identity).toContain("v_target <> 'story'");
    expect(identity).toContain("v_format not in ('png', 'jpeg')");
    expect(identity).toContain("'themeId', 'liquid_glass'");
    expect(identity).toContain("'JURY_SHARE_THEME_UNAVAILABLE'");
    expect(migration).toContain("width integer not null default 1080 check (width = 1080)");
    expect(migration).toContain("height integer not null default 1920 check (height = 1920)");
  });

  it("keeps the cache and all coordination RPCs service-only", () => {
    expect(migration).toContain(
      "alter table private.v3_jury_share_render_cache enable row level security",
    );
    expect(migration).toContain(
      "revoke all on table private.v3_jury_share_render_cache\n  from public, anon, authenticated",
    );
    for (const name of [
      "public.v3_claim_jury_share_render",
      "public.v3_complete_jury_share_render",
      "public.v3_jury_share_render_status",
      "public.v3_prune_jury_share_render_cache",
    ]) {
      expect(body(name)).toContain("private.studio2_request_is_service_role()");
    }
    expect(migration).not.toMatch(
      /grant execute on function public\.v3_(?:claim|complete)_jury_share_render[\s\S]*?to authenticated/i,
    );
  });

  it("makes render identity columns immutable after claim", () => {
    const guard = body("private.v3_guard_jury_share_render_identity");
    expect(guard).toContain("new.render_key is distinct from old.render_key");
    expect(guard).toContain("new.projection_state_version is distinct from old.projection_state_version");
    expect(guard).toContain("new.visibility is distinct from old.visibility");
    expect(guard).toContain("new.theme_fingerprint is distinct from old.theme_fingerprint");
    expect(guard).toContain("new.theme_composition_hash is distinct from old.theme_composition_hash");
    expect(guard).toContain("Jury Share render identity is immutable; claim a new render key");
  });

  it("deduplicates concurrent identical renders with leases and bounded retry behavior", () => {
    const claim = body("public.v3_claim_jury_share_render");
    expect(claim).toContain("pg_advisory_xact_lock(");
    expect(claim).toContain("v_row.status = 'pending'");
    expect(claim).toContain("v_row.lease_expires_at > v_now");
    expect(claim).toContain("'retryAfterSeconds'");
    expect(claim).toContain("v_now + interval '2 minutes'");
    expect(claim).toContain("coalesce(v_row.attempt_count, 0) >= 8");
    expect(claim).toContain("JURY_SHARE_RENDER_RETRY_LIMIT");
    expect(claim).toContain("v_active_count >= 4");
    expect(claim).toContain("JURY_SHARE_RENDER_CONCURRENCY_LIMIT");
  });

  it("uses deterministic internal paths and bounded output metadata", () => {
    const claim = body("public.v3_claim_jury_share_render");
    expect(claim).toContain("'jury-share/' || v_visibility || '/'");
    expect(claim).toContain("left(v_render_key, 2)");
    expect(migration).toContain("expected_storage_path !~ '(^|/)\\.\\.(/|$)'");
    expect(migration).toContain("expected_storage_path !~* '^[a-z][a-z0-9+.-]*://'");
    expect(migration).toContain("byte_size is null or byte_size between 1 and 15728640");

    const complete = body("public.v3_complete_jury_share_render");
    expect(complete).toContain("p_storage_path is distinct from v_row.expected_storage_path");
    expect(complete).toContain("p_byte_size not between 1 and 15728640");
  });

  it("revalidates canonical truth after render and before exposing the artifact", () => {
    const complete = body("public.v3_complete_jury_share_render");
    const rebuild = complete.indexOf("private.v3_jury_share_render_identity(");
    const readyWrite = complete.indexOf("status = 'ready'");
    expect(rebuild).toBeGreaterThanOrEqual(0);
    expect(readyWrite).toBeGreaterThan(rebuild);
    expect(complete).toContain("v_identity ->> 'renderKey' is distinct from p_render_key");
    expect(complete).toContain("v_identity ->> 'visibility' is distinct from v_row.visibility");
    expect(complete).toContain(
      "v_identity ->> 'projectionStateVersion' is distinct from v_row.projection_state_version",
    );
    expect(complete).toContain(
      "v_identity ->> 'themeFingerprint' is distinct from v_row.theme_fingerprint",
    );
    expect(complete).toContain("JURY_SHARE_RESULT_CHANGED");
  });

  it("revalidates ready cache status instead of trusting stale metadata", () => {
    const status = body("public.v3_jury_share_render_status");
    expect(status).toContain("if v_row.status = 'ready' then");
    expect(status).toContain("private.v3_jury_share_render_identity(");
    expect(status).toContain("'status', 'stale'");
    expect(status).toContain("'status', 'expired'");
  });

  it("keeps private renders short-lived and prunes stale metadata in bounded batches", () => {
    const claim = body("public.v3_claim_jury_share_render");
    expect(claim).toContain("v_now + interval '15 minutes'");

    const prune = body("public.v3_prune_jury_share_render_cache");
    expect(prune).toContain("p_limit > 1000");
    expect(prune).toContain("limit p_limit");
    expect(prune).toContain("for update skip locked");
    expect(prune).toContain("interval '1 day'");
    expect(prune).toContain("interval '7 days'");
  });

  it("is transactional and installs no browser-facing image mutation surface", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/grant\s+(?:insert|update|delete)[\s\S]*?to\s+authenticated/i);
  });
});
