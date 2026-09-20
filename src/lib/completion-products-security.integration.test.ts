import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260920114500_completion_products.sql",
  ),
  "utf8",
);

describe("completion product security and reliability boundaries", () => {
  it("lets signed-out visitors evaluate only the boolean public rollout decision", () => {
    expect(migration).toContain(
      "grant execute on function public.studio2_feature_enabled(text, uuid) to anon",
    );
    expect(migration).not.toContain("grant select on public.studio2_feature_flags to anon");
  });
  it("keeps Fantasy roster writes behind server-enforced eligibility, budget and server time", () => {
    expect(migration).toContain("now() < v_game.opens_at");
    expect(migration).toContain("now() >= v_game.locks_at");
    expect(migration).toContain("cardinality(_country_ids) <> v_game.roster_size");
    expect(migration).toContain("count(distinct id)");
    expect(migration).toContain("Fantasy budget exceeded");
    expect(migration).toContain("choice.eligible = true");
    expect(migration).toContain("Captain must be selected from the roster");
  });

  it("refuses Fantasy scoring until published results are actually public", () => {
    expect(migration).toContain("show_publication_enabled(v_game.show_id, 'results')");
    expect(migration).toContain("Fantasy scoring waits for published results");
    expect(migration).toContain("scoring_version");
  });

  it("keeps public leaderboards privacy-safe", () => {
    expect(migration).toContain("profile.visibility = 'public'");
    expect(migration).toContain("profile.leaderboard_opt_in = true");
    expect(migration).not.toContain("profile.email");
  });

  it("keeps Organizer configuration behind Permission Engine v2 capability checks", () => {
    expect(migration).toContain("studio2_access_allowed('edition.manage'");
    expect(migration).toContain("studio2_access_allowed('results.preview'");
    expect(migration).not.toContain("user_metadata");
    expect(migration).not.toContain("service_role_key");
  });

  it("keeps Time Machine read-only and bounded to recorded evidence", () => {
    expect(migration).toContain("create or replace function public.studio2_time_machine");
    expect(migration).toContain("studio2_contest_events");
    expect(migration).toContain("admin_audit_log");
    expect(migration).not.toContain("'beforeData'");
    expect(migration).not.toContain("'afterData'");
    expect(migration).not.toContain("update public.studio2_contest_events");
    expect(migration).not.toContain("delete from public.studio2_contest_events");
  });
});
