import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 UX diagnostics instrumentation", () => {
  it("measures time to a meaningful primary action without adding page-view surveillance", () => {
    const primary = read("src/components/public/PublicPrimaryAction.tsx");

    expect(primary).toContain("performance.now()");
    expect(primary).toContain("elapsed_ms: elapsedMs");
    expect(primary).toContain('interaction: "primary_action"');
    expect(primary).toContain("trackPublicUxEvent(analyticsEvent");
    expect(primary).not.toContain("page_view");
    expect(primary).not.toContain("document.referrer");
  });

  it("uses only metadata already admitted by the telemetry allow-list", () => {
    const events = read("src/lib/public-ux-events.ts");
    const migration = read("supabase/migrations/20260919112555_public_ux_telemetry.sql");

    expect(events).toContain("elapsed_ms?: number");
    expect(events).toContain('"interaction"');
    expect(events).toContain("Number.isFinite(metadata.elapsed_ms)");
    expect(events).toContain("Math.min(86_400_000");
    expect(migration).toContain("'interaction'");
    expect(migration).toContain("'elapsed_ms'");
    expect(migration).toContain("between 0 and 86400000");
  });

  it("keeps search diagnostics content-free", () => {
    const events = read("src/lib/public-ux-events.ts");
    const palette = read("src/components/public/PublicCommandPalette.tsx");

    expect(palette).toContain('trackPublicUxEvent("search_submitted"');
    expect(palette).toContain('trackPublicUxEvent("search_no_results"');
    expect(palette).toContain('trackPublicUxEvent("search_result_clicked"');
    expect(palette).toContain("query_length: normalized.length");
    expect(events).not.toContain("query_text");
    expect(events).not.toContain("raw_query");
  });

  it("already provides aggregate task, friction, search rescue and device diagnostics", () => {
    const metrics = read("src/lib/public-ux-metrics.ts");

    expect(metrics).toContain("rescueSessions");
    expect(metrics).toContain("highStepSessions");
    expect(metrics).toContain("repeatedSectionSessions");
    expect(metrics).toContain("completionRate");
    expect(metrics).toContain("devices: rows(raw.devices)");
  });

  it("keeps performance diagnostics in the separate Web Vitals channel", () => {
    const vitals = read("src/lib/public-web-vitals.ts");
    const metrics = read("src/lib/public-ux-metrics.ts");

    expect(vitals).toContain('client.from("public_web_vitals").insert(payload)');
    expect(metrics).toContain("loadPublicWebVitalsMetrics");
    expect(metrics).toContain('metric: "LCP" | "INP" | "CLS"');
  });

  it("registers the new diagnostics backend through the S13 migration contract", () => {
    const migration = read(
      "supabase/migrations/20261020065500_v3_public_ux_diagnostics_metrics.sql",
    );

    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261020065500_v3_public_ux_diagnostics_metrics");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("extends the existing telemetry store instead of creating a second analytics source", () => {
    const migration = read(
      "supabase/migrations/20261020065500_v3_public_ux_diagnostics_metrics.sql",
    );

    expect(migration).toContain("alter table public.public_ux_events");
    expect(migration).toContain("create or replace function public.admin_public_ux_metrics(");
    expect(migration).not.toContain("create table");
    expect(migration).not.toContain("query_text");
    expect(migration).not.toContain("raw_query");
    expect(migration).not.toContain("client_ip");
  });

  it("admits only low-cardinality semantic dead-end and feature-hunt telemetry", () => {
    const migration = read(
      "supabase/migrations/20261020065500_v3_public_ux_diagnostics_metrics.sql",
    );

    expect(migration).toContain("'explore_dead_end'");
    expect(migration).toContain("'attention_presented'");
    expect(migration).toContain("'feature_hunt_detected'");
    expect(migration).toContain("public_ux_events_diagnostic_semantics_check");
    expect(migration).toContain("public_ux_events_metadata_diagnostic_reason_check");
    expect(migration).toContain("public_ux_events_metadata_attention_kind_check");
    expect(migration).toContain("public_ux_events_metadata_hunt_source_check");
    expect(migration).toContain("metadata ->> 'hunt_source' in ('search', 'navigation', 'explore')");
  });

  it("derives reformulation from privacy-safe search sequence metadata", () => {
    const migration = read(
      "supabase/migrations/20261020065500_v3_public_ux_diagnostics_metrics.sql",
    );

    expect(migration).toContain("search_sequence_base");
    expect(migration).toContain("lag(query_length)");
    expect(migration).toContain("lag(result_count)");
    expect(migration).toContain("search_reformulation_by_session");
    expect(migration).toContain("'method', 'privacy_safe_sequence_proxy'");
    expect(migration).toContain("'reformulationSessions'");
    expect(migration).toContain("'reformulationTransitions'");
  });

  it("keeps diagnostic aggregates Organizer-only and bounded to 180 days", () => {
    const migration = read(
      "supabase/migrations/20261020065500_v3_public_ux_diagnostics_metrics.sql",
    );

    expect(migration).toContain("now() - interval '180 days'");
    expect(migration).toContain("public.studio2_access_allowed('rollout.manage', null, false)");
    expect(migration).toContain("raise exception 'Organizer role required'");
    expect(migration).toContain("'exploreDeadEnds'");
    expect(migration).toContain("'featureHunt'");
    expect(migration).toContain("'ratePct'");
  });

  it("rehearses semantic constraints and authorization on local Supabase only", () => {
    const rehearsal = read("scripts/rehearse-v3-public-ux-diagnostics.sh");

    expect(rehearsal).toContain('case "$API_URL" in http://127.0.0.1:*|http://localhost:*');
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("free-form Explore reason");
    expect(rehearsal).toContain("feature hunt without hunt source");
    expect(rehearsal).toContain("free-form attention kind");
    expect(rehearsal).toContain("diagnostic metadata on unrelated event");
    expect(rehearsal).toContain("ordinary user aggregate read");
    expect(rehearsal).toContain("reformulationSessions");
    expect(rehearsal).toContain("deadEndSessions");
    expect(rehearsal).toContain("featureHuntSessions");
    expect(rehearsal).not.toContain(".supabase.co");
  });
});
