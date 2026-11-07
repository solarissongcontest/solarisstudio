import { describe, expect, it } from "vitest";

import { buildV3FollowingSavedProjection, searchV3FollowingSavedItems } from "./v3-following-saved";

const follows = [
  {
    id: "follow-country",
    profile_id: "viewer-1",
    entity_type: "country" as const,
    entity_id: "country-1",
    notification_level: "important" as const,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "follow-edition",
    profile_id: "viewer-1",
    entity_type: "edition" as const,
    entity_id: "edition-1",
    notification_level: "all" as const,
    created_at: "2026-10-02T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
  },
  {
    id: "follow-show",
    profile_id: "viewer-1",
    entity_type: "show" as const,
    entity_id: "show-1",
    notification_level: "none" as const,
    created_at: "2026-10-03T00:00:00Z",
    updated_at: "2026-10-03T00:00:00Z",
  },
];

describe("V3 Following and Saved projection", () => {
  it("resolves every currently supported canonical follow type", () => {
    const projection = buildV3FollowingSavedProjection({
      viewerId: "viewer-1",
      follows,
      countries: [{ id: "country-1", name: "Solaria", short_code: "SOL" }],
      editions: [{ id: "edition-1", name: "Solaris 22", slug: "solaris-22", edition_number: 22 }],
      shows: [{ id: "show-1", name: "Grand Final", edition_id: "edition-1" }],
    });

    expect(projection.scoped).toBe(true);
    expect(projection.counts).toEqual({ country: 1, edition: 1, show: 1, organization: 0, unsupported: 0 });
    expect(projection.items).toEqual([
      expect.objectContaining({ entityType: "country", title: "Solaria", href: "/countries/SOL" }),
      expect.objectContaining({ entityType: "edition", title: "Solaris 22", href: "/editions/solaris-22" }),
      expect.objectContaining({ entityType: "show", title: "Grand Final", href: "/shows/show-1", context: "Solaris 22" }),
    ]);
  });

  it("shows canonical organization follows as institutions, never as Shows", () => {
    const projection = buildV3FollowingSavedProjection({
      viewerId: "viewer-1",
      follows: [{
        ...follows[0]!,
        id: "follow-organization",
        entity_type: "organization",
        entity_id: "org-1",
      }],
      countries: [],
      editions: [],
      shows: [],
      organizations: [{ id: "org-1", slug: "unity", officialName: "UNITY" }],
    });

    expect(projection.scoped).toBe(true);
    expect(projection.counts).toMatchObject({ organization: 1, show: 0 });
    expect(projection.items[0]).toMatchObject({
      entityType: "organization",
      title: "UNITY",
      context: "Institution",
      href: "/world/organizations/unity",
      resolved: true,
    });
  });

  it("does not infer organization identity from private follow UUIDs while rollout is dark", () => {
    const projection = buildV3FollowingSavedProjection({
      viewerId: "viewer-1",
      follows: [{
        ...follows[0]!,
        id: "follow-hidden",
        entity_type: "organization",
        entity_id: "private-org",
      }],
      countries: [],
      editions: [],
      shows: [],
      organizations: [],
    });

    expect(projection.items[0]).toMatchObject({
      title: "Unavailable institution",
      href: null,
      resolved: false,
      entityType: "organization",
    });
    expect(searchV3FollowingSavedItems(projection.items, "private-org")).toEqual([]);
  });

  it("does not silently coerce future follow types into Shows", () => {
    const projection = buildV3FollowingSavedProjection({
      viewerId: "viewer-1",
      follows: [{
        ...follows[0]!,
        entity_type: "future-entity",
        entity_id: "sensitive-object",
      }],
      countries: [],
      editions: [],
      shows: [],
    });

    expect(projection.items[0]).toMatchObject({
      entityType: "unsupported",
      resolved: false,
      href: null,
      title: "Unsupported saved item",
    });
    expect(projection.counts).toMatchObject({ show: 0, unsupported: 1 });
  });

  it("keeps unresolved preferences visible instead of silently losing them", () => {
    const projection = buildV3FollowingSavedProjection({
      viewerId: "viewer-1",
      follows: [follows[0]!],
      countries: [],
      editions: [],
      shows: [],
    });

    expect(projection.items[0]).toMatchObject({
      title: "Unavailable country",
      href: null,
      resolved: false,
      notificationLevel: "important",
    });
  });

  it("fails closed if the read projection contains another profile", () => {
    const projection = buildV3FollowingSavedProjection({
      viewerId: "viewer-1",
      follows: [{ ...follows[0]!, profile_id: "viewer-2" }],
      countries: [{ id: "country-1", name: "Solaria", short_code: "SOL" }],
      editions: [],
      shows: [],
    });

    expect(projection.scoped).toBe(false);
    expect(projection.items).toEqual([]);
  });
  it("searches only already scoped saved items by name, context and category", () => {
    const projection = buildV3FollowingSavedProjection({
      viewerId: "viewer-1",
      follows,
      countries: [{ id: "country-1", name: "Solaria", short_code: "SOL" }],
      editions: [{ id: "edition-1", name: "Solaris 22", slug: "solaris-22", edition_number: 22 }],
      shows: [{ id: "show-1", name: "Grand Final", edition_id: "edition-1" }],
    });

    expect(searchV3FollowingSavedItems(projection.items, " SOLARIA ").map((x) => x.followId))
      .toEqual(["follow-country"]);
    expect(searchV3FollowingSavedItems(projection.items, "solarIS 22").map((x) => x.followId))
      .toEqual(["follow-edition", "follow-show"]);
    expect(searchV3FollowingSavedItems(projection.items, "show").map((x) => x.followId))
      .toEqual(["follow-show"]);
    expect(searchV3FollowingSavedItems(projection.items, "not saved")).toEqual([]);
    expect(searchV3FollowingSavedItems(projection.items, " ")).toHaveLength(3);
  });

});
