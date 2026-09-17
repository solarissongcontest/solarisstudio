import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_friend_voting_read_cutover.sql"),
);
if (!migrationName) throw new Error("friend-voting read cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("friend-voting read Permission Engine cutover", () => {
  it("recreates the canonical analytics RPC so clean replay is self-contained", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.friend_voting_historical_country_payload(p_channel text DEFAULT 'combined'::text, p_edition_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 250)",
    );
    expect(sql).toContain("RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO 'public', 'televoting', 'pg_temp'");
    expect(migration).not.toContain("pg_get_functiondef");
    expect(migration).not.toContain("to_regprocedure");
  });

  it("moves non-service access to edition/global non-strict voting.read", () => {
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain(
      "auth.uid() is null or not public.studio2_access_allowed('voting.read', p_edition_id, false)",
    );
    expect(migration).toContain("raise exception 'Voting read capability required'");
    expect(migration).not.toContain("public.has_role");
  });

  it("preserves the historical Friend Voting analytics implementation", () => {
    for (const marker of [
      "remote_editions as materialized",
      "round_map as materialized",
      "scoped_submissions as materialized",
      "per_edition_channel as materialized",
      "reciprocal_undirected as materialized",
      "historical_pair as materialized",
      "scored as materialized",
      "limited_relationships as materialized",
      "'relationships'",
      "'attentionRelationships'",
      "'juryBallots'",
      "'juryVotes'",
      "'submissions'",
      "'countries'",
      "'editions'",
    ]) {
      expect(migration).toContain(marker);
    }
    expect(migration).toContain("p_limit := greatest(1, least(coalesce(p_limit, 250), 750));");
    expect(migration).toContain("p_channel not in ('combined', 'jury', 'televote')");
  });

  it("preserves edition filtering and both jury/televote evidence paths", () => {
    expect(migration).toContain("p_edition_id is null or rm.edition_id = p_edition_id");
    expect(migration).toContain("p_edition_id is null or jv.edition_id = p_edition_id");
    expect(migration).toContain("where p_channel in ('combined', 'televote')");
    expect(migration).toContain("where p_channel in ('combined', 'jury')");
    expect(migration).toContain("from televoting.vote_submissions s");
    expect(migration).toContain("from public.jury_votes jv");
  });

  it("preserves authenticated/service execution and revokes public/anonymous execution", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "revoke all on function public.friend_voting_historical_country_payload(text, uuid, integer) from public, anon;",
    );
    expect(sql).toContain(
      "grant execute on function public.friend_voting_historical_country_payload(text, uuid, integer) to authenticated, service_role;",
    );
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
    expect(migration).not.toContain("'permission_engine_v2'");
  });
});
