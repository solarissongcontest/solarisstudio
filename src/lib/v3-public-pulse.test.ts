import { describe, expect, it } from "vitest";

import {
  emptyV3PublicPulseBundle,
  mergeV3PublicPulsePages,
  parseV3PublicPulseBundle,
} from "./v3-public-pulse";

describe("V3 public Pulse projection", () => {
  it("maps the caller-invariant System shape into the existing public event model", () => {
    const parsed = parseV3PublicPulseBundle({
      items: [
        {
          id: "8ce1eb58-3cf4-48ee-92df-8a91582865bc",
          eventType: "results_published",
          entityType: "show",
          entityId: "show-22-final",
          title: "Grand Final results published",
          summary: "The official result is available.",
          route: "/results",
          importance: "important",
          payload: { editionId: "edition-22", showId: "show-22-final" },
          publishedAt: "2026-10-20T05:00:00Z",
        },
      ],
      nextCursor: {
        publishedAt: "2026-10-20T05:00:00Z",
        id: "8ce1eb58-3cf4-48ee-92df-8a91582865bc",
      },
      serverTime: "2026-10-20T05:01:00Z",
    });

    expect(parsed.schemaReady).toBe(true);
    expect(parsed.events).toEqual([
      expect.objectContaining({
        id: "8ce1eb58-3cf4-48ee-92df-8a91582865bc",
        event_type: "results_published",
        entity_type: "show",
        route: "/results",
        published_at: "2026-10-20T05:00:00Z",
        payload: { editionId: "edition-22", showId: "show-22-final" },
      }),
    ]);
    expect(parsed.nextCursor).toEqual({
      publishedAt: "2026-10-20T05:00:00Z",
      id: "8ce1eb58-3cf4-48ee-92df-8a91582865bc",
    });
  });

  it("drops unsafe or structurally invalid event rows rather than inventing public navigation", () => {
    const parsed = parseV3PublicPulseBundle({
      items: [
        {
          id: "8ce1eb58-3cf4-48ee-92df-8a91582865bc",
          eventType: "entry_published",
          entityType: "country",
          entityId: "country-1",
          title: "Entry published",
          summary: "Public update",
          route: "https://evil.example/session",
          importance: "normal",
          payload: {},
          publishedAt: "2026-10-20T05:00:00Z",
        },
        {
          id: "bad-id",
          eventType: "results_published",
          entityType: "show",
          entityId: "show-1",
          title: "Bad row",
          summary: "Bad row",
          route: "/results",
          importance: "important",
          payload: {},
          publishedAt: "2026-10-20T04:00:00Z",
        },
      ],
    });

    expect(parsed.schemaReady).toBe(true);
    expect(parsed.events).toEqual([]);
  });

  it("does not expose a half-valid pagination cursor", () => {
    const parsed = parseV3PublicPulseBundle({
      items: [],
      nextCursor: { publishedAt: "2026-10-20T05:00:00Z" },
    });

    expect(parsed.nextCursor).toBeNull();
  });

  it("deduplicates page overlap by canonical event id", () => {
    const first = parseV3PublicPulseBundle({
      items: [{
        id: "8ce1eb58-3cf4-48ee-92df-8a91582865bc",
        eventType: "results_published",
        entityType: "show",
        entityId: "show-1",
        title: "Newest representation",
        summary: "Published",
        route: "/results",
        importance: "important",
        payload: {},
        publishedAt: "2026-10-20T05:00:00Z",
      }],
    });
    const second = parseV3PublicPulseBundle({
      items: [
        {
          id: "8ce1eb58-3cf4-48ee-92df-8a91582865bc",
          eventType: "results_published",
          entityType: "show",
          entityId: "show-1",
          title: "Duplicate overlap",
          summary: "Published",
          route: "/results",
          importance: "important",
          payload: {},
          publishedAt: "2026-10-20T05:00:00Z",
        },
        {
          id: "3464d882-3116-4be8-857e-ff167c9053d7",
          eventType: "entry_published",
          entityType: "country",
          entityId: "country-2",
          title: "Older event",
          summary: "Published",
          route: "/countries/example",
          importance: "normal",
          payload: {},
          publishedAt: "2026-10-19T05:00:00Z",
        },
      ],
    });

    const merged = mergeV3PublicPulsePages([first, second]);
    expect(merged.map((event) => event.id)).toEqual([
      "8ce1eb58-3cf4-48ee-92df-8a91582865bc",
      "3464d882-3116-4be8-857e-ff167c9053d7",
    ]);
    expect(merged[0]?.title).toBe("Newest representation");
  });

  it("fails closed without a canonical projection payload", () => {
    expect(parseV3PublicPulseBundle(null)).toEqual(emptyV3PublicPulseBundle());
  });
});
