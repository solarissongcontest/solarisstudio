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

import { V3ActionCard } from "@/components/v3/V3Foundation";

describe("V3 shared action card semantics", () => {
  it("renders information-only cards as ordinary non-focusable content, not dead buttons", () => {
    const html = renderToStaticMarkup(
      <V3ActionCard title="Semi-final 1" description="Tomorrow at 20:00" tone="neutral" />,
    );

    expect(html).toContain('data-interactive="false"');
    expect(html).toContain("Semi-final 1");
    expect(html).not.toMatch(/<(?:a|button)\b/i);
    expect(html).not.toContain("lucide-chevron-right");
    expect(html).not.toContain("tabindex=");
  });

  it("keeps a real callback on a semantic button with an explicit type", () => {
    const html = renderToStaticMarkup(
      <V3ActionCard title="Retry" description="Try again" onClick={() => {}} />,
    );

    expect(html).toMatch(/<button\b[^>]*type="button"/);
    expect(html).toContain('data-interactive="true"');
    expect(html).toContain("lucide-chevron-right");
  });

  it("preserves canonical link navigation for actionable cards", async () => {
    const root = createRootRoute({ component: Outlet });
    const card = createRoute({
      getParentRoute: () => root,
      path: "/card",
      component: () => (
        <V3ActionCard title="Explore" description="Discover Solaris" to="/explore" />
      ),
    });
    const explore = createRoute({
      getParentRoute: () => root,
      path: "/explore",
      component: () => <div>Explore destination</div>,
    });
    const router = createRouter({
      routeTree: root.addChildren([card, explore]),
      history: createMemoryHistory({ initialEntries: ["/card"] }),
    });
    await router.load();
    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toMatch(/<a\b[^>]*href="\/explore"/);
    expect(html).toContain('data-interactive="true"');
    expect(html).not.toMatch(/<button\b/i);
  });

  it("applies hover and press cues only to interactive cards", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const css = readFileSync(resolve(process.cwd(), "src/styles/v3-foundations.css"), "utf8");

    expect(css).toContain('.v3-action-card[data-interactive="true"]:hover');
    expect(css).toContain('.v3-action-card[data-interactive="true"]:active');
    expect(css).toContain('.v3-action-card[data-interactive="true"]:focus-visible');
    expect(css).not.toContain(".v3-action-card:hover {");
  });
});
