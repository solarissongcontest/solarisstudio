import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const replayScaffold = readFileSync(
  new URL(
    "../../supabase/migrations/20260811113856_complete_prediction_arena_and_start_pulse.sql",
    import.meta.url,
  ),
  "utf8",
);

const runtimeRestore = readFileSync(
  new URL(
    "../../supabase/migrations/20260817203814_restore_pulse_and_prediction_share_beta_runtime.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("historical Prediction/Pulse replay scaffold", () => {
  it("creates every table needed before the canonical Prediction foundation runs", () => {
    for (const table of [
      "fan_profiles",
      "prediction_rounds",
      "prediction_entries",
      "prediction_items",
      "prediction_entry_versions",
      "prediction_scores",
    ]) {
      expect(replayScaffold).toContain(`create table if not exists public.${table}`);
    }

    expect(replayScaffold).toContain("share_token uuid");
    expect(replayScaffold).toContain("references public.prediction_rounds(id)");
    expect(replayScaffold).toContain("references public.fan_profiles(id)");
  });

  it("creates the Pulse tables extended by the later August 11 migration", () => {
    for (const table of [
      "fan_follows",
      "content_events",
      "fan_event_reads",
      "notification_preferences",
    ]) {
      expect(replayScaffold).toContain(`create table if not exists public.${table}`);
    }

    expect(replayScaffold).toContain("CLEAN-REPLAY COMPATIBILITY SCAFFOLD");
    expect(replayScaffold).not.toContain("create or replace function public.score_prediction_round");
  });
});

describe("restored Prediction Arena runtime contract", () => {
  it("scores only after the database lock and published results", () => {
    expect(runtimeRestore).toContain("create or replace function public.score_prediction_round");
    expect(runtimeRestore).toContain("current_user_id uuid := auth.uid()");
    expect(runtimeRestore).toContain("or not public.has_role(current_user_id, 'organizer'");
    expect(runtimeRestore).toContain("or now() < round_row.locks_at");
    expect(runtimeRestore).toContain("show_publication_enabled(round_row.show_id, 'results')");
    expect(runtimeRestore).toContain("cume_dist() over (order by score.score)");
  });

  it("shares only an explicitly enabled scored prediction", () => {
    expect(runtimeRestore).toContain("create or replace function public.enable_prediction_share");
    expect(runtimeRestore).toContain("and entry.profile_id = current_user_id");
    expect(runtimeRestore).toContain("and entry.state = 'scored'");
    expect(runtimeRestore).toContain("create or replace function public.shared_prediction");
    expect(runtimeRestore).toContain("then profile.display_name");
    expect(runtimeRestore).not.toContain("'profileId', entry.profile_id");
    expect(runtimeRestore).not.toContain("'email'");
  });
});

describe("restored Phase 3 runtime contract", () => {
  it("enables RLS on every exposed Pulse table", () => {
    for (const table of [
      "fan_follows",
      "content_events",
      "fan_event_reads",
      "notification_preferences",
    ]) {
      expect(runtimeRestore).toContain(`alter table public.${table} enable row level security;`);
    }
  });

  it("adds explicit Data API grants without granting private rows to anon", () => {
    expect(runtimeRestore).toContain("grant select on public.content_events to anon, authenticated;");
    expect(runtimeRestore).toContain("grant select on public.fan_follows to authenticated;");
    expect(runtimeRestore).not.toContain("grant select on public.fan_follows to anon");
    expect(runtimeRestore).not.toContain("grant insert on public.fan_follows to authenticated");
  });

  it("routes follow and read-state writes through authenticated RPCs", () => {
    expect(runtimeRestore).toContain("create or replace function public.set_fan_follow");
    expect(runtimeRestore).toContain("create or replace function public.mark_content_event_read");
    expect(runtimeRestore).toContain("if current_user_id is null then");
    expect(runtimeRestore).toContain("revoke all on function public.set_fan_follow");
    expect(runtimeRestore).toContain("revoke all on function public.mark_content_event_read");
  });
});
