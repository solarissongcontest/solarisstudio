import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const engagement = readFileSync("src/lib/engagement-data.ts", "utf8");
const taste = readFileSync("src/lib/taste-data.ts", "utf8");

describe("V3 Public fan-data egress boundaries", () => {
  it("never uses schema-wide reads or mutation readbacks in the owned fan-data adapters", () => {
    expect(engagement).not.toContain('.select("*")');
    expect(taste).not.toContain('.select("*")');
  });

  it("keeps the follow projection explicit and complete for the existing row contract", () => {
    expect(engagement).toContain(
      '"id, profile_id, entity_type, entity_id, notification_level, created_at, updated_at"',
    );
    expect(engagement).toContain(".select(FAN_FOLLOW_PROJECTION)");
  });

  it("keeps content-event payloads bounded to the current public event row", () => {
    expect(engagement).toContain(
      '"id, event_type, entity_type, entity_id, title, summary, route, importance, payload, published_at, created_at, dedupe_key"',
    );
    expect(engagement).toContain(".select(CONTENT_EVENT_PROJECTION)");
    expect(engagement).toContain(".limit(limit)");
  });

  it("narrows notification reads and mutation readback to the current preference contract", () => {
    expect(engagement).toContain(
      '"profile_id, in_app_enabled, categories, external_enabled, quiet_hours_start, quiet_hours_end, urgent_deadline_reminders, spoiler_free, timezone, updated_at"',
    );
    expect(engagement.match(/\.select\(NOTIFICATION_PREFERENCE_PROJECTION\)/g)).toHaveLength(2);
  });

  it("narrows Taste DNA list and upsert readback while preserving caller scoping", () => {
    expect(taste).toContain(
      '"id, profile_id, show_id, ranking, created_at, updated_at"',
    );
    expect(taste.match(/\.select\(FAN_TASTE_BALLOT_PROJECTION\)/g)).toHaveLength(2);
    expect(taste).toContain('.eq("profile_id", profileId!)');
    expect(taste).toContain('{ onConflict: "profile_id,show_id" }');
  });

  it("does not add polling or realtime fan-out to these reusable hooks", () => {
    expect(engagement).not.toContain("refetchInterval");
    expect(engagement).not.toContain(".channel(");
    expect(taste).not.toContain("refetchInterval");
    expect(taste).not.toContain(".channel(");
  });
});
