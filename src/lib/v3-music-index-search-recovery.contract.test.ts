import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const screens = () => read("src/components/v3/V3MusicEntityScreens.tsx");
const songsRoute = () => read("src/routes/songs/index.tsx");
const artistsRoute = () => read("src/routes/artists/index.tsx");

describe("V3 music index search recovery", () => {
  it("provides a visible clear action for non-empty Song and Artist searches", () => {
    const source = screens();
    expect(source).toContain("const clear = () =>");
    expect(source).toContain('setDraft("")');
    expect(source).toContain('onSubmit("")');
    expect(source).toContain("{draft ? (");
    expect(source).toContain('type="button"');
    expect(source).toContain("Clear");
    expect(source).toContain("min-h-11");
  });

  it("keeps the cleared state shareable through the existing URL-backed controllers", () => {
    for (const source of [songsRoute(), artistsRoute()]) {
      expect(source).toContain("Route.useSearch()");
      expect(source).toContain("onQueryChange");
      expect(source).toContain("nextQuery || undefined");
      expect(source).toContain("replace: true");
    }
  });

  it("does not add a second query or storage authority to clear search", () => {
    const source = screens();
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("useQuery(");
    expect(source).not.toContain("supabase");
  });
});
