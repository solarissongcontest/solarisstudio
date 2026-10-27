/** Actual lab pages and engines, in one isolated process; production transport is forbidden. */
import assert from "node:assert/strict";
import { mock } from "bun:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet } from "@tanstack/react-router";

let editionId: string | null = null;
let networkAttempts = 0;
globalThis.fetch = (() => { networkAttempts++; throw new Error("Local laboratory proof forbids network"); }) as typeof fetch;
mock.module("../../src/components/admin/AdminContext", () => ({
  useAdminContext: () => ({ editionId }),
  AdminContextProvider: ({ children }: { children: unknown }) => children,
}));
const { Route: Simulator } = await import("../../src/routes/_authenticated/admin/edition-simulator");
const { Route: VotingLab } = await import("../../src/routes/_authenticated/admin/voting-lab");
const { createEditionSimulation, runEditionSimulation } = await import("../../src/lib/edition-simulator");
const { defaultSubsystemStatesForEdition } = await import("../../src/lib/edition-state");
const { buildSyntheticVotingLabBallots } = await import("../../src/lib/voting-lab-scenarios");
const { compareVotingSystems } = await import("../../src/lib/voting-lab");

async function render(component: ComponentType, path: string, flag: string, enabled: boolean, selected: string | null) {
  editionId = selected;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(["studio2-feature", flag], enabled);
  client.setQueryData(["countries"], Array.from({ length: 6 }, (_, i) => ({ id: `country-${i}`, name: `Country ${i}`, short_code: `C${i}` })));
  client.setQueryData(["participants", selected ?? undefined], [
    ...Array.from({ length: 5 }, (_, i) => ({ country_id: `country-${i}`, participation_status: "confirmed", running_order: i + 1 })),
    { country_id: "WITHDRAWN-SECRET", participation_status: "withdrawn", running_order: 6 },
    { country_id: "DISQUALIFIED-SECRET", participation_status: "disqualified", running_order: 7 },
  ]);
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({ getParentRoute: () => root, path, component: () => createElement(component) });
  const router = createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  try { return renderToStaticMarkup(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); }
  finally { client.clear(); }
}
const simComponent = Simulator.options.component as ComponentType;
const votingComponent = VotingLab.options.component as ComponentType;
assert.match(await render(simComponent, "/admin/edition-simulator", "edition_simulator", false, "edition-22"), /Simulation Lab is disabled/);
const noEdition = await render(simComponent, "/admin/edition-simulator", "edition_simulator", true, null);
assert.match(noEdition, /Select an edition/);
assert.match(noEdition, /No production data will be changed/);
assert.match(await render(votingComponent, "/admin/voting-lab", "voting_lab", false, "edition-22"), /Voting Laboratory is disabled/);
assert.match(await render(votingComponent, "/admin/voting-lab", "voting_lab", true, null), /Select an edition/);
const selected = await render(votingComponent, "/admin/voting-lab", "voting_lab", true, "edition-22");
assert.match(selected, /Synthetic scenarios only/);
assert.doesNotMatch(selected, /WITHDRAWN-SECRET|DISQUALIFIED-SECRET/);
assert.match(selected, /nothing here can publish or finalize official results/);
const source = { edition: "live_show" as const, subsystems: defaultSubsystemStatesForEdition("live_show") };
const sourceBefore = JSON.stringify(source);
const simulation = createEditionSimulation({ startsAt: "2026-10-26T00:00:00Z", runtime: source });
const result = runEditionSimulation(simulation, [
  { type: "transition_edition", to: "televoting" },
  { type: "create_incident", id: "local-outage", title: "Synthetic", severity: "sev1" },
  { type: "set_subsystem", subsystem: "televoting", state: "paused" },
  { type: "advance_time", seconds: 60 },
  { type: "resolve_incident", id: "local-outage" },
  { type: "set_subsystem", subsystem: "televoting", state: "open" },
]);
assert.equal(result.runtime.edition, "televoting");
assert.equal(result.incidents[0].active, false);
assert.equal(result.runtime.subsystems.televoting, "open");
assert.equal(JSON.stringify(source), sourceBefore, "Local rehearsal must not mutate the canonical source snapshot");
assert.equal(simulation.log.length, 0, "Simulation actions preserve the prior local version too");
assert.throws(() => runEditionSimulation(simulation, [{ type: "transition_edition", to: "archived" }]), /Illegal edition state transition/);
const participants = ["a", "b", "c", "d", "e", "f"];
const ballots = buildSyntheticVotingLabBallots(participants, "balanced", 24);
const before = JSON.stringify(ballots);
const config = { maxPerCountry: 10, ballotBudget: 20, minimumCountries: 5, invalidBallotPolicy: "reject" as const };
const first = compareVotingSystems(ballots, { current: config, experiment: { ...config, maxPerCountry: 7, invalidBallotPolicy: "cap" } });
assert.deepEqual(compareVotingSystems(ballots, { current: config, experiment: { ...config, maxPerCountry: 7, invalidBallotPolicy: "cap" } }), first);
assert.equal(JSON.stringify(ballots), before);
assert(ballots.every((ballot) => ballot.voterId.startsWith("synthetic-voter-")));
assert.equal(networkAttempts, 0);
console.log(JSON.stringify({ passed: true, productionPages: 2, routeCases: 5, sourceSnapshotUnchanged: true, syntheticBallotsUnchanged: true, officialWrites: 0, networkAttempts }));
