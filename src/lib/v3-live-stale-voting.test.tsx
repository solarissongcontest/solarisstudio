import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { V3LiveScreen } from "@/components/v3/V3LiveScreen";
import type { V3LiveExperience } from "./v3-live";

const votingExperience: V3LiveExperience = {
  show: { id: "show-1", editionId: "edition-1", name: "Grand Final" },
  state: "voting",
  stateLabel: "Public voting is open",
  description: "The show is underway.",
  runningOrder: [],
  voting: {
    state: "open",
    label: "Voting open",
    roundId: "round-1",
    openedAt: "2026-11-06T18:00:00.000Z",
    closedAt: null,
  },
  timing: {
    scheduledStart: null,
    liveStartedAt: null,
    resultsStartedAt: null,
    endedAt: null,
  },
  resultsPublished: false,
  updates: [],
  freshness: {
    stateVersion: "show-1:open",
    updatedAt: "2026-11-06T18:00:00.000Z",
    serverTime: "2026-11-06T18:00:00.000Z",
  },
};

async function renderLive(degraded: boolean, experience = votingExperience) {
  const root = createRootRoute({ component: Outlet });
  const showModeRoute = createRoute({
    getParentRoute: () => root,
    path: "/show-mode",
    component: () => (
      <V3LiveScreen
        experience={experience}
        degraded={degraded}
        onRefresh={() => undefined}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([showModeRoute]),
    history: createMemoryHistory({ initialEntries: ["/show-mode"] }),
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("Public Live voting in degraded connectivity", () => {
  it("offers voting only while the authoritative snapshot is current", async () => {
    const html = await renderLive(false);
    expect(html).toContain("Vote now");
    expect(html).toContain("/televoting");
    expect(html).not.toContain("Voting status unverified");
  });

  it("keeps the last-known state visible but suppresses stale vote actions", async () => {
    const html = await renderLive(true);
    expect(html).toContain("Live connection interrupted");
    expect(html).toContain("Last known");
    expect(html).toContain("Voting status unverified");
    expect(html).toContain("Retry refresh");
    expect(html).not.toContain("Vote now");
    expect(html).not.toContain('href="/televoting"');
  });

  it("does not invent a voting action from a stale non-open round", async () => {
    const html = await renderLive(true, {
      ...votingExperience,
      state: "results_pending",
      voting: { ...votingExperience.voting, state: "closed" },
    });
    expect(html).not.toContain("Vote now");
    expect(html).not.toContain("Voting status unverified");
    expect(html).toContain("Last known");
  });
});
