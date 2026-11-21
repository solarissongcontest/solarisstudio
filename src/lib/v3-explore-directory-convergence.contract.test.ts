import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildV3ExploreRootProjection, type V3ExploreRootInput } from "./v3-explore";

const source = readFileSync("src/integrations/v3/explore-source.server.ts", "utf8");
const view = readFileSync("src/components/v3/V3ExploreScreen.tsx", "utf8");
const styles = readFileSync("src/styles/v3-directory-family.css", "utf8");

describe("Explore connected directory surfaces", () => {
  it("links Archive and Tools via the same canonical public navigation without extra reads", () => {
    expect(source).toContain('archiveRoot: "/archive"');
    expect(source).toContain('tools: "/tools"');
    expect(view).toContain("projection.archive.links.map");
    expect(view).toContain("projection.more.map");
    expect(view).toContain("V3ExploreEditorialLink");
    expect(view).not.toContain("useQuery(");
  });

  it("only adds the new discovery destinations when explicitly configured", () => {
    const input = {
      currentEditionId: null, editions: [], countries: [], songs: [], artists: [], shows: [], stories: [],
      routes: {
        countries: "/countries", songsAndArtists: "/editions", shows: "/shows",
        stories: "/stories", results: "/results", rules: "/rules",
        editionsArchive: "/editions", wiki: "/wiki", encyclopedia: "/encyclopedia",
        archiveRoot: "/archive", tools: "/tools"
      }
    } satisfies V3ExploreRootInput;
    const projected = buildV3ExploreRootProjection(input);
    expect(projected.archive.links[0]).toEqual({key:"archive",label:"Complete archive",href:"/archive"});
    expect(projected.more).toContainEqual({key:"tools",label:"Tools",href:"/tools"});
    expect(buildV3ExploreRootProjection({...input,routes:{...input.routes,archiveRoot:null,tools:null}}).archive.links.some(x=>x.key==="archive")).toBe(false);
  });
  it("gives the Archive/Site Directory family responsive editorial rows instead of boxed grids", () => {
    expect(styles).toContain('data-directory-kind="sitemap"');
    expect(styles).toContain("min-height: 5.2rem");
    expect(styles).toContain("border-bottom: 1px solid var(--border)");
    expect(styles).toContain("@media (max-width: 940px)");
  });
});
