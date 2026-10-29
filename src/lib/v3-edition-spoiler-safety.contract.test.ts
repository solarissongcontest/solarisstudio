import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const gate = () => read("src/components/v3/V3EditionRouteGate.tsx");
const productScreen = () => read("src/components/v3/V3EditionProductScreen.tsx");
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
    expect(source).toContain("<V3EditionProductScreen");
    expect(source).toContain("hideSpoilers={hideSpoilers}");
  });

  it("keeps reveal local and establishes one spoiler-safe boundary for overview and collections", () => {
    const source = productScreen();
    expect(source).toContain("const [revealed, setRevealed] = useState(false)");
    expect(source).toContain("const spoilerSafe = hideSpoilers && !revealed");
    expect(source).toContain('if (view === "songs" && spoilerSafe)');
    expect(source).toContain("<ProtectedSongsCollection");
    expect(source).toContain("onReveal={() => setRevealed(true)}");
    expect(source).toContain('data-v3-edition-spoiler-protected=""');
    expect(source).not.toContain("update({ spoilerFree");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("keeps protected content explicit instead of silently removing Edition structure", () => {
    const source = productScreen();
    expect(source).toContain('title="Songs & artists"');
    expect(source).toContain('title="Stories"');
    expect(source).toContain('title="Results"');
    expect(source).toContain('meta="Spoiler protected"');
    expect(source).toContain("Artist and song names stay hidden");
    expect(source).toContain("Official placements, points and result links stay hidden");
  });

  it("preserves safe Edition identity, chronology, participants and schedule while protected", () => {
    const source = productScreen();
    expect(source).toContain("projection.hub.hero.name");
    expect(source).toContain("projection.hub.hero.nextEvent ?");
    expect(source).toContain('value={projection.hub.hero.nextEvent.startsAt}');
    expect(source).toContain("projection.overview.participantCount");
    expect(source).toContain("participantPreview.map");
    expect(source).toContain("showPreview.map");
    expect(source).toContain('view === "participants"');
    expect(source).toContain('view === "schedule"');
  });

  it("does not make collection navigation a new authority boundary", () => {
    const source = productScreen();
    expect(source).toContain("reusing").not;
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("createClient");
    expect(source).not.toContain("useQuery(");
    expect(source).not.toContain("Date.now(");
    expect(source).not.toContain("new Date(");
  });

  it("keeps known withdrawn/disqualified identities out of the public Edition ranking until the Results-owned immutable cutover supersedes this compatibility rule", () => {
    const source = projection();
    expect(source).toContain("competingEditionResults(input)");
    expect(source).toContain('participant.participationStatus !== "confirmed"');
    expect(source).toContain("visibleResults");
    expect(source).toContain('rows: resultsState === "available" ? visibleResults : []');
  });
});
