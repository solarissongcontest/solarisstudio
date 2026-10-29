import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authority = readFileSync(
  "supabase/migrations/20261029221500_v3_s16_shared_runtime_authority_cutover.sql",
  "utf8",
);
const retirement = readFileSync(
  "supabase/migrations/20261029222500_v3_s16_retire_legacy_jury_score_writers.sql",
  "utf8",
);
const organizer = readFileSync(
  "src/routes/_authenticated/admin/jury/$slug.tsx",
  "utf8",
);

function body(source: string, marker: string, endMarker: string) {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start + marker.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("V3 S16 shared runtime authority cutover", () => {
  it("governs manual jury scores with scope, CAS, idempotency and durable readback", () => {
    const apply = body(
      authority,
      "create or replace function public.studio2_apply_jury_vote_change(",
      "\nrevoke all on function public.studio2_apply_jury_vote_change(",
    );

    expect(apply).toContain("studio2_access_allowed('jury.ballots.manage'");
    expect(apply).toContain("private.v3_assert_jury_vote_object_scope");
    expect(apply).toContain("private.studio2_claim_operation");
    expect(apply).toContain("p_expected_version is distinct from v_current_version");
    expect(apply).toContain("message = 'VERSION_CONFLICT'");
    expect(apply).toContain("private.studio2_complete_operation");
    expect(apply).toContain("public.studio2_reconcile_operation(v_operation_id)");
  });

  it("versions the whole show score surface so concurrent manual edits invalidate stale previews", () => {
    expect(authority).toContain("create table if not exists public.studio2_jury_vote_versions");
    expect(authority).toContain("after insert or delete or update of");
    expect(authority).toContain("on public.jury_votes");
    expect(authority).toContain("pg_advisory_xact_lock");
    expect(authority).toContain("for update");
  });

  it("removes the historical score writers from every API role after client cutover", () => {
    for (const name of ["assign_jury_vote", "clear_jury_point"]) {
      expect(retirement).toContain(`revoke all on function public.${name}(`);
    }
    expect(retirement).toContain("from public, anon, authenticated, service_role");
    expect(retirement).toContain("to postgres");
    expect(organizer).not.toMatch(/\.rpc\(\s*["']assign_jury_vote["']/);
    expect(organizer).not.toMatch(/\.rpc\(\s*["']clear_jury_point["']/);
    expect(organizer).toContain("studio2_jury_vote_change_preview");
    expect(organizer).toContain("executeJuryVoteChange");
  });

  it("retires the service-role participation bypass and pins retained internal functions", () => {
    expect(authority).toContain(
      "alter function public.admin_set_participation_status(uuid, uuid, uuid, text)",
    );
    expect(authority).toContain(
      "set search_path = pg_catalog, public, private, pg_temp",
    );
    expect(authority).toContain(
      "revoke all on function public.admin_set_participation_status(uuid, uuid, uuid, text)",
    );
    expect(authority).toContain("from public, anon, authenticated, service_role");
    expect(authority).toContain(
      "alter function public.sync_confirmation_entry_youtube_link()",
    );
  });
});
