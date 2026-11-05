import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const gate = () => read("src/components/v3/V3EditionRouteGate.tsx");
const overview = () => read("src/components/v3/V3EditionOverviewScreen.tsx");
const participants = () => read("src/components/v3/V3EditionParticipantsScreen.tsx");
const songs = () => read("src/components/v3/V3EditionSongsScreen.tsx");
const schedule = () => read("src/components/v3/V3EditionScheduleScreen.tsx");

describe("V3 Edition spoiler and result safety", () => {
  it("reuses the shared local + server spoiler preference authority", () => {
    const source = gate();
    expect(source).toContain("useAppExperiencePreferences");
    expect(source).toContain("useNotificationPreferences");
    expect(source).toContain("resolveV3ResultsSpoilerProtection");
    expect(source).toContain("localSpoilerFree: preferences.spoilerFree");
    expect(source).toContain("serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null");
    expect(source).toContain("viewerResolved: true");
    expect(source).toContain("hideSpoilers={hideSpoilers}");
    expect(source).toContain("spoilerSafe={hideSpoilers}");
  });

  it("keeps Overview narrative, entry and Result spoilers protected", () => {
    const source = overview();
    expect(source).toContain("const [revealed, setRevealed] = useState(false)");
    expect(source).toContain("const spoilerSafe = hideSpoilers && !revealed");
    expect(source).toContain('data-v3-edition-spoiler-protected=""');
    expect(source).toContain("Reveal edition spoilers");
    expect(source).toContain('title="Songs & artists"');
    expect(source).toContain('title="Stories"');
    expect(source).toContain('title="Results"');
    expect(source).toContain('meta="Spoiler protected"');
  });

  it("keeps Participants useful without exposing Entry or Result spoilers", () => {
    const source = participants();
    expect(source).toContain("!spoilerSafe");
    expect(source).toContain("entryByIdentity");
    expect(source).toContain("resultByIdentity");
    expect(source).toContain("showEntryAvailability={!spoilerSafe}");
    expect(source).toContain("entry details and result placements hidden by spoiler-free mode");
  });

  it("keeps Edition Songs behind a local reveal without changing the global preference", () => {
    const source = songs();
    expect(source).toContain("const [revealed, setRevealed] = useState(false)");
    expect(source).toContain("const spoilerProtected = hideSpoilers && !revealed");
    expect(source).toContain("Reveal songs");
    expect(source).toContain("onReveal={() => setRevealed(true)}");
    expect(source).toContain("Your spoiler-free preference remains enabled");
    expect(source).toContain("!hideSpoilers ? (");
    expect(source).not.toContain("update({ spoilerFree");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("keeps Schedule chronology while suppressing Result/field-size hints under spoiler protection", () => {
    const source = schedule();
    expect(source).toContain("projection.hub.hero.nextEvent");
    expect(source).toContain("<EventTime");
    expect(source).toContain("!spoilerSafe && show.participantCount > 0");
    expect(source).toContain("!spoilerSafe && show.resultsAvailable");
    expect(source).toContain("show.runningOrderAvailable");
  });

  it("does not turn any spoiler-aware collection into a second data or timing authority", () => {
    for (const source of [overview(), participants(), songs(), schedule()]) {
      expect(source).not.toContain("supabase");
      expect(source).not.toContain("createClient");
      expect(source).not.toContain("useQuery(");
      expect(source).not.toContain("Date.now(");
      expect(source).not.toContain("new Date(");
    }
  });
});
