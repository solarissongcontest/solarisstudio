import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isResolvedV3DomainConsequence,
  isV3DerivedConsequenceReplacement,
  isV3ReadOnlyConsequenceReplacement,
  v3DomainConsequence,
  v3DomainConsequenceImplementationErrors,
} from "./v3-domain-consequence-registry";
import { v3ProjectionsInvalidatedByEvent } from "./v3-projection-reconciliation-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function consequence(eventType: string) {
  const row = v3DomainConsequence(eventType);
  if (!row) throw new Error(`Missing consequence ${eventType}`);
  return row;
}

describe("System V3 derived observation consequence replacements", () => {
  it("treats public_ux.observed as the bounded privacy telemetry record rather than a second DomainEvent", () => {
    const row = consequence("public_ux.observed");
    expect(row.implementationState).toBe("replaced-by-read");
    expect(row.ownerDomain).toBe("public-ux");
    expect(row.replacement).toMatchObject({
      kind: "canonical-read",
      operation:
        "privacy-bounded public_ux_events + public.admin_public_ux_metrics(timestamptz)",
    });
    expect(isV3ReadOnlyConsequenceReplacement(row)).toBe(true);
    expect(isResolvedV3DomainConsequence(row)).toBe(true);
    expect(v3DomainConsequenceImplementationErrors(row)).toEqual([]);
    expect(v3ProjectionsInvalidatedByEvent("public_ux.observed")).toEqual([]);

    const migration = source("supabase/migrations/20260919112555_public_ux_telemetry.sql");
    expect(migration).toContain("create table if not exists public.public_ux_events");
    expect(migration).toContain("public_ux_events_metadata_keys_check");
    expect(migration).toContain("octet_length(metadata::text) <= 4096");
    expect(migration).toContain("Public UX events can be recorded");
    expect(migration).toContain("user_id is not distinct from (select auth.uid())");
    expect(migration).toContain("Organizers can read public UX events");
    expect(migration).toContain("studio2_access_allowed('rollout.manage', null, false)");
    expect(migration).toContain("create or replace function public.admin_public_ux_metrics(");
    expect(migration).toContain("stable");
    expect(migration).toContain("now() - interval '180 days'");
    expect(migration).toContain("limit 15");
    expect(migration).toContain("limit 12");

    const client = source("src/lib/public-ux-events.ts");
    expect(client).toContain("window.navigator.webdriver");
    expect(client).toContain("privacyAllowsPublicUxTelemetry()");
    expect(client).toContain("telemetryWriteDisabled = true");
    expect(client).toContain('client.from("public_ux_events").insert(payload)');
    expect(client).not.toContain("query_text");
    expect(client).not.toContain("raw_query");

    const metrics = source("src/lib/public-ux-metrics.ts");
    expect(metrics).toContain('client.rpc("admin_public_ux_metrics"');
    expect(metrics).toContain("Math.min(180");
    expect(metrics).not.toContain('from("public_ux_events")');
  });

  it("treats pg_cron lifecycle labels as derived scheduler state with deterministic failure recovery", () => {
    for (const eventType of ["job.started", "job.completed", "job.failed"]) {
      const row = consequence(eventType);
      expect(row.implementationState).toBe("replaced-by-derived-projection");
      expect(row.ownerDomain).toBe("system-job");
      expect(row.replacement).toMatchObject({
        kind: "canonical-derived-projection",
        operation:
          "pg_cron job/run state + private.studio2_reconcile_system_job_tasks() + public.admin_system_runtime_health(integer)",
      });
      expect(isV3DerivedConsequenceReplacement(row)).toBe(true);
      expect(isResolvedV3DomainConsequence(row)).toBe(true);
      expect(v3DomainConsequenceImplementationErrors(row)).toEqual([]);
      expect(v3ProjectionsInvalidatedByEvent(eventType)).toEqual([]);
    }

    const migration = source(
      "supabase/migrations/20261003161000_organisation_os_v5_system_job_recovery.sql",
    );
    expect(migration).toContain("cron.job_run_details");
    expect(migration).toContain("job.jobname like 'solaris-%'");
    expect(migration).toContain("limit 3");
    expect(migration).toContain("limit 1");
    expect(migration).toContain("where source_kind = 'system_job'");
    expect(migration).toContain("state = 'resolved'");
    expect(migration).toContain("'system-job:' || job.jobid::text");
    expect(migration).toContain("on conflict (source_key) do update");
    expect(migration).toContain("coalesce(recent.consecutive_failures, 0) >= 3");
    expect(migration).toContain("v_limit integer := greatest(1, least(coalesce(p_delivery_limit, 40), 100))");
    expect(migration).toContain("studio2_access_allowed('system.read', null, false)");
    expect(migration).toContain("revoke all on function private.studio2_reconcile_system_job_tasks()");

    const regression = source("src/lib/organisation-v5-system-job-recovery.test.ts");
    expect(regression).toContain("without inventing a second scheduler");
    expect(regression).toContain("never exposes a generic browser path that executes stored cron SQL");
    expect(regression).toContain("resolves the failure task only from authoritative scheduler recovery");

    const inventory = source("docs/organisation-os-v5/state-transition-inventory.yml");
    expect(inventory).toContain(
      "Scheduler state is authoritative/derived; recovery transitions are reconciled into Tasks.",
    );
  });

  it("keeps all observation replacements free of invented event-delivery effects", () => {
    for (const eventType of [
      "public_ux.observed",
      "job.started",
      "job.completed",
      "job.failed",
    ]) {
      const row = consequence(eventType);
      expect(row.taskEffects).toEqual([]);
      expect(row.notificationEffects).toEqual([]);
      expect(row.publicationEffects).toEqual([]);
      expect(row.realtimeEffects).toEqual([]);
      expect(row.analyticsEffects).toEqual([]);
      expect(row.auditRequired).toBe(false);

      expect(
        isResolvedV3DomainConsequence({
          ...row,
          realtimeEffects: [{ effect: "invalidate-projection", projection: "forged" }],
        }),
      ).toBe(false);
    }
  });
});
