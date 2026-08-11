import { describe, expect, it } from "vitest";

import type { ContentEventRow, FanFollowRow } from "@/integrations/supabase/app-types";

import { buildPulseInbox, eventMatchesFollow, predictionLeaderMovements } from "./pulse";

function event(overrides: Partial<ContentEventRow> = {}): ContentEventRow {
  return {
    id: "event-1",
    event_type: "results_published",
    entity_type: "show",
    entity_id: "show-1",
    title: "Results published",
    summary: "",
    route: "/shows/show-1",
    importance: "important",
    payload: {},
    published_at: "2026-08-11T12:00:00Z",
    created_at: "2026-08-11T12:00:00Z",
    ...overrides,
  };
}

function follow(overrides: Partial<FanFollowRow> = {}): FanFollowRow {
  return {
    id: "follow-1",
    profile_id: "profile-1",
    entity_type: "country",
    entity_id: "country-1",
    notification_level: "important",
    created_at: "2026-08-11T12:00:00Z",
    updated_at: "2026-08-11T12:00:00Z",
    ...overrides,
  };
}

describe("Pulse personalization", () => {
  it("matches a followed country through event payload countryIds", () => {
    expect(
      eventMatchesFollow(
        event({ payload: { countryIds: ["country-1", "country-2"] } }),
        follow(),
      ),
    ).toBe(true);
  });

  it("respects important-only follow level", () => {
    const normal = event({
      id: "normal",
      importance: "normal",
      payload: { countryIds: ["country-1"] },
    });
    const important = event({
      id: "important",
      importance: "important",
      payload: { countryIds: ["country-1"] },
    });
    const inbox = buildPulseInbox({
      events: [normal, important],
      follows: [follow()],
      categories: ["results"],
      signedIn: true,
      inAppEnabled: true,
    });
    expect(inbox.map((item) => item.id)).toEqual(["important"]);
  });
});

describe("Prediction movement", () => {
  it("detects a winner-leader change", () => {
    const movement = predictionLeaderMovements({
      ready: true,
      minimum: 5,
      snapshots: [
        {
          capturedAt: "2026-08-11T12:10:00Z",
          sampleSize: 10,
          items: {
            "winner:country-a": { count: 4, percentage: 40 },
            "winner:country-b": { count: 5, percentage: 50 },
          },
        },
        {
          capturedAt: "2026-08-11T12:00:00Z",
          sampleSize: 8,
          items: {
            "winner:country-a": { count: 4, percentage: 50 },
            "winner:country-b": { count: 3, percentage: 37.5 },
          },
        },
      ],
    });

    expect(movement[0]?.leaderChanged).toBe(true);
    expect(movement[0]?.currentCountryId).toBe("country-b");
    expect(movement[0]?.percentageDelta).toBe(12.5);
  });
});
