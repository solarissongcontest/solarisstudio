import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018113000_v3_televote_result_source_truth.sql",
  ),
  "utf8",
);
const bridge = readFileSync(
  resolve(process.cwd(), "src/integrations/televoting/results-sync.server.ts"),
  "utf8",
);

describe("System V3 published Televote -> Studio Results source truth", () => {
  it("uses the publication bridge's durable completed event as exact import evidence", () => {
    expect(bridge).toContain('service: "televoting"');
    expect(bridge).toContain('"round.results.imported"');
    expect(bridge).toContain('"combined.results.imported"');
    expect(bridge).toContain('status: error ? "failed" : outcome.ok ? "completed" : "skipped"');

    expect(migration).toContain("create table if not exists public.studio2_televote_result_imports");
    expect(migration).toContain("source_version bigint not null");
    expect(migration).toContain("source_round_ids text[] not null");
    expect(migration).toContain("points jsonb not null");
    expect(migration).toContain("source_event_id uuid not null");
    expect(migration).toContain("studio2_capture_televote_result_import");
    expect(migration).toContain("new.status <> 'completed'");
  });

  it("re-resolves the current published source version instead of trusting a stale receipt", () => {
    expect(migration).toContain("televoting.round_results");
    expect(migration).toContain("televoting.combined_televote_results");
    expect(migration).toContain("result.calculation_version = v_source_version");
    expect(migration).toContain("round.results_status = 'published'");
    expect(migration).toContain("aggregation.status = 'published'");
    expect(migration).toContain("not coalesce(round.results_outdated, false)");
    expect(migration).toContain("not coalesce(aggregation.results_outdated, false)");
    expect(migration).toContain("v_bound_rows <> cardinality(v_round_ids)");
    expect(migration).toContain("coalesce(v_snapshot -> 'points', '{}'::jsonb) = v_import.points");
  });

  it("requires exact lineup and public.results projection parity before readiness", () => {
    expect(migration).toContain("v_expected_ids is distinct from v_point_ids");
    expect(migration).toContain("v_result_rows <> cardinality(v_expected_ids)");
    expect(migration).toContain("v_projection_matches <> cardinality(v_expected_ids)");
    expect(migration).toContain("v_expected_ids = v_point_ids");
    expect(migration).toContain("v_projection_matches = cardinality(v_expected_ids)");
    expect(migration).toContain("'televoteSource', 'published_import'");
    expect(migration).toContain("'televoteSourceVersion'");
  });

  it("makes replay idempotent and rejects same-source stale or mutated versions", () => {
    expect(migration).toContain("on conflict (show_id) do update");
    expect(migration).toContain("Published Televote source changed without advancing its calculation version");
    expect(migration).toContain("Stale Televote source version cannot supersede the imported result version");
    expect(migration).toContain("using errcode = 'PT409'");
  });

  it("preserves legacy vote sync only until a canonical publication receipt exists", () => {
    expect(migration).toContain("rename to sync_show_results_from_votes_legacy_televote_votes");
    expect(migration).toContain("perform public.sync_show_results_from_votes_legacy_televote_votes(_show_id)");
    expect(migration).toContain("from public.studio2_televote_result_imports import");
    expect(migration).toContain("set televote_points = case");
    expect(migration).toContain("perform public.recalculate_show_results_internal(_show_id)");
    expect(migration).toContain("'televoteSource', 'legacy_votes'");
  });

  it("invalidates downstream review/lock/reveal state when a source version changes", () => {
    expect(migration).toContain("studio2_invalidate_results_after_round_source_change");
    expect(migration).toContain("studio2_invalidate_results_after_combined_source_change");
    expect(migration).toContain("reviewed_version = null");
    expect(migration).toContain("locked_version = null");
    expect(migration).toContain("reveal_ready_version = null");
    expect(migration).toContain("after update of calculation_version, results_status, results_outdated");
    expect(migration).toContain("after update of calculation_version, status, results_outdated");
  });

  it("does not create a browser/client direct-write escape hatch", () => {
    const normalized = migration.toLowerCase();
    expect(normalized).toContain(
      "revoke all on table public.studio2_televote_result_imports\n  from public, anon, authenticated;",
    );
    expect(normalized).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?\bto\s+anon\b/);
    expect(normalized).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?\bto\s+authenticated\b/);
    expect(normalized).toContain(
      "grant select, insert, update, delete on table public.studio2_televote_result_imports\n  to service_role;",
    );
  });

  it("is transactional and deliberately refuses historical receipt fabrication", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
    expect(migration).toContain("Do not fabricate receipts for historical integration events during upgrade");
    expect(migration).not.toContain("insert into public.televote_votes");
  });
});
