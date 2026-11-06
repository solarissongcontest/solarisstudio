import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// A static render cannot complete refetchOnMount. Inject already-verified
// responses explicitly; the tested page still decides which publication-safe
// result family is allowed to render.
const queryState = vi.hoisted(() => ({ status: "active" }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const organization = { ...response.organizations[0], status: queryState.status };
    let data: unknown;
    if (queryKey[2] === "featured") {
      data = [organization];
    } else if (queryKey[2] === "country-search") {
      data = { countries: response.countries, countryTotal: response.countryTotal };
    } else if (queryKey[2] === "organization-search") {
      data = { organizations: [organization], organizationTotal: response.organizationTotal };
    } else {
      throw new Error("Unexpected World search query");
    }
    return {
      data,
      isSuccess: true,
      isPending: false,
      isError: false,
      isRefetchError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
}));
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

function renderWorldSearch(
  countryPage: number, organizationPage: number, term = "land", status = "active",
  category: "all" | "countries" | "organizations" = "all",
) {
  queryState.status = status;
  try {
    return renderToStaticMarkup(
      <WorldUnifiedSearchPage
        term={term}
        countryPage={countryPage}
        organizationPage={organizationPage}
        category={category}
        onSearch={() => {}}
        onCategoryChange={() => {}}
        onPagesChange={() => {}}
      />,
    );
  } finally {
    queryState.status = "active";
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

  it("shows the correct category and omits the unused category", () => {
    const countries = renderWorldSearch(0, 0, "land", "active", "countries");
    expect(countries).toContain("Oland");
    expect(countries).not.toContain("Global Union for Allied Resilience and Defence");
    expect(countries).not.toContain('aria-labelledby="world-search-organizations"');
    expect(countries).toContain('aria-pressed="true"');
    const organizations = renderWorldSearch(0, 0, "land", "active", "organizations");
    expect(organizations).toContain("GUARD");
    expect(organizations).not.toContain("Oland");
    expect(organizations).not.toContain('aria-labelledby="world-search-countries"');
  });

  it("does not display featured institutions in country-only browse mode", () => {
    const html = renderWorldSearch(0, 0, "a", "active", "countries");
    expect(html).toContain("Explore the world");
    expect(html).not.toContain("Featured institutions");
    // The search placeholder names GUARD as an example. Check the actual
    // featured row instead of rejecting the accessible placeholder text.
    expect(html).not.toContain("Global Union for Allied Resilience and Defence");
  });

  it("shows published featured institutions without searching when the term is too short", () => {
    const html = renderWorldSearch(0, 0, "a");
    expect(html).toContain("Enter at least two characters");
    expect(html).toContain("Featured institutions");
    expect(html).toContain("GUARD");
    expect(html).not.toContain("Oland");
    expect(html).not.toContain("never-render");
  });

  it("clearly identifies dissolved, historical and suspended organizations", () => {
    for (const status of ["dissolved", "historical", "suspended"]) {
      const html = renderWorldSearch(0, 0, "guard", status);
      expect(html).toContain(status);
      expect(html).toContain("GUARD");
    }
    expect(renderWorldSearch(0, 0, "guard", "active")).not.toContain(">active<");
  });

  it("keeps the main search result pages separate from featured institutions", () => {
    const html = renderWorldSearch(0, 0);
    expect(html).toContain("Oland");
    expect(html).not.toContain("Featured institutions");
  });
});
