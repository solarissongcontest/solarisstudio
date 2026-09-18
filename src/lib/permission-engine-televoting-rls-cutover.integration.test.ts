import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_televoting_rls_cutover.sql"),
);
if (!migrationName) throw new Error("Televoting RLS cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const votingManageTables = [
  "admin_audit_log",
  "combined_televote_component_results",
  "combined_televote_results",
  "countries",
  "editions",
  "external_score_entries",
  "external_score_entry_log",
  "round_countries",
  "round_entries",
  "round_results",
  "rounds",
  "televote_aggregation_participants",
  "televote_aggregation_sources",
  "televote_aggregations",
];

const ballotManageTables = [
  "anti_abuse_events",
  "vote_entries",
  "vote_moderation_events",
  "vote_submissions",
];

describe("Televoting Permission Engine RLS cutover", () => {
  it("recreates all 18 legacy televoting Organizer policies", () => {
    for (const table of [...votingManageTables, ...ballotManageTables]) {
      expect(migration).toContain(
        `drop policy if exists "televoting organizer full access" on televoting.${table};`,
      );
      expect(migration).toContain(
        `create policy "televoting organizer full access"\non televoting.${table} for all to authenticated`,
      );
    }
    expect(votingManageTables.length + ballotManageTables.length).toBe(18);
    expect(migration).not.toContain("has_role(");
  });

  it("keeps raw configuration and result surfaces Organizer-equivalent with global voting.manage", () => {
    const sql = normalized(migration);
    for (const table of votingManageTables) {
      expect(sql).toContain(
        `on televoting.${table} for all to authenticated using (public.studio2_access_allowed('voting.manage', null, false)) with check (public.studio2_access_allowed('voting.manage', null, false))`,
      );
    }
  });

  it("keeps raw ballot and moderation surfaces Organizer-equivalent with global televote.ballots.manage", () => {
    const sql = normalized(migration);
    for (const table of ballotManageTables) {
      expect(sql).toContain(
        `on televoting.${table} for all to authenticated using (public.studio2_access_allowed('televote.ballots.manage', null, false)) with check (public.studio2_access_allowed('televote.ballots.manage', null, false))`,
      );
    }
  });

  it("does not fake canonical edition scoping for the independent televoting UUID namespace", () => {
    expect(migration).not.toContain("from public.televoting_round_bindings");
    expect(migration).not.toContain("join public.televoting_round_bindings");
    expect(migration).not.toContain("rounds.edition_id");
    expect(migration).not.toContain("televote_aggregations.edition_id");
  });

  it("fails if any direct legacy role policy survives the final RLS batch", () => {
    expect(migration).toContain("v_televoting_remaining");
    expect(migration).toContain("v_total_remaining");
    expect(migration).toContain("schemaname in ('public', 'storage', 'televoting')");
    expect(migration).toContain("legacy role policy debt remains after final RLS cutover");
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
    expect(migration).not.toContain("'permission_engine_v2'");
  });
});
