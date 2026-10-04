import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 legacy authority retirement", () => {
  it("keeps old Action Center URLs only as redirects to canonical Organizer Tasks", () => {
    for (const path of [
      "src/routes/_authenticated/admin/action-center.tsx",
      "src/routes/_authenticated/admin/action-centre.tsx",
    ]) {
      const route = source(path);
      expect(route, path).toContain("redirect");
      expect(route, path).toContain('to: "/admin/tasks"');
      expect(route, path).not.toContain("buildStudio2ActionCenter");
      expect(route, path).not.toContain("useQuery");
    }
  });

  it("removes the independent Action Center model and its dedicated test authority", () => {
    for (const path of [
      "src/lib/studio2-action-center.ts",
      "src/lib/studio2-action-center.test.ts",
      "src/lib/studio2-action-center-integration.test.ts",
    ]) {
      expect(existsSync(path), path).toBe(false);
    }
  });

  it("links operational workflows directly to canonical Tasks", () => {
    const workflows = source("src/routes/_authenticated/admin/workflows.tsx");
    expect(workflows).toContain('href="/admin/tasks"');
    expect(workflows).toContain("Open Tasks");
    expect(workflows).not.toContain("/admin/action-center");
  });

  it("does not maintain a retired Action Center cache from incident operations", () => {
    const incidents = source("src/routes/_authenticated/admin/incidents.tsx");
    expect(incidents).not.toContain("studio2-action-center");
  });

  it("keeps canonical Tasks server-reconciled and impossible to resolve from browser delivery state", () => {
    const taskEngine = source(
      "supabase/migrations/20261002211500_organisation_os_v5_task_engine.sql",
    );
    const tasksRoute = source("src/routes/_authenticated/admin/tasks.tsx");
    const inbox = source("src/routes/_authenticated/admin/inbox.tsx");

    expect(taskEngine).toContain("source_key text not null unique");
    expect(taskEngine).toContain(
      "revoke all on table public.studio2_organizer_tasks from public, anon, authenticated",
    );
    expect(taskEngine).toContain("private.studio2_reconcile_organizer_tasks");
    expect(taskEngine).not.toContain("admin_mark_organizer_task_resolved");
    expect(tasksRoute).toContain("useOrganizerTasksV5");
    expect(tasksRoute).not.toContain("/admin/action-center");
    expect(tasksRoute).not.toContain("/admin/action-centre");
    expect(tasksRoute).toContain("There is intentionally no generic “Mark resolved” button.");
    expect(inbox).toContain('item.resolution_mode === "domain"');
    expect(inbox).toContain("Resolves automatically from the source workflow");
  });
});
