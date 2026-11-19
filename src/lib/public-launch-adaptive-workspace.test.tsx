import { createElement, type ElementType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createLink: (component: ElementType) => ({ to, ...props }: { to: string }) =>
    createElement(component, { ...props, href: to }),
}));
// No database or network: the real adaptive master pane renders an empty
// published-show collection and its fixed navigation using the real link gate.
vi.mock("./data", () => ({
  useEditions: () => ({ data: [] }),
  useAllShows: () => ({ data: [], isLoading: false }),
  useCountries: () => ({ data: [] }),
  editionLabel: () => "Edition",
}));
import { AppAdaptiveWorkspace } from "@/components/app/AppAdaptiveWorkspace";
import { PublicLaunchContext } from "./public-launch-context";

describe("installed/tablet Results master-pane launch visibility", () => {
  const workspace: ReactNode = <AppAdaptiveWorkspace pathname="/results" searchStr=""><p>Published official result</p></AppAdaptiveWorkspace>;

  it("keeps existing Results content but hides all unreleased navigation in P0", () => {
    const html = renderToStaticMarkup(
      <PublicLaunchContext.Provider value={{ active: true, flags: {}, checking: false, error: false, retry: () => {} }}>
        {workspace}
      </PublicLaunchContext.Provider>,
    );
    expect(html).toContain("Published official result");
    expect(html).not.toContain('href="/results"');
    expect(html).not.toContain('href="/analysis"');
    expect(html).not.toContain('href="/scorecharts"');
    expect(html).not.toContain("Detailed published voting");
    expect(html).not.toContain("Voting and result patterns");
  });

  it("keeps P0 route visibility enforced even without an optional-feature provider", () => {
    const html = renderToStaticMarkup(workspace);
    expect(html).toContain("Published official result");
    expect(html).not.toContain('href="/results"');
    expect(html).not.toContain('href="/analysis"');
    expect(html).not.toContain('href="/scorecharts"');
  });
});
