import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019235700_v3_public_pulse_projection.sql",
  ),
  "utf8",
);

describe("Public V3 Pulse publication-safe projection", () => {
  it("uses server time and cannot widen for Organizer-capable authenticated callers", () => {
    expect(migration).toContain("event.published_at <= now()");
    expect(migration).not.toContain("publishing.manage");
    expect(migration).not.toContain("has_role");
    expect(migration).not.toContain("auth.uid()");
    expect(migration).toContain("to anon, authenticated");
  });

  it("keeps pagination bounded and deterministic across timestamp ties", () => {
    expect(migration).toContain("v_limit > 50");
    expect(migration).toContain("event.published_at desc, event.id desc");
    expect(migration).toContain("event.published_at = p_before_published_at and event.id < p_before_id");
    expect(migration).toContain("Pulse cursor timestamp and id must be supplied together");
    expect(migration).toContain("'nextCursor', v_next_cursor");
  });

  it("returns only an allowlisted public rendering payload rather than the stored payload wholesale", () => {
    expect(migration).toContain("jsonb_strip_nulls(jsonb_build_object(");
    expect(migration).toContain("'editionId', event.payload -> 'editionId'");
    expect(migration).toContain("'showId', event.payload -> 'showId'");
    expect(migration).toContain("'countryIds', event.payload -> 'countryIds'");
    expect(migration).not.toMatch(/['\"]payload['\"]\s*,\s*event\.payload\b/);
  });

  it("only emits safe relative routes from the public projection", () => {
    expect(migration).toContain("left(event.route, 1) = '/'");
    expect(migration).toContain("left(event.route, 2) <> '//'");
    expect(migration).toContain("event.route !~ '[[:cntrl:]]'");
  });

  it("is a read-only S13-governed projection with a valid stable key", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("v3.public-pulse-projection");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/\binsert\s+into\s+public\.content_events\b/i);
    expect(migration).not.toMatch(/\bupdate\s+public\.content_events\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.content_events\b/i);
  });
});
