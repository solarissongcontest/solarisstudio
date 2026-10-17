import { describe, expect, it } from "vitest";

import type { ContentEventRow, FanFollowRow } from "@/integrations/supabase/app-types";
import { projectV3PulseFeed, pulseProvenance } from "./v3-pulse";

function event(
  id: string,
  eventType: string,
  entityType: ContentEventRow["entity_type"] = "edition",
  entityId = "edition-1",
): ContentEventRow {
  return {
    id,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    title: `Event ${id}`,
    summary: `Summary ${id}`,
    route: `/events/${id}`,
    importance: "normal",
    payload: {},
    published_at: "2026-10-17T08:00:00Z",
    created_at: "2026-10-17T08:00:00Z",
    dedupe_key: null,
  };
}

function follow(entityType: FanFollowRow["entity_type"], entityId: string): FanFollowRow {
  return {
    id: `follow-${entityType}-${entityId}`,
    profile_id: "viewer-1",
    entity_type: entityType,
    entity_id: entityId,
    notification_level: "all",
    created_at: "2026-10-17T08:00:00Z",
    updated_at: "2026-10-17T08:00:00Z",
  };
}

describe("V3 Pulse projection", () => {
  it("preserves canonical event identity and caller-bound unread state", () => {
    const projected = projectV3PulseFeed({
      events: [event("read", "results_published"), event("unread", "entry_published")],
      follows: [],
      categories: ["results", "entries"],
      signedIn: true,
      inAppEnabled: true,
      readIds: new Set(["read"]),
    });

    expect(projected.map(({ id, unread }) => ({ id, unread }))).toEqual([
      { id: "read", unread: false },
      { id: "unread", unread: true },
    ]);
  });

  it("uses the existing follow filter without manufacturing a second event store", () => {
    const projected = projectV3PulseFeed({
      events: [
        event("followed", "entry_published", "country", "country-1"),
        event("other", "entry_published", "country", "country-2"),
      ],
      follows: [follow("country", "country-1")],
      categories: ["entries"],
      signedIn: true,
      inAppEnabled: true,
      readIds: new Set(),
    });

    expect(projected.map((item) => item.id)).toEqual(["followed"]);
  });

  it("keeps anonymous Pulse public rather than inventing personal state", () => {
    const projected = projectV3PulseFeed({
      events: [event("public", "running_order_published")],
      follows: [follow("edition", "another-edition")],
      categories: ["running_orders"],
      signedIn: false,
      inAppEnabled: false,
      readIds: new Set(),
    });

    expect(projected).toHaveLength(1);
    expect(projected[0]?.id).toBe("public");
  });

  it("classifies provenance without consulting browser time", () => {
    expect(pulseProvenance("results_published")).toBe("official");
    expect(pulseProvenance("prediction_consensus_shift")).toBe("prediction");
    expect(pulseProvenance("record_broken")).toBe("archive");
    expect(pulseProvenance("country_profile_updated")).toBe("contest");
  });
});
