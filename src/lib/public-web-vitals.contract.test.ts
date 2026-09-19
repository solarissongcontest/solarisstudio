import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public Core Web Vitals telemetry contract", () => {
  const telemetry = source("src/lib/public-web-vitals.ts");
  const root = source("src/routes/__root.tsx");
  const migration = source(
    "supabase/migrations/20260919201129_public_web_vitals_telemetry.sql",
  );
  const metrics = source("src/lib/public-ux-metrics.ts");
  const dashboard = source("src/routes/_authenticated/admin/public-ux.tsx");

  it("collects LCP, INP and CLS without query strings or user-agent fingerprinting", () => {
    expect(telemetry).toContain('"largest-contentful-paint"');
    expect(telemetry).toContain('"layout-shift"');
    expect(telemetry).toContain('type: "event"');
    expect(telemetry).toContain("window.location.pathname");
    expect(telemetry).not.toContain("window.location.search");
    expect(telemetry).not.toContain("userAgent");
  });

  it("starts collection once from the app root", () => {
    expect(root).toContain("startPublicWebVitals");
    expect(root).toContain("useEffect(() => startPublicWebVitals(), [])");
  });

  it("keeps public writes insert-only and organizer reads capability-gated", () => {
    expect(migration).toContain(
      "grant insert on table public.public_web_vitals to anon, authenticated",
    );
    expect(migration).toContain(
      "grant select on table public.public_web_vitals to authenticated",
    );
    expect(migration).toContain("alter table public.public_web_vitals enable row level security");
    expect(migration).toContain(
      "public.studio2_access_allowed('rollout.manage', null, false)",
    );
    expect(migration).toContain("security invoker");
  });

  it("surfaces p75 field performance in the existing organizer Public UX dashboard", () => {
    expect(metrics).toContain("loadPublicWebVitalsMetrics");
    expect(metrics).toContain('"admin_public_web_vitals"');
    expect(dashboard).toContain("Core Web Vitals");
    expect(dashboard).toContain("LCP");
    expect(dashboard).toContain("INP");
    expect(dashboard).toContain("CLS");
  });

  it("provides a p75 organizer aggregation rather than exposing raw telemetry publicly", () => {
    expect(migration).toContain("admin_public_web_vitals");
    expect(migration).toContain("percentile_cont(0.75)");
    expect(migration).toContain("revoke all on function public.admin_public_web_vitals");
  });
});
