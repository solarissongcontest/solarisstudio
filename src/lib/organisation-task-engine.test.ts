import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  mapOrganizerTasksV5,
  type OrganizerTaskV5,
} from "./admin-tasks-v5";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 canonical Organizer Task Engine", () => {
  const migration = source(
    "supabase/migrations/20261002211500_organisation_os_v5_task_engine.sql",
  );

  it("stores one task per source condition and keeps direct browser writes closed", () => {
    expect(migration).toContain("create table if not exists public.studio2_organizer_tasks");
    expect(migration).toContain("source_key text not null unique");
    expect(migration).toContain("required_capability text not null references public.studio2_capabilities");
    expect(migration).toContain("revoke all on table public.studio2_organizer_tasks from public, anon, authenticated");
    expect(migration).not.toContain("grant update on table public.studio2_organizer_tasks to authenticated");
  });

  it("derives resolution from domain truth instead of exposing mark-resolved commands", () => {
    expect(migration).toContain("private.studio2_reconcile_organizer_tasks");
    expect(migration).toContain("incident.status <> 'resolved'");
    expect(migration).toContain("integrity_case.status not like 'closed%'");
    expect(migration).toContain("appeal.status in ('submitted', 'under_review')");
    expect(migration).toContain("disclosure.status in ('pending', 'approved')");
    expect(migration).toContain("subsystem.value = 'paused'");
    expect(migration).not.toContain("admin_mark_organizer_task_resolved");
    expect(migration).not.toContain("p_resolved boolean");
  });

  it("keeps notifications as delivery while task resolution follows domain truth", () => {
    expect(migration).toContain("notification.source_key = task.source_key");
    expect(migration).toContain("notification.resolved_at is distinct from task.resolved_at");
    expect(migration).not.toContain("task.resolved_at = notification.read_at");
    expect(migration).not.toContain("task.resolved_at = notification.resolved_at");
  });

  it("filters every returned task through its own capability", () => {
    expect(migration).toContain(
      "public.studio2_access_allowed(task.required_capability, task.edition_id, false)",
    );
    expect(migration).toContain("'integrity.read'");
    expect(migration).toContain("'integrity.manage'");
    expect(migration).toContain("'incident.read'");
    expect(migration).toContain("'edition.manage'");
  });

  it("uses canonical Tasks for the mobile badge and dedicated Tasks screen", () => {
    const frame = source("src/components/admin/AdminFrame.tsx");
    const route = source("src/routes/_authenticated/admin/tasks.tsx");

    expect(frame).toContain("useOrganizerTaskCountV5");
    expect(frame).toContain('item.id === "tasks"');
    expect(frame).toContain("unresolvedTaskCount");
    expect(route).toContain("useOrganizerTasksV5");
    expect(route).toContain("There is intentionally no generic “Mark resolved” button.");
    expect(route).toContain('to="/admin/inbox"');
  });

  it("maps strict task payloads instead of accepting malformed RPC state", () => {
    const sample: OrganizerTaskV5 = {
      id: "task-1",
      editionId: null,
      countryId: null,
      assignedTo: null,
      sourceKind: "incident",
      sourceKey: "studio2_incidents:1",
      taskType: "incident.response",
      priority: "critical",
      state: "open",
      title: "SEV1",
      description: "Respond",
      href: "/admin/incidents",
      dueAt: null,
      resolutionPredicate: { table: "studio2_incidents" },
      ruleReference: [],
      openedAt: "2026-10-02T20:00:00.000Z",
      resolvedAt: null,
      lastEvaluatedAt: "2026-10-02T20:00:00.000Z",
    };

    expect(mapOrganizerTasksV5([sample])).toEqual([sample]);
    expect(() => mapOrganizerTasksV5([{ ...sample, state: "invented" }])).toThrow(
      "Invalid Organizer Task shape",
    );
  });
});
