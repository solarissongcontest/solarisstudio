import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023205500_v3_jury_share_projection.sql",
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

describe("System V3 Jury Share projection", () => {
  it("registers as an additive semantic S13 migration", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.results.jury-share-projection-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,");
    expect(migration).toContain("without backfilling unprovable historical Result Versions");
    expect(migration).not.toMatch(/v3_register_migration_contract\(\s*'\d/);
  });

  it("captures immutable Jury input evidence for new Result Versions without duplicating ballots", () => {
    expect(migration).toContain("private.v3_result_jury_inputs");
    expect(migration).toContain("foreign key (show_id, result_version)");
    expect(migration).toContain("references private.v3_result_versions (show_id, version)");
    expect(migration).toContain("v3_reject_result_jury_input_mutation");
    expect(migration).toContain("private.v3_reject_result_version_mutation()");
    expect(migration).not.toContain("jury_share_votes");
    expect(migration).not.toContain("jury_share_ballots");
  });

  it("fingerprints every Jury input family that can affect canonical result readiness", () => {
    const body = functionBody("private.v3_jury_result_input_evidence");
    expect(body).toContain("public.jury_ballot_submissions");
    expect(body).toContain("public.jury_votes");
    expect(body).toContain("public.jury_ballot_statuses");
    expect(body).toContain("'reviewVersion', ballot.review_version");
    expect(body).toContain("'points', vote.points");
    expect(body).toContain("'version', status_row.version");
    expect(body).toContain("extensions.digest");
    expect(body).not.toContain("ballot.user_id");
  });

  it("captures the fingerprint exactly when the canonical calculation version advances", () => {
    const body = functionBody("private.v3_capture_result_jury_input");
    expect(body).toContain("new.calculation_version < 1");
    expect(body).toContain("new.calculation_version = old.calculation_version");
    expect(body).toContain("private.v3_jury_result_input_evidence(new.show_id)");
    expect(body).toContain("new.calculation_version");
    expect(migration).toContain("after insert or update of calculation_version");
    expect(migration).toContain("on public.studio2_result_operations");
    expect(migration).toContain("Existing historical Result Versions");
    expect(migration).toContain("deliberately NOT backfilled");
  });

  it("requires canonical Results and Jury publication plus an exact source Result Version", () => {
    const body = functionBody("public.v3_jury_share_projection");
    expect(body).toContain("v_control.state = 'public'");
    expect(body).toContain("v_control.source_result_version is not null");
    expect(body).toContain("show_publication_enabled(p_show_id, 'results')");
    expect(body).toContain("show_publication_enabled(p_show_id, 'jury_results')");
    expect(body).toContain("private.v3_result_versions");
    expect(body).toContain("private.v3_result_jury_inputs");
    expect(body).toContain("JURY_SHARE_NOT_PUBLISHED");
  });

  it("keeps public country sharing behind detailed-voting publication while preserving authenticated owner access", () => {
    const body = functionBody("public.v3_jury_share_projection");
    expect(body).toContain("public.show_publication_enabled(p_show_id, 'detailed_voting')");
    expect(body).toContain("v_ballot.user_id = v_actor");
    expect(body).toContain("public.country_accounts");
    expect(body).toContain("not v_service and not v_owner and not v_public_detail");
    expect(body).toContain("using errcode = '42501'");
    expect(body).toContain("case when v_public_detail then 'public' else 'private' end");
  });

  it("refuses stale or historically unproven Jury inputs instead of fabricating an official card", () => {
    const body = functionBody("public.v3_jury_share_projection");
    expect(body).toContain("published_result_lacks_exact_jury_input_evidence");
    expect(body).toContain("jury_inputs_changed_after_published_result_version");
    expect(body).toContain("JURY_SHARE_RESULT_CHANGED");
    expect(body).toContain("v_current_fingerprint is distinct from v_saved_evidence.jury_input_fingerprint");
    expect(migration.toLowerCase()).not.toContain("insert into private.v3_result_jury_inputs\nselect");
  });

  it("requires one finalized canonical 12-10-8-through-1 ballot bound to its submission", () => {
    const body = functionBody("public.v3_jury_share_projection");
    expect(body).toContain("v_ballot.status <> 'valid'");
    expect(body).toContain("vote.ballot_submission_id = v_ballot.id");
    expect(body).toContain("v_vote_count <> 10");
    expect(body).toContain("v_recipient_count <> 10");
    expect(body).toContain("array[12,10,8,7,6,5,4,3,2,1]::integer[]");
    expect(body).toContain("unsupported_or_incomplete_jury_point_set");
  });

  it("resolves edition-scoped country identity and binds render state to result, ballot and identity versions", () => {
    const body = functionBody("public.v3_jury_share_projection");
    expect(body).toContain("public.country_edition_identities");
    expect(body).toContain("identity.edition_id = v_show.edition_id");
    expect(body).toContain("'historicalIdentityVersion'");
    expect(body).toContain("'identityVersion'");
    expect(body).toContain("v_ballot.review_version::text");
    expect(body).toContain("v_control.source_result_version::text");
    expect(body).toContain("v_saved_evidence.jury_input_fingerprint");
    expect(body).toContain("'stateVersion'");
  });

  it("uses the matching successful publication execution as published-at evidence", () => {
    const body = functionBody("public.v3_jury_share_projection");
    expect(body).toContain("public.studio2_show_publication_executions");
    expect(body).toContain("execution.status = 'succeeded'");
    expect(body).toContain("execution.source_result_version = v_control.source_result_version");
    expect(body).toContain("order by execution.executed_at desc");
    expect(body).toContain("'publishedAt'");
  });

  it("keeps the public RPC read-only and does not expose sensitive ballot internals", () => {
    const body = functionBody("public.v3_jury_share_projection");
    expect(body.toLowerCase()).not.toMatch(/\binsert\s+into\b/);
    expect(body.toLowerCase()).not.toMatch(/\bupdate\s+public\./);
    expect(body.toLowerCase()).not.toMatch(/\bdelete\s+from\b/);
    expect(body).not.toContain("'userId'");
    expect(body).not.toContain("'riskScore'");
    expect(body).not.toContain("'reviewReason'");
    expect(body).not.toContain("'preflightId'");
  });

  it("locks down SECURITY DEFINER helpers and explicitly exposes only the validated projection boundary", () => {
    expect(migration).toContain(
      "revoke all on function private.v3_jury_result_input_evidence(uuid)\n  from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke all on function public.v3_jury_share_projection(uuid, uuid)\n  from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_jury_share_projection(uuid, uuid)\n  to anon, authenticated, service_role;",
    );
    expect(functionBody("public.v3_jury_share_projection")).toContain(
      "set search_path = pg_catalog, public, private, extensions",
    );
  });

  it("is transactional and reloads PostgREST only after installing the complete contract", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});
