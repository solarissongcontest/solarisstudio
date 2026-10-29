import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const screen = () => read("src/components/v3/V3EditionParticipantsScreen.tsx");
const gate = () => read("src/components/v3/V3EditionRouteGate.tsx");

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

  it("shows only already-published result context and respects spoiler protection", () => {
    const source = screen();
    expect(source).toContain('projection.results.state === "available"');
    expect(source).toContain("!spoilerSafe");
    expect(source).toContain("resultByIdentity.get(participant.id)");
    expect(source).toContain("result placements hidden by spoiler-free mode");
    expect(source).not.toContain("calculate");
    expect(source).not.toContain("Date.now(");
    expect(source).not.toContain("new Date(");
  });

  it("does not fetch or widen publication authority inside the collection", () => {
    const source = screen();
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("useQuery(");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("public_safe_participants");
  });
});
