import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/AppShell", () => ({
  PageHeader: () => null,
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ArchiveDataState", () => ({
  ArchiveDataLoading: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock("@/components/FlagChip", () => ({ FlagChip: () => <span>flag</span> }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) =>
    <a href={to}>{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(() => Promise.reject(new Error("Unexpected hosted Supabase query"))),
    from: vi.fn(() => { throw new Error("Unexpected hosted Supabase table read"); }),
  },
}));

import { WorldCountryRolloutGate } from "./WorldCountryInternational";

/** Server rendering preloaded flag decisions needs no network or Supabase access. */
function renderGate(rollout?: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (rollout !== undefined) {
    client.setQueryData(["world", "public", "rollout"], rollout);
  }
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <WorldCountryRolloutGate>
          <section>International records sentinel</section>
        </WorldCountryRolloutGate>
      </QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}

describe("World Country International publication boundary", () => {
  it("does not treat a cached disabled decision as the current route's verified rollout", () => {
    const html = renderGate(false);
    expect(html).toContain("Checking Terra Solaris availability");
    expect(html).not.toContain("International records sentinel");
  });

  it("does not render country records while the rollout is unverified", () => {
    const html = renderGate();
    expect(html).toContain("Checking Terra Solaris availability");
    expect(html).not.toContain("International records sentinel");
  });

  it("does not mount country readers from an old cached enabled flag", () => {
    const html = renderGate(true);
    expect(html).toContain("Checking Terra Solaris availability");
    expect(html).not.toContain("International records sentinel");
  });

  it("does not trust cached disabled data until the current-route check completes", () => {
    const html = renderGate(false);
    expect(html).not.toContain("International records sentinel");
  });
});
