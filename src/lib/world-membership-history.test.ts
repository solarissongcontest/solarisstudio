import { describe, expect, it } from "vitest";

import {
  currentMembershipPeriod,
  currentRepresentativePeriods,
  isWorldMembershipRoute,
  readWorldCountryMembership,
} from "./world-membership-history";

const original = {
  organization: {
    id: "organization-1",
    slug: "guard",
    officialName: "Global Union for Allied Resilience and Defence",
    shortName: "GUARD",
    userId: "secret",
  },
  organs: [],
  memberships: [
    {
      id: "past",
      countryId: "country-a",
      membershipType: "member",
      status: "withdrawn",
      joinedAt: "2024-01-01T00:00:00Z",
      endedAt: "2025-01-01T00:00:00Z",
      sourceUserId: "secret",
    },
    {
      id: "present",
      countryId: "country-a",
      membershipType: "observer",
      status: "observer",
      joinedAt: "2026-01-01T00:00:00Z",
      endedAt: null,
    },
  ],
  representatives: [
    {
      id: "former-representative",
      countryId: "country-a",
      displayName: "Former Person",
      role: "representative",
      votingAuthority: true,
      startsAt: "2024-01-01T00:00:00Z",
      endsAt: "2025-01-01T00:00:00Z",
      personId: "secret",
      userId: "secret",
    },
    {
      id: "current-representative",
      countryId: "country-a",
      displayName: "Current Person",
      role: "representative",
      votingAuthority: true,
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: null,
    },
  ],
  offices: [
    {
      id: "guard-chair",
      title: "GUARD Chairperson",
      currentTerm: {
        representedCountryId: "country-a",
        holderDisplayName: "Current Person",
        holderUserId: "secret",
      },
    },
  ],
  privateGrant: { capability: "world.office.manage" },
};

