import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 permission-aware local navigation search", () => {
  it("uses the same discovery visibility boundary as the Site Directory", () => {
    const search = read("src/lib/public-search.ts");
    const directory = read("src/lib/site-directory-visibility.ts");

    expect(search).toContain("visiblePublicDiscoveryDestinations(PUBLIC_DESTINATIONS, viewer)");
    expect(search).not.toContain("PUBLIC_DESTINATIONS.filter(");
    expect(directory).toContain("visiblePublicDiscoveryDestinations as visibleSiteDirectoryDestinations");
  });

  it("defaults destination search to anonymous-safe discovery", () => {
    const search = read("src/lib/public-search.ts");

    expect(search).toContain('authenticationState: "anonymous"');
    expect(search).toContain("viewer: PublicDiscoveryViewer = ANONYMOUS_DISCOVERY_VIEWER");
  });

  it("fails unscoped contextual destinations closed until authentication is known", () => {
    const visibility = read("src/lib/public-discovery-visibility.ts");

    expect(visibility).toContain('destination.visibility === "contextual"');
    expect(visibility).toContain('viewer.authenticationState === "signed-in"');
    expect(visibility).toContain('case "hod":');
    expect(visibility).toContain('case "organizer":');
  });
});
