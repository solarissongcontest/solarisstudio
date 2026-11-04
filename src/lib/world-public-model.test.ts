import { describe, expect, it } from "vitest";

import {
  WORLD_DIRECTORY_PAGE_SIZE,
  activeWorldMemberships,
  currentWorldRepresentatives,
  parseWorldOrganizationDetail,
  parseWorldOrganizationDirectory,
  sanitizeWorldDirectorySearch,
  worldSearchExpression,
} from "./world-public-model";

const institution = {
  id: "a4a2fddc-5d03-41c0-b9d6-848d7cf02c67",
  slug: "guard",
  officialName: "Global Union for Allied Resilience and Defence",
  shortName: "GUARD",
  type: "international_union",
  description: "Official institutional profile",
  status: "active",
  userId: "must-not-escape",
  privateNotes: "internal",
};

const membership = {
  id: "membership-1",
  countryId: "country-1",
  membershipType: "member",
  status: "member",
  joinedAt: "2026-01-01T00:00:00Z",
  endedAt: null,
  createdByUserId: "never-public",
};

const representative = {
  id: "representative-1",
  countryId: "country-1",
  personId: "person-1",
  displayName: "Representative Example",
  role: "representative",
  votingAuthority: true,
  startsAt: "2026-01-01T00:00:00Z",
  endsAt: null,
  userId: "never-public",
};

const projection = {
  organization: institution,
  organs: [{
    id: "organ-1",
    slug: "general-assembly",
    name: "General Assembly",
    shortName: null,
    type: "general_assembly",
    status: "active",
    sortOrder: 10,
  }],
  memberships: [membership],
  representatives: [representative],
  offices: [{
    id: "office-1",
    slug: "chairperson",
    title: "Chairperson",
    currentTerm: {
      id: "term-1",
      holderDisplayName: "Example Chair",
      representedCountryId: "country-1",
      holderUserId: "never-public",
    },
  }],
};

describe("TG3 public organization projection", () => {
  it("accepts a published TG2 organization and strips hidden and auth-linked keys", () => {
    const result = parseWorldOrganizationDetail(projection);
    expect(result?.organization.shortName).toBe("GUARD");
    expect(result?.organization.officialName).toContain("Defence");
    expect(result?.organs).toHaveLength(1);
    expect(result?.memberships[0].status).toBe("member");
    expect(result?.representatives[0].displayName).toBe("Representative Example");
    expect(result?.offices[0].currentHolder).toBe("Example Chair");
    expect(JSON.stringify(result)).not.toMatch(/must-not-escape|never-public|privateNotes|createdByUserId|personId/);
  });

  it("distinguishes an absent or private public projection from malformed data", () => {
    expect(parseWorldOrganizationDetail(null)).toBeNull();
    expect(() => parseWorldOrganizationDetail({ organization: institution, memberships: [] }))
      .toThrow("Invalid public world data");
    expect(() => parseWorldOrganizationDetail({ ...projection, organization: { ...institution, slug: "../internal" } }))
      .toThrow("organization slug");
  });

  it("rejects a non-public directory row even when the API accidentally includes one", () => {
    expect(parseWorldOrganizationDirectory([{ ...institution, public_visibility: "public" }])).toHaveLength(1);
    expect(() => parseWorldOrganizationDirectory([
      { ...institution, public_visibility: "private" },
    ])).toThrow("Private organization");
    expect(() => parseWorldOrganizationDirectory([{ ...institution, public_visibility: "members" }]))
      .toThrow("Private organization");
    expect(() => parseWorldOrganizationDirectory({ rows: [] })).toThrow("organization directory");
  });

  it("rejects unexpected institutional states and incomplete official records", () => {
    expect(() => parseWorldOrganizationDetail({
      ...projection,
      organization: { ...institution, status: "secret_unapproved" },
    })).toThrow("organization status");
    expect(() => parseWorldOrganizationDetail({
      ...projection,
      memberships: [{ ...membership, status: "pending" }],
    })).toThrow("membership status");
    expect(() => parseWorldOrganizationDetail({
      ...projection,
      representatives: [{ ...representative, votingAuthority: "true" }],
    })).toThrow("voting authority");
  });

  it("does not invent current members or officeholders from concluded history", () => {
    const result = parseWorldOrganizationDetail({
      ...projection,
      memberships: [
        membership,
        { ...membership, id: "past", countryId: "country-2", status: "withdrawn", endedAt: "2025-01-01" },
        { ...membership, id: "suspended", countryId: "country-3", status: "suspended" },
      ],
      representatives: [
        representative,
        { ...representative, id: "former", endsAt: "2025-01-01" },
      ],
      offices: [{ ...projection.offices[0], currentTerm: null }],
    });
    expect(activeWorldMemberships(result!.memberships).map((row) => row.countryId))
      .toEqual(["country-1", "country-3"]);
    expect(currentWorldRepresentatives(result!.representatives).map((row) => row.id))
      .toEqual(["representative-1"]);
    expect(result!.offices[0].currentHolder).toBeNull();
  });
});

describe("TG3 bounded public discovery", () => {
  it("restricts search syntax before embedding it in a PostgREST OR expression", () => {
    const query = sanitizeWorldDirectorySearch(" GUARD),status.eq.private,%_ (");
    expect(query).toBe("GUARDstatus eqprivate");
    expect(worldSearchExpression(query)).toBe(
      "official_name.ilike.%GUARDstatus eqprivate%,short_name.ilike.%GUARDstatus eqprivate%",
    );
    expect(() => worldSearchExpression("guard),status.eq.private")).toThrow("sanitized");
    expect(worldSearchExpression("")).toBeNull();
    expect(sanitizeWorldDirectorySearch("x".repeat(100))).toHaveLength(64);
  });

  it("uses a fixed page size to bound read-model requests", () => {
    expect(WORLD_DIRECTORY_PAGE_SIZE).toBe(24);
  });
});
