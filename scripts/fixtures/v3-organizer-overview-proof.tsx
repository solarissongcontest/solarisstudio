/** Execute the real projection composition and production Overview against an isolated caller transport. */
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet } from "@tanstack/react-router";

const selectedId = "22000000-0000-4000-8000-000000000001";
const otherId = "23000000-0000-4000-8000-000000000001";
let allowed = false;
let selected: string | null = selectedId;
let wrongTaskScope = false;
let unavailableSchedule = false;
let reads = 0;
let networkAttempts = 0;
const checks: unknown[][] = [];
globalThis.fetch = (() => { networkAttempts++; throw new Error("Overview proof forbids network"); }) as typeof fetch;
const sources: Record<string, Record<string, unknown>[]> = {
  editions: [{ id: selectedId, slug: "ssc-22", name: "SSC 22", edition_number: 22, status: "submissions", event_date: null }, { id: otherId, slug: "ssc-23", name: "OTHER-EDITION-SECRET", edition_number: 23 }],
  shows: [{ id: "show-22", edition_id: selectedId, name: "Semi final", kind: "semi", status: "live", sort_order: 1 }, { id: "show-23", edition_id: otherId, name: "OTHER-SHOW-SECRET", status: "live" }],
  admin_audit_log: [{ id: "change-22", edition_id: selectedId, action: "entry.reviewed", table_name: "participants", created_at: "2026-10-26T00:00:00Z" }, { id: "change-23", edition_id: otherId, action: "OTHER-AUDIT-SECRET", created_at: "2026-10-26T00:00:00Z" }],
  submission_rounds: [{ id: "round-22", edition_id: selectedId, name: "First wave", status: "scheduled", opens_at: "2030-01-01T00:00:00Z" }, { id: "round-23", edition_id: otherId, name: "OTHER-ROUND-SECRET", opens_at: "2030-01-01T00:00:00Z" }],
  admin_deadlines: [{ id: "reminder-22", edition_id: selectedId, label: "Local reminder", due_at: "2030-01-02T00:00:00Z", completed_at: null }],
};
const db = {
  schema: () => db,
  from(table: string) {
    reads++;
    let rows = [...(sources[table] ?? [])];
    let single = false;
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "order", "limit", "eq", "is", "not", "in", "single"]) chain[name] = (...args: unknown[]) => {
      if (name === "eq" || name === "is") rows = rows.filter((row) => (row[String(args[0])] ?? null) === args[1]);
      if (name === "not" && args[1] === "is") rows = rows.filter((row) => (row[String(args[0])] ?? null) !== args[2]);
      if (name === "limit") rows = rows.slice(0, Number(args[0]));
      if (name === "in") rows = rows.filter((row) => (args[1] as unknown[]).includes(row[String(args[0])]));
      if (name === "single") single = true;
      return chain;
    };
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
      data: single ? rows[0] ?? null : rows,
      error: unavailableSchedule && table === "submission_rounds" ? { message: "Schedule unavailable" } : null,
    }));
    return chain;
  },
  async rpc(name: string, args: Record<string, unknown>) {
    reads++;
    if (name === "admin_edition_health_summary") {
      assert.equal(args._edition_id, selectedId);
      return { data: { status: "needs-attention", progress: 50, issues_count: 1, critical_count: 1 }, error: null };
    }
    assert.equal(name, "admin_organizer_tasks");
    assert.equal(args.p_edition_id, selectedId);
    assert.equal(args.p_filter, "all");
    const task = { id: "task-22", editionId: wrongTaskScope ? otherId : selectedId, countryId: null, assignedTo: "actor-A", sourceKind: "entry", sourceKey: "entry-22", taskType: "entry.review", priority: "critical", state: "open", title: "Review current entry", description: "Canonical current entry requires review", href: "/admin/tasks", dueAt: null, resolutionPredicate: {}, ruleReference: [], openedAt: "2026-10-26T00:00:00Z", resolvedAt: null, lastEvaluatedAt: "2026-10-26T00:00:00Z" };
    return { data: [task, { ...task, id: "resolved-history", state: "resolved", title: "RESOLVED-SECRET" }], error: null };
  },
};
mock.module("../../src/integrations/supabase/capabilities.server", () => ({
  requireSolarisCapabilityServer: async (...args: unknown[]) => {
    checks.push(args);
    if (!allowed) throw new Error("Solaris capability required: edition.read");
    return { userId: "actor-A" };
  },
}));
mock.module("../../src/integrations/supabase/organizer.server", () => ({ createSolarisAuthenticatedClientServer: () => db }));
const { buildControlRoomModel } = await import("../../src/lib/control-room-model");
mock.module("../../src/lib/control-room.server", () => ({ loadControlRoomModelServer: async (editionId: string) => {
  assert.equal(editionId, selectedId);
  return buildControlRoomModel({ editionId, editionName: "SSC 22", legacyEditionStatus: "submissions", healthStatus: "needs-attention", healthIssues: 1 });
} }));
mock.module("../../src/components/admin/AdminContext", () => ({ useAdminContext: () => ({ editionId: selected }), AdminContextProvider: ({ children }: { children: unknown }) => children }));
const { loadV3OrganizerProjectionServer } = await import("../../src/lib/organizer-v3-projection.server");
await assert.rejects(() => loadV3OrganizerProjectionServer("invalid-edition"), /Invalid edition id/);
assert.equal(reads, 0);
await assert.rejects(() => loadV3OrganizerProjectionServer(selectedId), /Solaris capability required/);
assert.deepEqual(checks[0], ["edition.read", selectedId]);
assert.equal(reads, 0, "No data is read before exact-edition capability authorization");
allowed = true;
const projection = await loadV3OrganizerProjectionServer(selectedId);
assert.equal(projection.context.editionId, selectedId);
assert.equal(projection.context.showId, "show-22");
assert.equal(projection.tasks.total, 1);
assert.equal(projection.tasks.mine, 1);
assert.equal(projection.risk, "critical");
assert.equal(projection.attention[0].title, "Review current entry");
assert.equal(projection.upcoming.length, 2);
assert(projection.upcoming.some((row) => row.detail.includes("does not control a Solaris workflow")));
assert.doesNotMatch(JSON.stringify(projection), /OTHER-|RESOLVED-SECRET/);
wrongTaskScope = true;
await assert.rejects(() => loadV3OrganizerProjectionServer(selectedId), /another edition scope/);
wrongTaskScope = false;
unavailableSchedule = true;
await assert.rejects(() => loadV3OrganizerProjectionServer(selectedId), /Operational schedule could not be verified/);
unavailableSchedule = false;
const { Route } = await import("../../src/routes/_authenticated/admin/operations");
async function render(scope: string | null) {
  selected = scope;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(["v3-organizer-projection", selectedId], projection);
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({ getParentRoute: () => root, path: "/admin/operations", component: () => createElement(Route.options.component as ComponentType) });
  const router = createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: ["/admin/operations"] }) });
  await router.load();
  try { return renderToStaticMarkup(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); }
  finally { client.clear(); }
}
assert.match(await render(null), /Choose an edition/);
const currentHtml = await render(selectedId);
assert.match(currentHtml, /SSC 22/);
assert.match(currentHtml, /Review current entry/);
assert.match(currentHtml, /Critical attention/);
assert.doesNotMatch(currentHtml, /OTHER-|RESOLVED-SECRET/);
assert.equal(networkAttempts, 0);
console.log(JSON.stringify({ passed: true, deniedBeforeRead: true, selectedEdition: true, crossEditionRejected: true, unverifiableScheduleRejected: true, productionRouteCases: 2, networkAttempts }));
