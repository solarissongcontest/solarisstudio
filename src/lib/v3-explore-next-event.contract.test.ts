import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = () => read("src/integrations/v3/explore-source.server.ts");
const resolver = () => read("src/lib/v3-explore-next-event.ts");

describe("V3 Explore next public event authority", () => {
  it("loads canonical show timing only for the already-resolved current edition", () => {
    const text = source();
    expect(text).toContain("publication_config,broadcast_config");
    expect(text).toContain('.eq("edition_id", currentEdition.id)');
    expect(text).toContain('.eq("published", true)');
    expect(text).toContain("resolveV3ExploreNextPublicEvent(currentShows, generatedAt)");
  });

  it("uses one server timestamp rather than the browser clock", () => {
    const text = source();
    expect(text).toContain("const generatedAt = new Date().toISOString()");
    expect(text).toContain("currentNextEvent = resolveV3ExploreNextPublicEvent(currentShows, generatedAt)");
    expect(text).toContain("generatedAt,");
  });

  it("requires a public scheduled show with a future canonical scheduledStart", () => {
    const text = resolver();
    expect(text).toContain("isShowPublic(show)");
    expect(text).toContain('config.phase !== "scheduled"');
    expect(text).toContain("config.scheduledStart");
    expect(text).toContain("timestamp <= now");
    expect(text).toContain("href: `/shows/${show.id}`");
  });

  it("does not infer chronology from sort order, local timers or unpublished state", () => {
    const text = resolver();
    expect(text).not.toContain("Date.now()");
    expect(text).not.toContain("setTimeout");
    expect(text).not.toContain("setInterval");
    expect(text).not.toContain("localStorage");
    expect(text).not.toContain("sessionStorage");
    expect(text).toContain("left.timestamp - right.timestamp");
    expect(text).toContain("left.sortOrder - right.sortOrder");
  });
});
