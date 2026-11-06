import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../integrations/v3/edition-source.server.ts", import.meta.url),
  "utf8",
);
const screen = readFileSync(
  new URL("../components/v3/V3EditionHubScreen.tsx", import.meta.url),
  "utf8",
);
const projection = readFileSync(
  new URL("./v3-edition.ts", import.meta.url),
  "utf8",
);

describe("V3 Edition schedule timing boundary", () => {
  it("projects the existing server-owned Show Mode schedule instead of inventing a second clock", () => {
    expect(source).toContain('import { showModeConfig } from "@/lib/show-mode"');
    expect(source).toContain("const value = showModeConfig(show).scheduledStart");
    expect(source).toContain("Number.isFinite(Date.parse(value)) ? value : null");
    expect(source).toContain("startsAt: publicScheduledStart(show)");
    expect(projection).toContain("startsAt?: string | null");

    for (const forbidden of [
      "scheduled_start",
      "show_start_at",
      "event_start_at",
      "localStorage",
      "sessionStorage",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("renders projected schedule time through the shared hydration-safe EventTime primitive", () => {
    expect(screen).toContain('import { EventTime } from "@/components/public/EventTime"');
    expect(screen).toContain("show.startsAt ? (");
    expect(screen).toContain('<EventTime value={show.startsAt} label="Scheduled" />');
    expect(screen).toContain("Time to be announced");

    expect(screen).not.toMatch(/Date\.now|new Date\(|Intl\.DateTimeFormat|toLocaleString/);
  });

  it("keeps show timing informational rather than using it as contest-state authority", () => {
    expect(screen).not.toMatch(/show\.startsAt[^\n]*(status|experience|results|live)/);
    expect(source).not.toMatch(/publicScheduledStart\(show\)[^\n]*(status|experience|results|live)/);
  });
});