import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { V3MeScreen } from "@/components/v3/V3MeScreen";
import { buildV3MeProjection } from "./v3-me";

async function renderMe(canEnterOrganizer = false, count: number | null = null, historyCount = 0) {
  const projection = buildV3MeProjection({ identity: { userId: "own-user", displayName: "Own identity", delegationName: "Own delegation", delegationFlagUrl: null, displayRole: "Head of Delegation" }, currentMembership: null, history: Array.from({ length: historyCount }, (_, i) => ({
    editionId: `edition-${i + 1}`, editionName: `SSC ${i + 1}`,
    roleLabel: "Historical delegation", completed: true, href: "/my-solaris/history",
  })), historyAvailable: historyCount > 0, activity: { verifiedReceiptCount: count, awaitingAuthoritativeReceiptCount: null, href: "/my-solaris/activity" }, following: { followedCountryCount: null, followedContentCount: null, href: "/my-solaris/activity" }, preferenceLinks: [{ key: "settings", label: "Preferences", href: "/settings" }], accountLinks: [], canEnterOrganizer, organizerHref: "/admin" });
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({ getParentRoute: () => root, path: "/my-solaris", component: () => <V3MeScreen projection={projection} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/my-solaris"] }) });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("production Me composition", () => {
  it("renders unavailable history, receipts and follows truthfully", async () => {
    const html = await renderMe();
    expect(html).toContain("Own identity");
    expect(html).toContain("Delegation history is unavailable");
    expect(html).toContain("Following counts are unavailable");
    expect(html).toContain("—");
    expect(html).not.toContain("Switch to Organizer");
    expect(html).not.toContain("No past editions yet");
  });
  it("exposes every scoped record through a collapsed disclosure without changing the four-edition summary", async () => {
    const html = await renderMe(false, null, 6);
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("View all 6 recorded editions");
    expect(html).toContain("SSC 4");
    expect(html).toContain("SSC 5");
    expect(html).toContain("SSC 6");
    expect((html.match(/SSC [1-6]/g) ?? []).length).toBe(6);

    const bounded = await renderMe(false, null, 4);
    expect(bounded).not.toContain("<details");
    expect(bounded).not.toContain("View all 4 recorded editions");
  });
  it("shows Organizer only after capability-resolved access is passed", async () => {
    expect(await renderMe(true)).toContain("Switch to Organizer");
  });
  it("renders a server-proven zero distinctly from unavailable", async () => {
    const html = await renderMe(false, 0);
    expect(html).toMatch(/>0<\/span>/);
    expect(html).toContain("Delegation V3 receipts");
  });
});
