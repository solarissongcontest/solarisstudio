import { describe, expect, it } from "vitest";
import {
  WORLD_REPRESENTATIVE_PAGE_SIZE,
  normalizedWorldRepresentativeSearch,
  parseWorldRepresentativeRoster,
  publicWorldRepresentativeFlag,
  validWorldOrganizationSlug,
} from "./world-representative-roster";

const expected = { slug: "guard", filter: "current" as const, search: "", page: 0 };
const row = {
  id: "representation-one", countryId: "country-one", countryName: "Oland",
  countryCode: "OLA", countryFlagUrl: "https://example.test/oland.png",
  displayName: "Current Delegate", role: "representative",
  votingAuthority: true, startsAt: "2026-11-02T10:00:00+00:00",
  endsAt: null, revision: 1,
};
const response = {
  schemaVersion: 1, organizationId: "organization-one",
  organizationSlug: "guard", organizationName: "GUARD",
  filter: "current", search: "", offset: 0, limit: WORLD_REPRESENTATIVE_PAGE_SIZE,
  total: 1, hasMore: false, rows: [row],
};

describe("public Terra Solaris representative roster", () => {
  it("accepts a current published roster and preserves voting authority", () => {
    const parsed = parseWorldRepresentativeRoster(response, expected);
    expect(parsed?.rows[0]?.displayName).toBe("Current Delegate");
    expect(parsed?.rows[0]?.votingAuthority).toBe(true);
    expect(parsed?.total).toBe(1);
  });

  it("does not preserve person IDs, login IDs, proxies, or private fields", () => {
    const payload = {
      ...response,
      authUserId: "secret-account",
      rows: [{ ...row, personId: "secret-person", userId: "secret-account", proxyUserId: "secret-proxy" }],
    };
    const parsed = parseWorldRepresentativeRoster(payload, expected);
    expect(JSON.stringify(parsed)).not.toContain("secret");
    expect(Object.keys(parsed!.rows[0])).not.toContain("personId");
  });

  it("treats unknown and nonpublic institutions identically", () => {
    expect(parseWorldRepresentativeRoster(null, expected)).toBeNull();
  });

  it("rejects mismatched institution, filter, search, offset, or schema", () => {
    for (const change of [
      { organizationSlug: "unity" },
      { filter: "past" },
      { search: "secret" },
      { offset: 16 },
      { schemaVersion: 2 },
    ]) {
      expect(() => parseWorldRepresentativeRoster({ ...response, ...change }, expected)).toThrow();
    }
  });

  it("requires exact count and next-page proof", () => {
    expect(() => parseWorldRepresentativeRoster({ ...response, total: "1" }, expected)).toThrow();
    expect(() => parseWorldRepresentativeRoster({ ...response, total: 0 }, expected)).toThrow();
    expect(() => parseWorldRepresentativeRoster({ ...response, hasMore: true }, expected)).toThrow();
    expect(() => parseWorldRepresentativeRoster({ ...response, rows: new Array(17).fill(row), total: 17 }, expected)).toThrow();
  });

  it("accepts empty pages without inventing representatives", () => {
    const parsed = parseWorldRepresentativeRoster({ ...response, total: 0, rows: [] }, expected);
    expect(parsed?.rows).toEqual([]);
    expect(parsed?.total).toBe(0);
  });

  it("rejects duplicate representation IDs in the same page", () => {
    expect(() => parseWorldRepresentativeRoster({
      ...response, total: 2, rows: [row, { ...row }],
    }, expected)).toThrow("INVALID_WORLD_REPRESENTATIVE_ROW");
  });

  it("enforces current versus former terms", () => {
    const former = { ...row, endsAt: "2026-11-03T10:00:00+00:00" };
    expect(() => parseWorldRepresentativeRoster({
      ...response, rows: [former],
    }, expected)).toThrow();
    const prior = parseWorldRepresentativeRoster(
      { ...response, filter: "past", rows: [former] },
      { ...expected, filter: "past" },
    );
    expect(prior?.rows[0]?.endsAt).toBe(former.endsAt);
  });

  it("rejects inverted or malformed time and revision boundaries", () => {
    const invalid = [
      { endsAt: "2026-01-01T01:00:00Z" },
      { startsAt: "tomorrow" },
      { revision: -1 },
      { votingAuthority: "true" },
      { role: "" },
    ];
    for (const change of invalid) {
      expect(() => parseWorldRepresentativeRoster({
        ...response, rows: [{ ...row, ...change }],
      }, expected)).toThrow("INVALID_WORLD_REPRESENTATIVE_ROW");
    }
  });

  it("prevents unsafe flag URLs from being placed in the UI", () => {
    expect(publicWorldRepresentativeFlag("javascript:alert(1)")).toBeNull();
    expect(publicWorldRepresentativeFlag("data:image/svg+xml,evil")).toBeNull();
    expect(publicWorldRepresentativeFlag("//evil.test/track.png")).toBeNull();
    expect(publicWorldRepresentativeFlag("http://evil.test/img")).toBeNull();
    expect(publicWorldRepresentativeFlag("/flags/ola.png")).toBe("/flags/ola.png");
    expect(publicWorldRepresentativeFlag("https://images.example.test/ola.png")).toContain("https:");
  });

  it("validates route slugs and normalizes Unicode country searches", () => {
    expect(validWorldOrganizationSlug("guard")).toBe(true);
    expect(validWorldOrganizationSlug("unity-assembly")).toBe(true);
    expect(validWorldOrganizationSlug("../admin")).toBe(false);
    expect(normalizedWorldRepresentativeSearch("  Ålanti   Representative  ")).toBe("Ålanti Representative");
  });
});
