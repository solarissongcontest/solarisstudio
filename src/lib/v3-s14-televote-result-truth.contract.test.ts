import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const foundation = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017001000_v3_s14_televote_result_truth.sql"),
  "utf8",
);
const guardHardening = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017001010_v3_s14_televote_projection_guard_hardening.sql"),
  "utf8",
);
const replayHardening = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017001020_v3_s14_televote_projection_replay_hardening.sql"),
  "utf8",
);
const upgradeWorkflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/v3-s14-televote-result-truth-rehearsal.yml"),
  "utf8",
);
const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-televote-result-truth-rehearsal.sh"),
  "utf8",
);
const replayRehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-televote-result-truth-replay-hardening-rehearsal.sh"),
  "utf8",
);
const migration = `${foundation}\n${guardHardening}\n${replayHardening}`;

function latestFunctionBody(name: string) {
  const marker = `create or replace function ${name}(`;
  const start = migration.lastIndexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 S14 published Televote result truth", () => {
  it("records exact source/version provenance for the canonical aggregate projection", () => {
    expect(migration).toContain("private.v3_televote_result_projection_sources");
    expect(migration).toContain("source_type text not null check (source_type in ('round', 'combined'))");
    expect(migration).toContain("source_version integer not null check (source_version >= 1)");
    expect(migration).toContain("payload_fingerprint text not null");
    expect(migration).toContain("projection_revision bigint not null");
  });

  it("keeps projection replacement bounded, exact-lineup and semantic-idempotent", () => {
    const body = latestFunctionBody("private.v3_apply_published_televote_projection");
    expect(body).toContain("jsonb_array_length(p_rows) not between 1 and 500");
    expect(body).toContain("pg_column_size(p_rows) > 65536");
    expect(body).toContain("Published Televote lineup does not exactly match the Solaris show");
    expect(body).toContain("Televote projection contains duplicate recipient identities");
    expect(body).toContain("IDEMPOTENCY_CONFLICT: published Televote source version changed semantics");
    expect(body).toContain("STALE_VERSION");
    expect(body).toContain("delete from public.televote_votes");
    expect(body).toContain("insert into public.televote_votes");
    expect(body).toContain("perform public.sync_show_results_from_votes(p_show_id)");
  });

  it("makes healthy exact replay a no-op and repairs projection drift without revision churn", () => {
    const body = latestFunctionBody("private.v3_apply_published_televote_projection");
    expect(body).toContain("private.v3_televote_projection_snapshot(p_show_id)");
    expect(body).toContain("v_current_fingerprint = v_existing.payload_fingerprint");
    expect(body).toContain("v_current_row_count = v_existing.row_count");
    expect(body).toContain("v_current_points_total = v_existing.points_total");
    expect(body).toContain("v_revision := v_existing.projection_revision");
    expect(body).toContain("v_repaired := true");
    const healthyReplayReturn = body.indexOf("'repaired', false");
    const bulkReplacement = body.indexOf("solaris.v3_televote_projection_bulk_replace");
    expect(healthyReplayReturn).toBeGreaterThanOrEqual(0);
    expect(bulkReplacement).toBeGreaterThan(healthyReplayReturn);
  });

  it("suppresses only canonical Televote bulk-replacement row triggers before one explicit result sync", () => {
    const body = latestFunctionBody("public.sync_results_after_vote_change");
    expect(body).toContain("tg_table_schema = 'public'");
    expect(body).toContain("tg_table_name = 'televote_votes'");
    expect(body).toContain("solaris.v3_televote_projection_write");
    expect(body).toContain("solaris.v3_televote_projection_bulk_replace");
    expect(body).toContain("perform public.sync_show_results_from_votes(coalesce(new.show_id, old.show_id))");

    const apply = latestFunctionBody("private.v3_apply_published_televote_projection");
    expect(apply).toContain("set_config('solaris.v3_televote_projection_bulk_replace', '1', true)");
    expect(apply).toContain("set_config('solaris.v3_televote_projection_bulk_replace', '0', true)");
    expect(apply.indexOf("set_config('solaris.v3_televote_projection_bulk_replace', '0', true)")).toBeLessThan(
      apply.indexOf("perform public.sync_show_results_from_votes(p_show_id)"),
    );
  });

  it("projects only the exact current published round calculation version", () => {
    const body = latestFunctionBody("private.v3_sync_published_televote_round");
    expect(body).toContain("v_round.results_status <> 'published'");
    expect(body).toContain("coalesce(v_round.results_outdated, false)");
    expect(body).toContain("v_round.broadcast_display_mode = 'combined'");
    expect(body).toContain("result_row.calculation_version = v_round.calculation_version");
    expect(body).toContain("Published Televoting round lineup does not exactly match the bound Solaris show");
  });

  it("requires every enabled Combined source round to bind to one Solaris show", () => {
    const body = latestFunctionBody("private.v3_sync_published_televote_aggregation");
    expect(body).toContain("source.enabled");
    expect(body).toContain("v_bound_round_count <> v_source_round_count");
    expect(body).toContain("v_target_count <> 1");
    expect(body).toContain("result_row.calculation_version = v_aggregation.calculation_version");
    expect(body).toContain("Published Combined Televote lineup does not exactly match the bound Solaris show");
  });

  it("materializes on authoritative publication lifecycle changes rather than browser writes", () => {
    expect(foundation).toContain("after insert or update of results_status, calculation_version, results_outdated, broadcast_display_mode");
    expect(foundation).toContain("on televoting.rounds");
    expect(foundation).toContain("after insert or update of status, calculation_version, results_outdated, published_at");
    expect(foundation).toContain("on televoting.televote_aggregations");
    expect(migration).toContain("Published Televote projection is server-managed for this show");
    expect(migration).toContain("solaris.v3_televote_projection_write");
  });

  it("does not let privileged connection identity bypass authenticated projection writes", () => {
    const body = latestFunctionBody("private.v3_guard_source_managed_televote_projection");
    expect(body).toContain("private.studio2_request_is_service_role()");
    expect(body).toContain("solaris.v3_televote_projection_write");
    expect(body).toContain("Published Televote projection is server-managed for this show");
    expect(body).not.toContain("session_user");
    expect(body).not.toContain("supabase_admin");
  });

  it("exercises the projection guard with the capability that actually passes Televote write RLS", () => {
    expect(rehearsal).toContain("'televote.ballots.manage'");
    expect(rehearsal).toContain("authenticated direct edit of published Televote projection");
    expect(rehearsal).not.toContain("values ('$USER_ID','voting.manage','$EDITION_ID'),('$USER_ID','voting.read','$EDITION_ID')");
  });

  it("proves replay no-churn, drift repair, bounded bulk reconciliation and rollback locally", () => {
    expect(replayRehearsal).toContain("Healthy exact replay must be an operational no-op");
    expect(replayRehearsal).toContain("Privileged projection drift is repaired without semantic revision churn");
    expect(replayRehearsal).toContain("bulk replacement amplified result reconciliation beyond one canonical show sync");
    expect(replayRehearsal).toContain("replacement whose final result sync fails");
    expect(replayRehearsal).toContain("failed final sync left partial Televote projection writes");
    expect(replayRehearsal).toContain("Refusing non-local database rehearsal");
  });

  it("replays every result-truth migration after the foundation in current-main upgrade proof", () => {
    const foundationCopy = upgradeWorkflow.indexOf("20261017001000_v3_s14_televote_result_truth.sql");
    const guardCopy = upgradeWorkflow.indexOf("20261017001010_v3_s14_televote_projection_guard_hardening.sql");
    const replayCopy = upgradeWorkflow.indexOf("20261017001020_v3_s14_televote_projection_replay_hardening.sql");
    expect(foundationCopy).toBeGreaterThanOrEqual(0);
    expect(guardCopy).toBeGreaterThan(foundationCopy);
    expect(replayCopy).toBeGreaterThan(guardCopy);
    expect(upgradeWorkflow).toContain("v3-s14-televote-result-truth-replay-hardening-rehearsal.sh");
  });

  it("exposes safe provenance diagnostics without exposing raw ballots", () => {
    const body = latestFunctionBody("public.studio2_televote_projection_status");
    expect(body).toContain("studio2_access_allowed('voting.read'");
    expect(body).toContain("studio2_access_allowed('system.read'");
    expect(body).toContain("'sourceVersion'");
    expect(body).toContain("'projectionRevision'");
    expect(body).toContain("'pointsTotal'");
    expect(body).not.toContain("vote_submissions");
    expect(body).not.toContain("ip_hash");
    expect(body).not.toContain("fingerprint_hash");
  });
});
