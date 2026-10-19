import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const gate = () => read("src/components/v3/V3EditionRouteGate.tsx");
const safeScreen = () => read("src/components/v3/V3EditionSpoilerSafeScreen.tsx");
const projection = () => read("src/lib/v3-edition.ts");

describe("V3 Edition spoiler and result safety", () => {
  it("reuses the shared local + server spoiler preference authority", () => {
    const source = gate();
    expect(source).toContain("useAppExperiencePreferences");
    expect(source).toContain("useNotificationPreferences");
    expect(source).toContain("resolveV3ResultsSpoilerProtection");
    expect(source).toContain("localSpoilerFree: preferences.spoilerFree");
    expect(source).toContain("serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null");
    expect(source).toContain("viewerResolved: true");
    expect(source).toContain("<V3EditionSpoilerSafeScreen");
  });

  it("hides narrative, entry and result content before the user explicitly reveals this Edition", () => {
    const source = safeScreen();
    const revealBoundary = source.indexOf("if (!hideSpoilers || revealed)");
    const protectedMarker = source.indexOf('data-v3-edition-spoiler-protected=""');
    expect(revealBoundary).toBeGreaterThan(-1);
    expect(protectedMarker).toBeGreaterThan(revealBoundary);
    expect(source).toContain("Published story titles, narrative moments, entry details, placements and points stay hidden");
    expect(source).toContain("Reveal edition spoilers");
    expect(source).not.toContain("projection.entries.map");
    expect(source).not.toContain("projection.story.title");
    expect(source).not.toContain("projection.story.items");
    expect(source).not.toContain("projection.results.rows");
  });

  it("preserves normal Edition section landmarks without exposing protected payloads", () => {
    const source = safeScreen();
    expect(source).toContain('title="At a glance"');
    expect(source).toContain('title="Participants"');
    expect(source).toContain('title="Songs & artists"');
    expect(source).toContain('title="Schedule"');
    expect(source).toContain('title="Stories"');
    expect(source).toContain('title="Results"');
    expect(source).toContain('meta="Spoiler protected"');
  });

  it("keeps safe Edition identity, participant and schedule value available while protected", () => {
    const source = safeScreen();
    expect(source).toContain("projection.hub.hero.name");
    expect(source).toContain("projection.overview.participantCount");
    expect(source).toContain("projection.participants.map");
    expect(source).toContain("projection.shows.map");
    expect(source).toContain("Public edition identity, participants and show schedule remain available below");
  });

  it("keeps reveal local instead of mutating the user's spoiler preference", () => {
    const source = safeScreen();
    expect(source).toContain("const [revealed, setRevealed] = useState(false)");
    expect(source).toContain("onClick={() => setRevealed(true)}");
    expect(source).toContain("Your spoiler-free preference stays unchanged");
    expect(source).not.toContain("update({ spoilerFree");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("keeps known withdrawn/disqualified identities out of the public Edition ranking", () => {
    const source = projection();
    expect(source).toContain("competingEditionResults(input)");
    expect(source).toContain('participant.participationStatus !== "confirmed"');
    expect(source).toContain("visibleResults");
    expect(source).toContain('rows: resultsState === "available" ? visibleResults : []');
  });
});
