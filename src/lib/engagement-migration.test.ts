import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260811113856_complete_prediction_arena_and_start_pulse.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("completed Prediction Arena migration contract", () => {
  it("scores only after the database lock and published results", () => {
    expect(migration).toContain("create or replace function public.score_prediction_round");
    expect(migration).toContain("current_user_id uuid := auth.uid()");
    expect(migration).toContain("or not public.has_role(current_user_id, 'organizer'");
    expect(migration).toContain("or now() < round_row.locks_at");
    expect(migration).toContain("show_publication_enabled(round_row.show_id, 'results')");
    expect(migration).toContain("cume_dist() over (order by score.score)");
  });

  it("shares only an explicitly enabled scored prediction", () => {
    expect(migration).toContain("create or replace function public.enable_prediction_share");
    expect(migration).toContain("and entry.profile_id = current_user_id");
    expect(migration).toContain("and entry.state = 'scored'");
    expect(migration).toContain("create or replace function public.shared_prediction");
    expect(migration).toContain("then profile.display_name");
    expect(migration).not.toContain("'profileId', entry.profile_id");
    expect(migration).not.toContain("'email'");
  });
});

describe("Phase 3 foundation migration contract", () => {
  it("enables RLS on every new exposed table", () => {
    for (const table of [
      "fan_follows",
      "content_events",
      "fan_event_reads",
      "notification_preferences",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
    }
  });

  it("adds explicit Data API grants without granting private rows to anon", () => {
    expect(migration).toContain("grant select on public.content_events to anon, authenticated;");
    expect(migration).toContain("grant select on public.fan_follows to authenticated;");
    expect(migration).not.toContain("grant select on public.fan_follows to anon");
    expect(migration).not.toContain("grant insert on public.fan_follows to authenticated");
  });

  it("routes follow and read-state writes through authenticated RPCs", () => {
    expect(migration).toContain("create or replace function public.set_fan_follow");
    expect(migration).toContain("create or replace function public.mark_content_event_read");
    expect(migration).toContain("if current_user_id is null then");
    expect(migration).toContain("revoke all\non function public.set_fan_follow");
    expect(migration).toContain("revoke all\non function public.mark_content_event_read");
  });
});
