import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20261020001500_v3_public_ux_observability_projection.sql",
);
const events = read("src/lib/public-ux-events.ts");
const reporting = read("src/lib/lovable-error-reporting.ts");
const metrics = read("src/lib/public-ux-metrics.ts");
const findings = read("src/lib/public-ux-findings.ts");
const actionability = read("src/components/admin/PublicUxActionability.tsx");

describe("V3 complete Public UX observability projection", () => {
  it("is a forward-only S13-governed extension of the existing telemetry authority", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261020001500_v3_public_ux_observability_projection");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("create or replace function public.admin_public_ux_metrics(");
    expect(migration).not.toContain("create table public.public_ux_events");
  });

  it("keeps the projection bounded and aggregate-only", () => {
    expect(migration).toContain("now() - interval '180 days'");
    expect(migration).toContain("limit 15");
    expect(migration).toContain("limit 20");
    expect(migration).toContain("count(distinct session_id)");
    expect(migration).toContain("'schemaVersion', 2");
    expect(migration).not.toContain("'sessionJourneys'");
    expect(migration).not.toContain("'rawEvents'");
    expect(migration).not.toContain("'queryText'");
  });

  it("defines every missing #753 diagnostic using deterministic server rules", () => {
    expect(migration).toContain("'routeBacktracking'");
    expect(migration).toContain("destination_visit > 1");
    expect(migration).toContain("previous_destination is distinct from destination");

    expect(migration).toContain("'deadEnds'");
    expect(migration).toContain("v_now - interval '2 minutes'");
    expect(migration).toContain("event_name in ('search_no_results', 'public_error_shown')");

    expect(migration).toContain("'workflowAbandonment'");
    expect(migration).toContain("interval '30 minutes'");
    expect(migration).toContain("coalesce(metadata ->> 'task_run', '') <> ''");

    expect(migration).toContain("'errors'");
    expect(migration).toContain("where event_name = 'public_error_shown'");
  });

  it("accepts only Solaris's low-cardinality error taxonomy", () => {
    expect(events).toContain('| "public_error_shown"');
    expect(events).toContain("error_class?: AppErrorKind");
    expect(migration).toContain("public_ux_events_metadata_error_class_check");
    expect(migration).toContain("public_ux_events_error_event_shape_check");
    for (const errorClass of [
      "offline",
      "service-unavailable",
      "authentication-expired",
      "permission-denied",
      "conflict",
      "not-found",
      "unpublished",
      "request-failed",
      "unexpected",
    ]) {
      expect(migration).toContain(`'${errorClass}'`);
    }
  });

  it("separates public UX error classes from detailed developer error reporting", () => {
    expect(reporting).toContain('trackPublicUxEvent("public_error_shown"');
    expect(reporting).toContain("error_class: publicErrorClass");
    expect(reporting).toContain('source: "root_error_boundary"');
    expect(reporting).not.toContain("error_message:");
    expect(reporting).not.toContain("stack_trace:");
    expect(events).toContain("if (window.navigator.webdriver) return;");
    expect(events).toContain('pathname.startsWith("/confirmations/admin")');
    expect(events).toContain('pathname.startsWith("/televoting/admin")');
  });

  it("fails visibly when the server is older instead of fabricating zero diagnostics", () => {
    expect(metrics).toContain("diagnostics: PublicUxDiagnostics | null");
    expect(metrics).toContain("diagnostics: schemaVersion >= 2 ? parseDiagnostics(raw.diagnostics) : null");
    expect(metrics).toContain("Public UX diagnostics are missing from a schema-v2 response.");
    expect(findings).toContain("return metrics.diagnostics ? [] : [...PUBLIC_UX_SERVER_GAPS]");
    expect(actionability).toContain("Canonical signals still unavailable");
    expect(actionability).toContain("missing values never masquerade as a perfect zero");
  });

  it("renders and prioritizes all four canonical diagnostic families", () => {
    for (const label of [
      "Route backtracking",
      "Dead ends",
      "Workflow abandonment",
      "Error classes",
    ]) {
      expect(actionability).toContain(label);
    }
    expect(actionability).toContain("routeBacktracking.topDestinations");
    expect(actionability).toContain("deadEnds.topRoutes");
    expect(actionability).toContain("workflowAbandonment.tasks");
    expect(actionability).toContain("errors.classes");
    expect(findings).toContain('id: "route-backtracking"');
    expect(findings).toContain('id: "dead-end-sessions"');
    expect(findings).toContain("`abandonment-${task.target}`");
    expect(findings).toContain('id: "public-error-rate"');
  });
});
