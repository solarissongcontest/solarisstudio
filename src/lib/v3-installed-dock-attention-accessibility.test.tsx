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

import { AppTabBar } from "@/components/app/AppTabBar";

async function renderInstalledDock({
  participateBadge,
  meBadge,
  overlappingMounts = false,
}: {
  participateBadge: number;
  meBadge: number;
  overlappingMounts?: boolean;
}) {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path: "/participate",
    component: () => (
      <>
        <AppTabBar
          pathname="/participate"
          signedIn
          participateBadge={participateBadge}
          meBadge={meBadge}
        />
        {overlappingMounts ? (
          <AppTabBar
            pathname="/participate"
            signedIn
            participateBadge={participateBadge}
            meBadge={meBadge}
          />
        ) : null}
      </>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/participate"] }),
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function tabTag(html: string, name: string) {
  return html.match(new RegExp('<a\\b[^>]*aria-label="' + name + '"[^>]*>'))?.[0] ?? "";
}

function descriptionId(linkTag: string) {
  return linkTag.match(/aria-describedby="([^"]+)"/)?.[1] ?? null;
}

describe("V3 installed dock attention accessibility", () => {
  it("associates both canonical tab links with the complete spoken attention counts", async () => {
    const html = await renderInstalledDock({ participateBadge: 12, meBadge: 1 });
    const participate = tabTag(html, "Participate");
    const me = tabTag(html, "Me");

    expect(participate).toContain('aria-current="page"');
    expect(participate).toContain('aria-label="Participate"');
    expect(me).toContain('aria-label="Me"');

    const participateId = descriptionId(participate);
    const meId = descriptionId(me);
    expect(participateId).toBeTruthy();
    expect(meId).toBeTruthy();
    expect(participateId).not.toBe(meId);

    // Real link/description association, not just a source-code substring.
    // React SSR may insert invisible text-node boundaries between adjacent
    // numeric, literal and conditional children. Those comments have no
    // accessible text, so normalize only them before checking the spoken copy.
    const spokenMarkup = html.replace(/<!--\s*-->/g, "");
    expect(spokenMarkup).toContain('id="' + participateId + '">12 items need attention</span>');
    expect(spokenMarkup).toContain('id="' + meId + '">1 item needs attention</span>');

    // Visual material remains capped at 9+ while VoiceOver gets the full count.
    expect(html).toMatch(/class="solaris-app-tab-badge" aria-hidden="true">9\+<\/span>/);
    expect(html).toMatch(/class="solaris-app-tab-badge" aria-hidden="true">1<\/span>/);
    expect(html).toContain('aria-label="Solaris Studio"');
  });

  it("allocates different description IDs if old and new app shells temporarily overlap", async () => {
    const html = await renderInstalledDock({
      participateBadge: 2,
      meBadge: 0,
      overlappingMounts: true,
    });
    const ids = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(html).toContain('id="' + id + '">2 items need attention</span>');
    }
  });

  it("does not expose empty descriptions or phantom attention at zero", async () => {
    const html = await renderInstalledDock({ participateBadge: 0, meBadge: 0 });
    expect(tabTag(html, "Participate")).toContain('aria-label="Participate"');
    expect(tabTag(html, "Participate")).not.toContain("aria-describedby");
    expect(tabTag(html, "Me")).not.toContain("aria-describedby");
    expect(tabTag(html, "Home")).not.toContain("aria-describedby");
    expect(html).not.toContain("items need attention");
    expect(html).not.toContain("item needs attention");
    expect(html).not.toContain("solaris-app-tab-badge");
  });
});