describe("institution/country public membership history", () => {
  it("preserves current and concluded membership from one exact country only", () => {
    const result = readWorldCountryMembership(original, "guard", "country-a")!;
    expect(result.organizationName).toBe("GUARD");
    expect(result.membership.map((period) => period.id)).toEqual(["present", "past"]);
    expect(currentMembershipPeriod(result.membership)?.status).toBe("observer");
    expect(result.representations.map((period) => period.id)).toEqual([
      "current-representative", "former-representative",
    ]);
    expect(currentRepresentativePeriods(result.representations).map((row) => row.id))
      .toEqual(["current-representative"]);
    expect(result.currentOffices).toEqual([{
      id: "guard-chair",
      title: "GUARD Chairperson",
      holderName: "Current Person",
    }]);
  });

  it("drops private/auth/proxy fields even when the upstream projection adds them", () => {
    const result = readWorldCountryMembership(original, "guard", "country-a");
    expect(JSON.stringify(result)).not.toMatch(/secret|userId|personId|privateGrant|capability|proxy/i);
  });

  it("does not invent memberships, representatives or offices for an unrelated country", () => {
    const result = readWorldCountryMembership({
      ...original,
      memberships: [],
      representatives: [],
      offices: [],
    }, "guard", "country-c")!;
    expect(result.membership).toEqual([]);
    expect(result.representations).toEqual([]);
    expect(result.currentOffices).toEqual([]);
    expect(currentMembershipPeriod(result.membership)).toBeNull();
  });

  it("fails closed if the country-scoped RPC returns another country's records", () => {
    const foreignMember = { ...original.memberships[1], countryId: "country-b" };
    const foreignRepresentative = { ...original.representatives[1], countryId: "country-b" };
    const foreignOffice = {
      ...original.offices[0],
      currentTerm: {
        ...original.offices[0].currentTerm,
        representedCountryId: "country-b",
      },
    };
    expect(() => readWorldCountryMembership({
      ...original, memberships: [foreignMember],
    }, "guard", "country-a")).toThrow("country scope: memberships");
    expect(() => readWorldCountryMembership({
      ...original, representatives: [foreignRepresentative],
    }, "guard", "country-a")).toThrow("country scope: representatives");
    expect(() => readWorldCountryMembership({
      ...original, offices: [foreignOffice],
    }, "guard", "country-a")).toThrow("country scope: offices");
  });

  it("rejects duplicated current offices and malformed office term payloads", () => {
    const currentOffice = original.offices[0];
    expect(() => readWorldCountryMembership({
      ...original,
      offices: [currentOffice, { ...currentOffice, title: "Conflicting office" }],
    }, "guard", "country-a")).toThrow("repeated office");
    expect(() => readWorldCountryMembership({
      ...original,
      offices: [{ ...currentOffice, currentTerm: null }],
    }, "guard", "country-a")).toThrow("current office term");
  });

  it("does not confuse private/missing organizations with empty public membership", () => {
    expect(readWorldCountryMembership(null, "guard", "country-a")).toBeNull();
    expect(() => readWorldCountryMembership(original, "unity", "country-a"))
      .toThrow("Organization identity changed");
    expect(() => readWorldCountryMembership({ organization: original.organization }, "guard", "country-a"))
      .toThrow("memberships");
  });

  it("fails closed on contradictory membership ranges and unfamiliar statuses", () => {
    const withMember = (value: Record<string, unknown>) => ({
      ...original,
      memberships: [{ ...original.memberships[1], ...value }],
    });
    expect(() => readWorldCountryMembership(withMember({
      status: "withdrawn", endedAt: null,
    }), "guard", "country-a")).toThrow("Contradictory");
    expect(() => readWorldCountryMembership(withMember({
      status: "member", endedAt: "2025-01-01T00:00:00Z",
    }), "guard", "country-a")).toThrow("Contradictory");
    expect(() => readWorldCountryMembership(withMember({
      status: "secret", endedAt: null,
    }), "guard", "country-a")).toThrow("membership state");
    expect(() => readWorldCountryMembership(withMember({
      joinedAt: "tomorrowish",
    }), "guard", "country-a")).toThrow("joinedAt");
  });

  it("rejects duplicate and overlapping membership terms rather than choosing an arbitrary current term", () => {
    const present = original.memberships[1];
    const overlap = {
      ...original.memberships[0],
      endedAt: "2026-05-01T00:00:00Z",
    };

    expect(() => readWorldCountryMembership({
      ...original,
      memberships: [present, { ...present, id: "another-active" }],
    }, "guard", "country-a")).toThrow("multiple current terms");

    expect(() => readWorldCountryMembership({
      ...original,
      memberships: [present, overlap],
    }, "guard", "country-a")).toThrow("overlapping terms");

    expect(() => readWorldCountryMembership({
      ...original,
      memberships: [{ ...present }, { ...present, status: "member" }],
    }, "guard", "country-a")).toThrow("duplicate");
  });

  it("fails closed on duplicate representative identities", () => {
    const duplicate = original.representatives[1];
    expect(() => readWorldCountryMembership({
      ...original,
      representatives: [duplicate, { ...duplicate, displayName: "Conflicting identity" }],
    }, "guard", "country-a")).toThrow("repeated representative");
  });

  it("accepts only real ISO timestamps, including PostgreSQL timezone offsets", () => {
    const period = original.memberships[1];
    const withTime = (joinedAt: string) => ({
      ...original,
      memberships: [{ ...period, joinedAt }],
    });

    expect(readWorldCountryMembership(withTime("2026-01-01T12:15:00.123456+02:00"), "guard", "country-a")
      ?.membership[0].joinedAt).toBe("2026-01-01T12:15:00.123456+02:00");

    for (const malformed of [
      "2026-02-30T00:00:00Z",
      "2026-13-01T00:00:00Z",
      "01/02/2026",
      "2026-01-01",
      "yesterday",
    ]) {
      expect(() => readWorldCountryMembership(withTime(malformed), "guard", "country-a"))
        .toThrow("joinedAt");
    }
  });

  it("does not treat a concluded representative as current", () => {
    const result = readWorldCountryMembership({
      ...original,
      representatives: [original.representatives[0]],
    }, "guard", "country-a")!;
    expect(currentRepresentativePeriods(result.representations)).toEqual([]);
  });

  it("rejects malformed routes without creating a backend request", () => {
    expect(isWorldMembershipRoute("guard", "OL")).toBe(true);
    expect(isWorldMembershipRoute("unity", "OL-2")).toBe(true);
    expect(isWorldMembershipRoute("../guard", "OL")).toBe(false);
    expect(isWorldMembershipRoute("guard", "OL),status.eq.member")).toBe(false);
    expect(isWorldMembershipRoute("guard", "x".repeat(100))).toBe(false);
  });
});
