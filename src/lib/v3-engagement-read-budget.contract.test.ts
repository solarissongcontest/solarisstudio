import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/lib/engagement-data.ts"), "utf8");

describe("V3 engagement read budget", () => {
  it("bounds following reads to the FanFollowRow contract", () => {
    expect(source).toContain("const FAN_FOLLOW_FIELDS");
    expect(source).toContain(
      '"id,profile_id,entity_type,entity_id,notification_level,created_at,updated_at"',
    );
    expect(source).toContain(".select(FAN_FOLLOW_FIELDS)");
  });

  it("bounds public content events without changing publication filtering", () => {
    expect(source).toContain("const CONTENT_EVENT_FIELDS");
    expect(source).toContain(
      '"id,event_type,entity_type,entity_id,title,summary,route,importance,payload,published_at,created_at,dedupe_key"',
    );
    expect(source).toContain(".select(CONTENT_EVENT_FIELDS)");
    expect(source).toContain('.lte("published_at", new Date().toISOString())');
    expect(source).toContain(".limit(limit)");
  });

  it("uses the same bounded notification projection for read and save readback", () => {
    expect(source).toContain("const NOTIFICATION_PREFERENCE_FIELDS");
    expect(source).toContain(
      '"profile_id,in_app_enabled,categories,external_enabled,quiet_hours_start,quiet_hours_end,urgent_deadline_reminders,spoiler_free,timezone,updated_at"',
    );
    expect(source.match(/\.select\(NOTIFICATION_PREFERENCE_FIELDS\)/g)?.length).toBe(2);
  });

  it("keeps event-read payloads independently minimal", () => {
    expect(source).toContain('.select("event_id, read_at")');
  });

  it("contains no wildcard table reads or mutation readback", () => {
    expect(source).not.toContain('.select("*")');
  });
});
