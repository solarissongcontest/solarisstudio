import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="shell">{children}</div>,
}));
vi.mock("@/components/FlagChip", () => ({
  FlagChip: () => <span>flag</span>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) =>
    <a href={to}>{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(() => Promise.reject(new Error("Unexpected real Supabase request"))),
    from: vi.fn(() => { throw new Error("Unexpected real Supabase table request"); }),
  },
}));

import { WorldPublicGate } from "./WorldPublic";

/**
 * This is a real React rendering test. It models a resolved authoritative
 * rollout decision through React Query's public cache, without any Supabase.
 */
function renderWorldGate(rollout: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["world", "public", "rollout"], rollout);
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <WorldPublicGate><section>Published world profile sentinel</section></WorldPublicGate>
      </QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}

describe("World public rollout gate", () => {
  it("does not render institutional content while the feature is disabled", () => {
    const html = renderWorldGate(false);
    expect(html).toContain("World is not yet available");
    expect(html).toContain("Return to Explore");
    expect(html).not.toContain("Published world profile sentinel");
  });

  it("hides a cached enabled flag when its subsequent revalidation fails", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const key = ["world", "public", "rollout"];
    client.setQueryData(key, true);
    // A previous successful read does not authorize continued publication
    // after a failed refetch. No hosted Supabase call is made in this test.
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    expect(query).toBeDefined();
    query!.setState({
      status: "error",
      error: new Error("World publication recheck failed"),
      fetchStatus: "idle",
    });
    try {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <WorldPublicGate><section>Published world profile sentinel</section></WorldPublicGate>
        </QueryClientProvider>,
      );
      expect(html).toContain("World availability could not be verified");
      expect(html).not.toContain("Published world profile sentinel");
    } finally {
      client.clear();
    }
  });

  it("does not display cached World content while the feature flag is being rechecked", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["world", "public", "rollout"];
    client.setQueryData(key, true);
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    expect(query).toBeDefined();
    query!.setState({ fetchStatus: "fetching" });
    try {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <WorldPublicGate><section>Published world profile sentinel</section></WorldPublicGate>
        </QueryClientProvider>,
      );
      expect(html).toContain("Checking Terra Solaris availability");
      expect(html).not.toContain("Published world profile sentinel");
    } finally {
      client.clear();
    }
  });

  it("mounts the reader only after the server-approved decision is true", () => {
    const html = renderWorldGate(true);
    expect(html).toContain("Published world profile sentinel");
    expect(html).not.toContain("World is not yet available");
  });
});
