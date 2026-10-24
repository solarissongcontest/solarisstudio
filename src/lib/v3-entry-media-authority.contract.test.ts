import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024224500_v3_p14_entry_media_participant_authority.sql",
  ),
  "utf8",
);

function functionBody(name: string): string {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("V3 P14 Entry media participant authority", () => {
  it("keeps Entry media caller-scoped and server-authorized", () => {
    const prepare = functionBody("public.v3_prepare_entry_media_upload");

    expect(prepare).toContain("v_actor uuid := auth.uid()");
    expect(prepare).toContain("message = 'AUTHENTICATION'");
    expect(prepare).toContain("private.v3_next_in_line_actor_controls_country");
    expect(prepare).toContain("'purpose', 'entry_media'");
    expect(prepare).toContain("'expectedSourceFingerprint', v_expected_source");
    expect(prepare).toContain("'storagePublicBase', v_storage_base");
    expect(prepare).toContain("'solaris-upload-quarantine'");
    expect(prepare).toContain("'country-media'");
    expect(prepare).not.toContain("service_role");

    expect(migration).toContain(
      "revoke all on function public.v3_prepare_entry_media_upload(\n  uuid, text, text, text, bigint\n) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_prepare_entry_media_upload(\n  uuid, text, text, text, bigint\n) to authenticated;",
    );
  });

  it("allows only media types the current verified-image finalizer can validate", () => {
    const supported = functionBody("private.v3_entry_media_supported_asset_type");
    const prepare = functionBody("public.v3_prepare_entry_media_upload");

    expect(supported).toContain("'artist_photo'");
    expect(supported).toContain("'cover_artwork'");
    expect(supported).not.toContain("'audio_master'");
    expect(supported).not.toContain("'performance_video'");
    expect(prepare).toContain("v_mime not in ('image/jpeg', 'image/png', 'image/webp')");
    expect(prepare).toContain("p_size > 5242880");
    expect(prepare).toContain("private.studio2_upload_extension(\n    'country_media'");
  });

  it("commits only a verified exact token and blocks stale cross-device overwrites", () => {
    const commit = functionBody("public.v3_commit_entry_media_upload");

    expect(commit).toContain("upload_auth.actor_id = v_actor");
    expect(commit).toContain("upload_auth.context ->> 'purpose' = 'entry_media'");
    expect(commit).toContain("v_authorization.status <> 'verified'");
    expect(commit).toContain("private.v3_next_in_line_actor_controls_country");
    expect(commit).toContain("v_current_source is not distinct from v_public_url");
    expect(commit).toContain("v_current_source is distinct from v_expected_source");
    expect(commit).toContain("message = 'STATE_CHANGED'");
    expect(commit).toContain("after-update trigger supersedes any active review");
    expect(commit).not.toContain("authorization_secret");
  });

  it("projects only caller-owned current-source review evidence", () => {
    const projection = functionBody("public.v3_my_entry_media");

    expect(projection).toContain("v_actor uuid := auth.uid()");
    expect(projection).toContain("private.v3_next_in_line_actor_controls_country");
    expect(projection).toContain("review.superseded_at is null");
    expect(projection).toContain("review.source_fingerprint = v_source");
    expect(projection).toContain("review.decision = 'approved'");
    expect(projection).toContain("v_state := 'replacement_required'");
    expect(projection).toContain("Organizer review requires a replacement for this media.");
    expect(projection).not.toContain("review.reviewed_by");
    expect(projection).not.toContain("authorization_secret");
    expect(projection).not.toContain("quarantine_path");

    expect(migration).toContain(
      "revoke all on function public.v3_my_entry_media(uuid)\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_my_entry_media(uuid)\n  to authenticated;",
    );
  });

  it("derives environment-specific storage origin from signed JWT context", () => {
    const base = functionBody("private.v3_entry_media_storage_base_from_jwt");

    expect(base).toContain("auth.jwt() ->> 'iss'");
    expect(base).toContain("/auth/v1/?$");
    expect(base).toContain("/storage/v1/object/public");
    expect(base).not.toContain("supabase.co");
  });
});
