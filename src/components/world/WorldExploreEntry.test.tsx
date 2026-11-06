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

function renderLegacy(flag: boolean, mode: "ready" | "fetching" | "failed" = "ready") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = ["world", "public", "rollout"];
  client.setQueryData(key, flag);
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  if (!query) throw new Error("Missing isolated rollout query");
  if (mode === "fetching") query.setState({ fetchStatus: "fetching" });
  if (mode === "failed") query.setState({
    status: "error", error: new Error("Rollout recheck failed"), fetchStatus: "idle",
  });
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

  it("does not advertise World on cached-true fetch or failed rollout revalidation", () => {
    expect(renderLegacy(true, "fetching")).not.toContain('href="/world"');
    expect(renderLegacy(true, "failed")).not.toContain('href="/world"');
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
