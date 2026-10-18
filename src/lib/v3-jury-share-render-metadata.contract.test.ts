import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019003500_v3_jury_share_render_metadata.sql",
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

describe("System V3 Jury Share deterministic render metadata", () => {
  it("stores bounded metadata only and never image binary", () => {
    expect(migration).toContain("private.v3_jury_share_render_cache");
    expect(migration).toContain("byte_size bigint");
    expect(migration).toContain("byte_size between 1 and 15728640");
    expect(migration).toContain("expected_storage_path text not null");
    expect(migration).toContain("storage_path text");
    expect(migration).not.toMatch(/\b(bytea|image_binary|render_binary|blob_data)\b/i);
    expect(migration).toContain("Binary images live in storage");
  });

  it("derives render identity from canonical ballot/result/history/theme inputs", () => {
    const body = functionBody("private.v3_jury_share_render_identity");
    expect(body).toContain("public.v3_jury_share_projection(p_show_id, p_voter_country_id)");
    expect(body).toContain("'ballotId'");
    expect(body).toContain("'resultVersionId'");
    expect(body).toContain("'sourceIdentityVersion'");
    expect(body).toContain("'recipientIdentityVersionSetHash'");
    expect(body).toContain("'themeId'");
    expect(body).toContain("'themeVersion'");
    expect(body).toContain("'outputTarget'");
    expect(body).toContain("'format'");
    expect(body).toContain("extensions.digest");
  });

  it("accepts only bounded initial output targets, formats and known theme ids", () => {
    const body = functionBody("private.v3_jury_share_render_identity");
    expect(body).toContain("v_theme_id not in ('default', 'edition', 'liquid_glass')");
    expect(body).toContain("v_target <> 'story'");
    expect(body).toContain("v_format not in ('png', 'jpeg')");
    expect(body).toContain("'JURY_SHARE_FORMAT_UNSUPPORTED'");
    expect(body).toContain("'themeId', 'liquid_glass'");
    expect(body).toContain("'JURY_SHARE_THEME_UNAVAILABLE'");
  });

  it("resolves Edition theme version from the canonical versioned theme backend", () => {
    const body = functionBody("private.v3_jury_share_render_identity");
    expect(body).toContain("public.v3_jury_share_edition_theme(p_show_id)");
    expect(body).toContain("v_theme_version := (v_theme ->> 'version')::integer");
    expect(body).toContain("v_theme_version := 1");
  });

  it("revalidates authoritative publication before every claim, including cache hits", () => {
    const claim = functionBody("public.v3_claim_jury_share_render");
    const identityCall = claim.indexOf("private.v3_jury_share_render_identity(");
    const cacheLookup = claim.indexOf("private.v3_jury_share_render_cache cache");
    expect(identityCall).toBeGreaterThanOrEqual(0);
    expect(cacheLookup).toBeGreaterThan(identityCall);
    expect(claim).toContain("v_row.status = 'ready'");
    expect(claim).toContain("v_row.expires_at is null or v_row.expires_at > v_now");
  });

  it("deduplicates concurrent renders with an expiring lease and bounded retries", () => {
    const claim = functionBody("public.v3_claim_jury_share_render");
    expect(claim).toContain("pg_advisory_xact_lock");
    expect(claim).toContain("for update");
    expect(claim).toContain("v_row.status = 'pending'");
    expect(claim).toContain("v_row.lease_expires_at > v_now");
    expect(claim).toContain("retryAfterSeconds");
    expect(claim).toContain("attempt_count, 0) >= 8");
    expect(claim).toContain("JURY_SHARE_RENDER_RETRY_LIMIT");
    expect(claim).toContain("v_now + interval '2 minutes'");
  });

  it("keeps personal renders short-lived while public renders may be immutable", () => {
    const claim = functionBody("public.v3_claim_jury_share_render");
    expect(claim).toContain("when v_visibility = 'private' then v_now + interval '15 minutes'");
    expect(migration).toContain("visibility = 'public' and expires_at is null");
    expect(migration).toContain("visibility = 'private' and expires_at is not null");
  });

  it("uses deterministic internal storage paths and rejects remote/traversal paths", () => {
    const claim = functionBody("public.v3_claim_jury_share_render");
    expect(claim).toContain("'jury-share/' || v_visibility || '/' || v_render_key");
    expect(migration).toContain("expected_storage_path !~ '(^|/)\\.\\.(/|$)'");
    expect(migration).toContain("expected_storage_path !~* '^[a-z][a-z0-9+.-]*://'");
    const complete = functionBody("public.v3_complete_jury_share_render");
    expect(complete).toContain("p_storage_path is distinct from v_row.expected_storage_path");
  });

  it("revalidates result/publication/theme state immediately before successful completion", () => {
    const complete = functionBody("public.v3_complete_jury_share_render");
    const validate = complete.indexOf("private.v3_jury_share_render_identity(");
    const readyWrite = complete.indexOf("set status = 'ready'");
    expect(validate).toBeGreaterThanOrEqual(0);
    expect(readyWrite).toBeGreaterThan(validate);
    expect(complete).toContain("v_identity ->> 'renderKey' is distinct from p_render_key");
    expect(complete).toContain("JURY_SHARE_RESULT_CHANGED");
  });

  it("makes completion replay idempotent without accepting a different lease or object", () => {
    const complete = functionBody("public.v3_complete_jury_share_render");
    expect(complete).toContain("v_row.status = 'ready'");
    expect(complete).toContain("v_row.lease_token = p_lease_token");
    expect(complete).toContain("p_storage_path is not distinct from v_row.storage_path");
    expect(complete).toContain("p_byte_size is not distinct from v_row.byte_size");
    expect(complete).toContain("'replayed', true");
    expect(complete).toContain("JURY_SHARE_RENDER_LEASE_CONFLICT");
  });

  it("never returns a stale ready artifact from the status boundary", () => {
    const status = functionBody("public.v3_jury_share_render_status");
    expect(status).toContain("private.v3_jury_share_render_identity(");
    expect(status).toContain("v_identity ->> 'renderKey' is distinct from p_render_key");
    expect(status).toContain("'status', 'stale'");
    expect(status).toContain("'status', 'expired'");
  });

  it("keeps all render coordination RPCs service-only", () => {
    expect(migration).toContain(
      "grant execute on function public.v3_claim_jury_share_render(\n  uuid, uuid, text, text, text\n) to service_role;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_complete_jury_share_render(\n  text, uuid, boolean, text, bigint, text\n) to service_role;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_jury_share_render_status(text)\n  to service_role;",
    );
    expect(migration).not.toMatch(/grant execute on function public\.v3_(claim|complete)_jury_share_render[\s\S]*?to authenticated;/i);
    expect(migration).not.toMatch(/grant execute on function public\.v3_(claim|complete)_jury_share_render[\s\S]*?to anon;/i);
    expect(functionBody("public.v3_claim_jury_share_render")).toContain(
      "private.studio2_request_is_service_role()",
    );
  });

  it("is transactional and reloads PostgREST only after installing the full contract", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});
