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
});
