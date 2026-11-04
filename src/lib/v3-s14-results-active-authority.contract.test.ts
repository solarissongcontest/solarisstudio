import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const current = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261104132500_v3_s14_results_reconciliation_authority.sql"),
  "utf8",
);
const originalAudit = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261103210000_v3_s14_televote_sync_audit_rpc.sql"),
  "utf8",
);

describe("S14 Results active identity, history and canonical rank authority", () => {
  it("repairs rather than rewriting the applied migration and registers a forward-only contract", () => {
    expect(originalAudit).toContain("select count(*) into v_studio_count");
    expect(current).toContain("'v3.results.active-identity-and-rank-verification'");
    expect(current).toContain("'forward_fix_only'");
    expect(current).not.toContain("delete from public.results");
    expect(current).toContain("v3_record_televote_sync_event");
    expect(current).toContain("IDEMPOTENCY_CONFLICT: Televote sync receipt changed semantics");
  });

  it("compares actual source identities with confirmed recipients and active Results only", () => {
    expect(current).toContain("count(distinct eligible.country_id)");
    expect(current).toContain("v_source_count <> v_unique_source_count");
    expect(current).toContain("v_source_count <> v_active_participant_count");
    expect(current).toContain("v_source_count <> v_matched_count");
    expect(current).toContain("v_source_count <> v_studio_count");
    expect(current).toContain("and sr.televote_points = rr.final_points");
    expect(current).toContain("and sr.televote_points = rr.final_combined_points");
    expect(current).toContain("and coalesce(eligible.participation_status, 'confirmed') = 'confirmed'");
  });

  it("preserves legitimate withdrawn/disqualified history while rejecting pending, waitlisted and orphan results", () => {
    expect(current).toContain("in ('confirmed', 'withdrawn', 'disqualified')");
    expect(current).toContain("not in ('confirmed', 'withdrawn', 'disqualified')");
    expect(current).toContain("invalidNonactiveResultRowCount");
    expect(current).toContain("v_invalid_nonactive_result_rows");
    expect(current).toContain("invalid inactive or orphan Results identity");
  });

  it("uses the same canonical rank projection for official writes and read-only verification", () => {
    expect(current).toContain("create or replace function private.studio2_expected_result_ranks");
    expect(current).toContain("row_number() over");
    expect(current).toContain("then k.countback_counts else null::integer[] end desc nulls last");
    expect(current).toContain("array_agg(score order by score desc)");
    expect(current).toContain("v_config->'tieBreak'");
    expect(current).toContain("from private.studio2_expected_result_ranks(_show_id) ranked");
    expect(current).toContain("from private.studio2_expected_result_ranks(p_show_id) expected");
    expect(current).toContain("where r.final_rank is distinct from expected.final_rank");
    expect(current).toContain("'incorrectCanonicalRankCount'");
    expect(current).toContain("and coalesce(p.participation_status, 'confirmed') = 'confirmed'");
  });

  it("retains organizer-only, RLS-protected counterfactual influence evidence", () => {
    expect(current).toContain("alter table televoting.round_influence_results enable row level security");
    expect(current).toContain("revoke all on table televoting.round_influence_results from public, anon");
    expect(current).toContain("revoke truncate, references, trigger");
    expect(current).toContain("on table televoting.round_influence_results from authenticated");
    // This is rebuildable analysis and the existing official calculation RPC
    // is SECURITY INVOKER. Authenticated DML must remain capability-scoped.
    expect(current).toContain("grant select, insert, update, delete");
    expect(current).toContain("public.studio2_access_allowed('voting.manage', null, false)");
    expect(current).toContain("with check (public.studio2_access_allowed('voting.manage', null, false))");
  });
});
