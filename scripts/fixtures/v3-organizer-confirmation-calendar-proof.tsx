/** Production Calendar route rendering with exact actor/edition query identity and no network. */
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet } from "@tanstack/react-router";
import { confirmationCalendarEditionsQuery, confirmationCalendarQuery } from "../../src/lib/v3-organizer-confirmation-calendar";

let actorId = "A";
let selected: string | null = "edition";
let networkAttempts = 0;
globalThis.fetch = (() => { networkAttempts++; throw new Error("Calendar proof forbids network"); }) as typeof fetch;
mock.module("../../src/components/admin/AdminContext", () => ({ useAdminContext: () => ({ editionId: selected, setEditionId: () => {} }), AdminContextProvider: ({ children }: { children: unknown }) => children }));
mock.module("../../src/components/auth/AuthenticatedUserContext", () => ({ useAuthenticatedUser: () => ({ id: actorId }), AuthenticatedUserProvider: ({ children }: { children: unknown }) => children }));
let allowed = false;
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const edition = { id: "edition", name: "SSC 22", edition_number: 22, rounds: [] };
const row = { id: "response", edition_id: edition.id, round_id: "round", country: "Authorized delegation", participating: true, selection_method: "internal_selection", reveal_date_type: "exact", reveal_exact_date: "2030-01-02" };
const client = {
  auth: { getUser: async () => ({ data: { user: { id: "A" } }, error: null }) },
  rpc: async (name: string, args: Record<string, unknown>) => {
    assert.equal(allowed, true);
    rpcCalls.push({ name, args });
    assert.equal(name, "admin_confirmation_calendar");
    assert.deepEqual(args, { _edition_id: "edition", _round_id: "round" });
    return { data: [row], error: null };
  },
};
mock.module("../../src/integrations/supabase/client", () => ({ supabase: client }));
mock.module("../../src/integrations/confirmations/client", () => ({ confirmationsSupabase: client }));
mock.module("../../src/integrations/supabase/access", () => ({ hasSolarisOrganizerAccess: async (userId: string) => { assert.equal(userId, "A"); return allowed; } }));
const actual = await import("../../src/integrations/confirmations/admin");
const authority = { requireAdmin: actual.requireConfirmationsAdmin, editions: actual.loadConfirmationEditions, calendar: actual.loadConfirmationCalendar };
const signal = new AbortController().signal;
await assert.rejects(() => confirmationCalendarQuery("A", "edition", "round", authority).queryFn({ signal }), /account changed/);
assert.equal(rpcCalls.length, 0);
allowed = true;
const accepted = await confirmationCalendarQuery("A", "edition", "round", authority).queryFn({ signal });
assert.equal(accepted[0].country, "Authorized delegation");
assert.equal(rpcCalls.length, 1);
const routePath = process.env.V3_CALENDAR_PROOF_ROUTE ?? "../../src/routes/confirmations/admin/calendar";
const { Route } = await import(routePath);
async function render(scope: string | null, actor = "A") {
  selected = scope;
  actorId = actor;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(confirmationCalendarEditionsQuery("A", authority).queryKey, [edition]);
  client.setQueryData(confirmationCalendarQuery("A", "edition", "", authority).queryKey, [row]);
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({ getParentRoute: () => root, path: "/confirmations/admin/calendar", component: () => createElement(Route.options.component as ComponentType) });
  const router = createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: ["/confirmations/admin/calendar"] }) });
  await router.load();
  try { return renderToStaticMarkup(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); }
  finally { client.clear(); }
}
const current = await render("edition");
assert.match(current, /Authorized delegation/);
assert.match(current, /Song reveal/);
for (const scope of [null, "removed-edition"]) {
  const missing = await render(scope);
  assert.match(missing, /Select an edition/);
  assert.doesNotMatch(missing, /Authorized delegation/);
}
const otherActor = await render("edition", "B");
assert.doesNotMatch(otherActor, /Authorized delegation|SSC 22/);
assert.equal(networkAttempts, 0);
console.log(JSON.stringify({ passed: true, routeCases: 4, exactActorScope: true, noEditionFallback: true, deniedBeforeRead: true, exactRpcParameters: true, networkAttempts }));
