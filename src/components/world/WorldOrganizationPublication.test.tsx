import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/FlagChip", () => ({
  FlagChip: () => <span data-testid="flag-chip">Flag</span>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) =>
    <a href={to}>{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(() => { throw new Error("Unexpected hosted Supabase RPC"); }),
    from: vi.fn(() => { throw new Error("Unexpected hosted Supabase query"); }),
  },
}));

import { WorldOrganizationPage } from "./WorldPublic";

const profile = {
  organization: {
    id: "world-guard",
    slug: "guard",
    officialName: "Verified GUARD Institution",
    shortName: "GUARD",
    type: "international_union",
    description: "PUBLIC_PROFILE_DESCRIPTION_SENTINEL",
    status: "active",
  },
  organs: [],
  memberships: [{
    id: "membership-a",
    countryId: "country-oland",
    membershipType: "member",
    status: "member",
    endedAt: null,
  }],
  representatives: [{
    id: "representative-a",
    countryId: "country-oland",
    displayName: "REPRESENTATIVE_SENTINEL",
    role: "representative",
    votingAuthority: true,
    endsAt: null,
  }],
  offices: [{
    id: "office-a",
    title: "OFFICE_SENTINEL",
    currentTerm: {
      holderDisplayName: "OFFICEHOLDER_SENTINEL",
      representedCountryId: "country-oland",
      startEditionId: null,
      endEditionId: null,
      status: "active",
    },
  }],
};

type FailureMode = "verified" | "refetching" | "failed";

function renderProfile(view: "overview" | "leadership" | "members", mode: FailureMode,
  memberMode: FailureMode = "verified",
): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const projectionKey = ["world", "public", "organization", "guard"];
  const memberKey = ["world", "public", "member-countries", ["country-oland"]];

  client.setQueryData(projectionKey, profile);
  client.setQueryData(memberKey, [{
    id: "country-oland", name: "OLAND_COUNTRY_SENTINEL",
    short_code: "OLA", accent_color: "#112233", flag_image: null,
  }]);

  const modify = (key: readonly unknown[], status: FailureMode) => {
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    if (!query) throw new Error("Missing isolated query cache");
    if (status === "refetching") query.setState({ fetchStatus: "fetching" });
    if (status === "failed") query.setState({
      status: "error", error: new Error("Publication verification failed"),
      fetchStatus: "idle",
    });
  };
  modify(projectionKey, mode);
  modify(memberKey, memberMode);

  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <WorldOrganizationPage slug="guard" view={view} onViewChange={() => {}} />
      </QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}

describe("World institution publication revalidation", () => {
  it("renders verified public profile and current leadership", () => {
    const html = renderProfile("leadership", "verified");
    expect(html).toContain("Verified GUARD Institution");
    expect(html).toContain("OFFICEHOLDER_SENTINEL");
  });

  it("hides cached public institution and leadership data during refresh", () => {
    const html = renderProfile("leadership", "refetching");
    expect(html).toContain("Verifying organization publication");
    expect(html).not.toContain("PUBLIC_PROFILE_DESCRIPTION_SENTINEL");
    expect(html).not.toContain("OFFICEHOLDER_SENTINEL");
    expect(html).not.toContain("Verified GUARD Institution");
  });

  it("hides formerly verified organization data after a failed refresh", () => {
    const html = renderProfile("members", "failed");
    expect(html).toContain("Public institution information could not be verified");
    expect(html).not.toContain("Verified GUARD Institution");
    expect(html).not.toContain("REPRESENTATIVE_SENTINEL");
    expect(html).not.toContain("OLAND_COUNTRY_SENTINEL");
  });

  it("does not display cached member-country identities after their recheck fails", () => {
    const html = renderProfile("members", "verified", "failed");
    expect(html).toContain("Member country labels could not be verified");
    expect(html).toContain("Verified GUARD Institution");
    expect(html).not.toContain("OLAND_COUNTRY_SENTINEL");
    expect(html).not.toContain("REPRESENTATIVE_SENTINEL");
  });

  it("does not display cached member-country identities while rechecking", () => {
    const html = renderProfile("members", "verified", "refetching");
    expect(html).toContain("Verifying member countries");
    expect(html).not.toContain("OLAND_COUNTRY_SENTINEL");
  });

  it("displays verified published member labels and public representatives", () => {
    const html = renderProfile("members", "verified", "verified");
    expect(html).toContain("OLAND_COUNTRY_SENTINEL");
    expect(html).toContain("REPRESENTATIVE_SENTINEL");
  });
});
