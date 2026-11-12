import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) =>
    createElement("a", { ...props, href: to }, children),
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
import { PublicLaunchContext } from "./public-launch-context";
import { PublicLaunchRouteBoundary } from "@/components/public/PublicLaunchRouteBoundary";
import { V3ActionCard } from "@/components/v3/V3Foundation";
import { PublicSecondaryLinks } from "@/components/public/PublicSecondaryLinks";
import type { PublicLaunchFlags } from "./public-launch-availability";

function render(children: ReactNode, flags: PublicLaunchFlags = {}) {
  return renderToStaticMarkup(
    <PublicLaunchContext.Provider
      value={{ active: true, flags, checking: false, error: false, retry: () => {} }}
    >
      {children}
    </PublicLaunchContext.Provider>,
  );
}
describe("soft-launch rendered public entry points", () => {
  it("does not change shared Organizer widgets outside the Public provider", () => {
    expect(
      renderToStaticMarkup(
        <V3ActionCard title="Existing lab" description="Organizer-owned" to="/analysis" />,
      ),
    ).toContain('href="/analysis"');
  });
  it("does not mount an unavailable deep-link child or its domain hooks", () => {
    let mounts = 0;
    function DeferredPage() {
      mounts++;
      return <div>private experimental form</div>;
    }
    const html = render(
      <PublicLaunchRouteBoundary pathname="/fantasy">
        <DeferredPage />
      </PublicLaunchRouteBoundary>,
    );
    expect(mounts).toBe(0);
    expect(html).not.toContain("private experimental form");
    expect(html).toContain("This experience is not available");
    for (const href of ["/", "/explore", "/participate", "/results", "/me"])
      expect(html).toContain(`href="${href}"`);
  });
  it("renders a tester’s permitted feature and closes it again when rollout is revoked", () => {
    const child = (
      <PublicLaunchRouteBoundary pathname="/fantasy">
        <p>permitted game</p>
      </PublicLaunchRouteBoundary>
    );
    expect(render(child, { fantasy_ssc: true })).toContain("permitted game");
    expect(render(child, { fantasy_ssc: false })).not.toContain("permitted game");
  });
  it("does not block a core workflow while optional availability is unknown", () => {
    expect(
      render(
        <PublicLaunchRouteBoundary pathname="/confirmations">
          <p>official form</p>
        </PublicLaunchRouteBoundary>,
      ),
    ).toContain("official form");
  });
  it("filters both V3 cards and browser service links with the same decision", () => {
    const children = (
      <>
        <V3ActionCard title="Fantasy game" description="Optional" to="/fantasy" />
        <V3ActionCard title="Jury ballot" description="Official" to="/jury-voting" />
        <PublicSecondaryLinks
          title="Services"
          items={[
            { to: "/fantasy", title: "Fantasy", description: "Optional" },
            { to: "/rules", title: "Rules", description: "Official" },
          ]}
        />
      </>
    );
    const hidden = render(children);
    expect(hidden).not.toContain('href="/fantasy"');
    expect(hidden).toContain('href="/jury-voting"');
    expect(hidden).toContain('href="/rules"');
    expect(render(children, { fantasy_ssc: true })).toContain('href="/fantasy"');
  });
  it("omits an empty optional-links section instead of leaving a coming-soon dashboard", () => {
    expect(
      render(
        <PublicSecondaryLinks
          title="Optional games"
          items={[{ to: "/fantasy", title: "Fantasy", description: "Optional" }]}
        />,
      ),
    ).toBe("");
  });
});
