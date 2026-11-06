import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const screen = () => read("src/components/v3/V3EditionParticipantsScreen.tsx");
const gate = () => read("src/components/v3/V3EditionRouteGate.tsx");
const server = () => read("src/integrations/v3/edition-source.server.ts");

function functionBody(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("V3 Edition participant collection", () => {
  it("routes the participant collection through its intentional product surface", () => {
    const source = gate();
    expect(source).toContain('editionView === "participants"');
    expect(source).toContain("<V3EditionParticipantsScreen");
    expect(source).toContain("spoilerSafe={hideSpoilers}");
  });

  it("renders canonical 3:2 flags instead of square identity thumbnails", () => {
    const source = screen();
    expect(source).toContain('data-v3-flag-ratio="3:2"');
    expect(source).toContain("aspect-[3/2]");
    expect(source).toContain("h-8 w-12");
    expect(source).not.toContain("size-9");
  });

  it("supports delegation search and explicit participation-state filtering", () => {
    const source = screen();
    expect(source).toContain('type ParticipantFilter = "all"');
    expect(source).toContain('value: "confirmed"');
    expect(source).toContain('value: "withdrawn"');
    expect(source).toContain('value: "disqualified"');
    expect(source).toContain('placeholder="Find a delegation"');
    expect(source).toContain('aria-label="Filter participants by status"');
    expect(source).toContain("aria-pressed={active}");
  });

  it("groups states deliberately instead of presenting one anonymous database list", () => {
    const source = screen();
    expect(source).toContain("const grouped = useMemo");
    expect(source).toContain('"confirmed"');
    expect(source).toContain('"withdrawn"');
    expect(source).toContain('"disqualified"');
    expect(source).toContain("grouped.map");
  });

  it("surfaces published entry availability without revealing it through spoiler-free mode", () => {
    const source = screen();
    expect(source).toContain("const entryByIdentity = useMemo");
    expect(source).toContain("projection.entries.map");
    expect(source).toContain("entryByIdentity.get(participant.id)");
    expect(source).toContain("Entry not public yet");
    expect(source).toContain("entry.song");
    expect(source).toContain("entry.artist");
    expect(source).toContain("showEntryAvailability={!spoilerSafe}");
    expect(source).toContain("entry details and result placements hidden by spoiler-free mode");
  });

  it("shows only already-published result context and respects spoiler protection", () => {
    const source = screen();
    expect(source).toContain('projection.results.state === "available"');
    expect(source).toContain("!spoilerSafe");
    expect(source).toContain("resultByIdentity.get(participant.id)");
    expect(source).toContain("Official results published");
    expect(source).not.toContain("calculate");
    expect(source).not.toContain("Date.now(");
    expect(source).not.toContain("new Date(");
  });

  it("keeps participant, entry and Result rows on the same canonical display identity", () => {
    const source = server();
    const participants = functionBody(source, "function uniqueParticipants(", "function publicEntries(");
    const entries = functionBody(source, "function publicEntries(", "function publicResults(");
    const results = functionBody(source, "function publicResults(", "function shellEditionLabel(");

    expect(participants).toContain("...identityProjection(display)");
    expect(entries).toContain("...identityProjection(display)");
    expect(results).toContain("...identityProjection(display)");
  });

  it("does not fetch or widen publication authority inside the collection", () => {
    const source = screen();
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("useQuery(");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("public_safe_participants");
  });
});
