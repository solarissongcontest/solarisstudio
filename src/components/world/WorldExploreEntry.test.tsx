import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) =>
    <a href={to}>{children}</a>,
}));
vi.mock("@/components/v3/V3Foundation", () => ({
  V3Section: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  V3ActionCard: ({ title, to }: { title: string; to: string }) =>
    <a href={to}>{title}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(() => Promise.reject(new Error("Test unexpectedly accessed Supabase"))),
    from: vi.fn(() => { throw new Error("Test unexpectedly queried Supabase"); }),
  },
}));

import { WorldExploreEntry, WorldV3ExploreEntry } from "./WorldExploreEntry";

function renderLegacy(flag: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["world", "public", "rollout"], flag);
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}><WorldExploreEntry /></QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}

describe("Terra Solaris discovery entry in the three experiences", () => {
  it("hides the browser-web entry until canonical public rollout is enabled", () => {
    expect(renderLegacy(false)).not.toContain("/world");
    expect(renderLegacy(true)).toContain('href="/world"');
    expect(renderLegacy(true)).toContain("Terra Solaris");
  });

  it("keeps the installed-app entry presentational and gated by a server-owned decision", () => {
    expect(renderToStaticMarkup(<WorldV3ExploreEntry enabled={false} />)).toBe("");
    const html = renderToStaticMarkup(<WorldV3ExploreEntry enabled={true} />);
    expect(html).toContain('href="/world"');
    expect(html).toContain("Explore the world");
  });

  it("never mounts institutional reads during plain Explore rendering", () => {
    const html = renderLegacy(true);
    expect(html).not.toContain("world_organizations");
    expect(html).toContain("Discover GUARD, UNITY");
  });
});
