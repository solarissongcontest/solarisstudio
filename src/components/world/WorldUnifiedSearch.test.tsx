import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));
vi.mock("@/components/FlagChip", () => ({
  FlagChip: () => <span data-testid="flag">flag</span>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) =>
    <a href={to}>{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(() => { throw new Error("Unexpected hosted Supabase request"); }),
    from: vi.fn(() => { throw new Error("Unexpected hosted Supabase request"); }),
  },
}));

import { WorldUnifiedSearchPage } from "./WorldUnifiedSearch";

const response = {
  term: "land",
  countries: [{
    id: "country-oland",
    code: "OLA",
    name: "Oland",
    region: "Hydra",
    flagImage: null,
    accentColor: "#112233",
    secret: "never-render",
  }],
  countryTotal: 37,
  organizations: [{
    id: "org-guard",
    slug: "guard",
    shortName: "GUARD",
    officialName: "Global Union for Allied Resilience and Defence",
    type: "international_organization",
    description: null,
    status: "active",
    secret: "never-render",
  }],
  organizationTotal: 24,
};

function renderWorldSearch(countryPage: number, organizationPage: number, term = "land") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["world", "public", "featured"], [response.organizations[0]]);
  client.setQueryData(
    ["world", "public", "country-search", term, countryPage],
    { countries: response.countries, countryTotal: response.countryTotal },
  );
  client.setQueryData(
    ["world", "public", "organization-search", term, organizationPage],
    { organizations: response.organizations, organizationTotal: response.organizationTotal },
  );
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <WorldUnifiedSearchPage
          term={term}
          countryPage={countryPage}
          organizationPage={organizationPage}
          onSearch={() => {}}
          onPagesChange={() => {}}
        />
      </QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}

describe("Unified World Search public rendering", () => {
  it("shows canonical public identities in separate accessible result sections", () => {
    const html = renderWorldSearch(0, 0);
    expect(html).toContain("Search Terra Solaris");
    expect(html).toContain("Countries");
    expect(html).toContain("Organizations");
    expect(html).toContain("Oland");
    expect(html).toContain("GUARD");
    expect(html).toContain("Global Union for Allied Resilience and Defence");
    expect(html).toContain('aria-labelledby="world-search-countries"');
    expect(html).toContain('aria-labelledby="world-search-organizations"');
    expect(html).not.toContain("never-render");
  });

  it("shows independent pagers and accurate page labels on deep links", () => {
    const html = renderWorldSearch(1, 0);
    expect(html).toContain('aria-label="Country result pages"');
    expect(html).toContain('aria-label="Organization result pages"');
    expect(html).toContain("Page 2 of 4");
    expect(html).toContain("Page 1 of 2");
    expect(html).toContain("13");
    expect(html).toContain("24 of 37");
  });

  it("shows published featured institutions without searching when the term is too short", () => {
    const html = renderWorldSearch(0, 0, "a");
    expect(html).toContain("Enter at least two characters");
    expect(html).toContain("Featured institutions");
    expect(html).toContain("GUARD");
    expect(html).not.toContain("Oland");
    expect(html).not.toContain("never-render");
  });

  it("keeps the main search result pages separate from featured institutions", () => {
    const html = renderWorldSearch(0, 0);
    expect(html).toContain("Oland");
    expect(html).not.toContain("Featured institutions");
  });
});
