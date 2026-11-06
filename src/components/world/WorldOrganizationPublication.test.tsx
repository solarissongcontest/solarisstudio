import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// A static React render never mounts/reactivates a query. Return explicit
// post-recheck outcomes, preserving stale cached data in failures to prove
// the UI refuses to reveal it rather than merely testing an empty cache.
const queryModes = vi.hoisted(() => ({
  projection: "verified" as "verified" | "refetching" | "failed",
  members: "verified" as "verified" | "refetching" | "failed",
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    let data: unknown;
    let mode: "verified" | "refetching" | "failed";
    if (queryKey[2] === "organization" && queryKey[3] === "guard") {
      data = profile;
      mode = queryModes.projection;
    } else if (queryKey[2] === "member-countries") {
      data = countryRows;
      mode = queryModes.members;
    } else {
      throw new Error("Unexpected institutional query during profile rendering");
    }
    return {
      data,
      isSuccess: mode !== "failed",
      isPending: false,
      isError: mode === "failed",
      isRefetchError: mode === "failed",
      isFetching: mode === "refetching",
      refetch: vi.fn(),
    };
  },
}));
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
    joinedAt: "2020-01-01T00:00:00Z",
    endedAt: null,
  }],
  representatives: [{
    id: "representative-a",
    countryId: "country-oland",
    displayName: "REPRESENTATIVE_SENTINEL",
    role: "representative",
    votingAuthority: true,
    startsAt: "2020-01-01T00:00:00Z",
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

const countryRows = [{
  id: "country-oland", name: "OLAND_COUNTRY_SENTINEL",
  short_code: "OLA", accent_color: "#112233", flag_image: null,
}];

type FailureMode = "verified" | "refetching" | "failed";

function renderProfile(
  view: "overview" | "leadership" | "members",
  mode: FailureMode,
  memberMode: FailureMode = "verified",
): string {
  queryModes.projection = mode;
  queryModes.members = memberMode;
  try {
    return renderToStaticMarkup(
      <WorldOrganizationPage slug="guard" view={view} onViewChange={() => {}} />,
    );
  } finally {
    queryModes.projection = "verified";
    queryModes.members = "verified";
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
