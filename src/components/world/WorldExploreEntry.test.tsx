import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Server rendering does not mount a query. Model a completed authoritative
// recheck explicitly instead of treating seeded cache data as newly verified.
const rolloutState = vi.hoisted(() => ({
  enabled: false,
  mode: "ready" as "ready" | "fetching" | "failed",
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (JSON.stringify(queryKey) !== JSON.stringify(["world", "public", "rollout"])) {
      throw new Error("Explore unexpectedly mounted an institutional reader");
    }
    return {
      data: rolloutState.enabled,
      isSuccess: rolloutState.mode !== "failed",
      isError: rolloutState.mode === "failed",
      isRefetchError: rolloutState.mode === "failed",
      isFetching: rolloutState.mode === "fetching",
      isPending: false,
      refetch: vi.fn(),
    };
  },
}));
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
  rolloutState.enabled = flag;
  rolloutState.mode = mode;
  try {
    return renderToStaticMarkup(<WorldExploreEntry />);
  } finally {
    rolloutState.enabled = false;
    rolloutState.mode = "ready";
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
