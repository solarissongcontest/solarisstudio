import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const screen = () => read("src/components/v3/V3EditionSongsScreen.tsx");
const gate = () => read("src/components/v3/V3EditionRouteGate.tsx");

describe("V3 Edition Songs collection", () => {
  it("routes the Songs collection through a dedicated music surface", () => {
    const source = gate();
    expect(source).toContain('editionView === "songs"');
    expect(source).toContain("<V3EditionSongsScreen");
    expect(source).toContain("hideSpoilers={hideSpoilers}");
  });

  it("supports song, artist and country discovery without turning labels into identity", () => {
    const source = screen();
    expect(source).toContain('placeholder="Find a song, artist or country"');
    expect(source).toContain("entry.song");
    expect(source).toContain("entry.artist");
    expect(source).toContain("entry.name");
    expect(source).toContain("entry.shortCode");
    expect(source).not.toContain("slugify");
    expect(source).not.toContain("v3SongHref(entry.song");
    expect(source).not.toContain("toLowerCase().replace");
  });

  it("uses canonical 3:2 country flags and existing Country navigation", () => {
    const source = screen();
    expect(source).toContain('data-v3-flag-ratio="3:2"');
    expect(source).toContain("aspect-[3/2]");
    expect(source).toContain("entry.href");
    expect(source).toContain("entry.flagImage");
    expect(source).toContain("entry.name");
    expect(source).toContain("min-h-11");
  });

  it("surfaces only already-published official result context", () => {
    const source = screen();
    expect(source).toContain('projection.results.state === "available"');
    expect(source).toContain("resultByIdentity.get(entry.id)");
    expect(source).toContain("result.totalPoints");
    expect(source).toContain("result.rank");
    expect(source).not.toContain("calculate");
    expect(source).not.toContain("jury_points");
    expect(source).not.toContain("televote_points");
  });

  it("keeps song details spoiler protected until a local reveal", () => {
    const source = screen();
    expect(source).toContain("const [revealed, setRevealed] = useState(false)");
    expect(source).toContain("const spoilerProtected = hideSpoilers && !revealed");
    expect(source).toContain('data-v3-edition-songs-spoiler-protected=""');
    expect(source).toContain("Reveal songs");
    expect(source).toContain("onReveal={() => setRevealed(true)}");
    expect(source).toContain("Your spoiler-free preference remains enabled");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("does not let the protected or local-reveal view bypass the global spoiler preference through music discovery", () => {
    const source = screen();
    const protectedStart = source.indexOf("function ProtectedSongs(");
    const productStart = source.indexOf("export function V3EditionSongsScreen");
    const protectedSource = source.slice(protectedStart, productStart);

    expect(protectedStart).toBeGreaterThanOrEqual(0);
    expect(productStart).toBeGreaterThan(protectedStart);
    expect(protectedSource).not.toContain('to="/music"');
    expect(source).toContain("!hideSpoilers ? (");
    expect(source).toContain('to="/music"');
    expect(source).toContain("broader music discovery stays outside this local reveal");
  });

  it("connects to first-class music discovery when spoiler protection is not active", () => {
    const source = screen();
    expect(source).toContain('title="Songs & artists"');
    expect(source).toContain("first-class publication-safe music discovery surface");
    expect(source).toContain('to="/music"');
  });

  it("does not invent media or add a second publication/fetch boundary", () => {
    const source = screen();
    expect(source).not.toContain("youtube_url");
    expect(source).not.toContain("spotify_url");
    expect(source).not.toContain("apple_music_url");
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("useQuery(");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("Date.now(");
    expect(source).not.toContain("new Date(");
  });
});
