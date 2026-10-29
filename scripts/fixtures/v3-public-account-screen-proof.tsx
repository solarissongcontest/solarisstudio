import assert from "node:assert/strict";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet } from "@tanstack/react-router";
import { V3PredictionsRouteContent } from "../../src/components/v3/V3PredictionsRouteContent";
import { V3FollowingSavedScreen } from "../../src/components/v3/V3FollowingSavedScreen";
let networkAttempts = 0;
globalThis.fetch = (() => { networkAttempts++; throw new Error("Account presentation proof forbids network"); }) as typeof fetch;

async function render(component: ComponentType, seed: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } } });
  seed(client);
  const root = createRootRoute({ component: () => <QueryClientProvider client={client}><Outlet /></QueryClientProvider> });
  const page = createRoute({ getParentRoute: () => root, path: "/proof", component: () => createElement(component) });
  const router = createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: ["/proof"] }) });
  try { await router.load(); return renderToStaticMarkup(<RouterProvider router={router} />); }
  finally { client.clear(); }
}
const seedPredictions = (client: QueryClient, historyReady: boolean, leagueEnabled: boolean) => {
  client.setQueryData(["fan-session"], { id: "actor-A" });
  client.setQueryData(["fan-profile", "actor-A"], { id: "actor-A", display_name: "Private account", leaderboard_opt_in: false });
  client.setQueryData(["prediction-rounds", "all", false], { schemaReady: true, rounds: [{ id: "round-A", show_id: "show-A", opens_at: "2020-01-01T00:00:00Z", locks_at: "2020-01-02T00:00:00Z", status: "open", prediction_types: ["winner"], scoring_version: "v1" }] });
  if (historyReady) client.setQueryData(["prediction-history", "actor-A"], [{ id: "entry-A", profile_id: "actor-A", round_id: "round-A", state: "submitted", prediction_score: null, prediction_items: [{ country_id: "PRIVATE-PICK" }] }]);
  client.setQueryData(["shows", "all"], [{ id: "show-A", edition_id: "edition-A", name: "Canonical current show" }]);
  client.setQueryData(["editions"], [{ id: "edition-A", name: "Canonical edition", edition_number: 22 }]);
  client.setQueryData(["studio2-feature", "prediction_league", "v3"], leagueEnabled);
  client.setQueryData(["prediction-league", "all"], [{ profileId: "public-opt-in", displayName: "Public opt-in identity", score: 12, rounds: 1, position: 1 }]);
};
const canonical = await render(V3PredictionsRouteContent, (client) => seedPredictions(client, true, true));
assert.match(canonical, /Submitted/);
assert.match(canonical, /Public opt-in identity/);
assert.match(canonical, /Your fan profile is not opted into public standings/);
assert.doesNotMatch(canonical, /PRIVATE-PICK/);
const disabledLeague = await render(V3PredictionsRouteContent, (client) => seedPredictions(client, true, false));
assert.match(disabledLeague, /Submitted/);
assert.match(disabledLeague, /Prediction League is not available/);
assert.doesNotMatch(disabledLeague, /Public opt-in identity/);
const pending = await render(V3PredictionsRouteContent, (client) => seedPredictions(client, false, true));
assert.match(pending, /data-v3-predictions-private-state="loading"/);
assert.doesNotMatch(pending, /Canonical current show/);
const follows = (owner: string) => (client: QueryClient) => {
  client.setQueryData(["fan-follows", "actor-A"], { schemaReady: true, follows: [{ id: "follow-A", profile_id: owner, entity_type: "country", entity_id: "country-A", notification_level: "important" }] });
  client.setQueryData(["countries"], [{ id: "country-A", name: "Only own saved country", short_code: "AAA" }]);
  client.setQueryData(["editions"], []);
  client.setQueryData(["shows", "all"], []);
};
const Saved = () => <V3FollowingSavedScreen viewerId="actor-A" />;
const ownSaved = await render(Saved, follows("actor-A"));
assert.match(ownSaved, /Only own saved country/);
assert.match(ownSaved, /href="\/countries\/AAA"/);
assert.match(ownSaved, /Important only/);
const foreignSaved = await render(Saved, follows("actor-B"));
assert.match(foreignSaved, /Solaris could not safely scope these preferences to your account/);
assert.doesNotMatch(foreignSaved, /Only own saved country/);
assert.equal(networkAttempts, 0);
console.log(JSON.stringify({ passed: true, routeCases: 5, privateHistoryFailClosed: true, canonicalRoundState: true, scopedPreferences: true, networkAttempts }));
