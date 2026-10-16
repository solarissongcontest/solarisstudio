import { describe, expect, it } from "vitest";

import { buildV3FollowingSavedProjection } from "./v3-following-saved";

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
    expect(projection.counts).toEqual({ country: 1, edition: 1, show: 1 });
    expect(projection.items).toEqual([
      expect.objectContaining({ entityType: "country", title: "Solaria", href: "/countries/SOL" }),
      expect.objectContaining({ entityType: "edition", title: "Solaris 22", href: "/editions/solaris-22" }),
      expect.objectContaining({ entityType: "show", title: "Grand Final", href: "/shows/show-1", context: "Solaris 22" }),
    ]);
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
});
