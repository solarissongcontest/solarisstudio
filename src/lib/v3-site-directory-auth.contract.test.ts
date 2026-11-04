import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/site-directory/index.tsx"),
  "utf8",
);
const directoryVisibility = readFileSync(
  resolve(process.cwd(), "src/lib/site-directory-visibility.ts"),
  "utf8",
);
const discoveryVisibility = readFileSync(
  resolve(process.cwd(), "src/lib/public-discovery-visibility.ts"),
  "utf8",
);

describe("V3 Site Directory auth-aware discovery contract", () => {
  it("resolves session state before applying the canonical destination registry", () => {
    expect(route).toContain("useFanSession()");
    expect(route).toContain('isSessionLoading ? "loading" : user ? "signed-in" : "anonymous"');
    expect(route).toContain("visibleSiteDirectoryDestinations(PUBLIC_DESTINATIONS");
    expect(route).not.toContain("PUBLIC_DESTINATIONS.filter(\n      (item) => item.discoverable !== false");
  });

  it("shares the canonical Public discovery filter instead of duplicating auth rules", () => {
    expect(directoryVisibility).toContain(
      "visiblePublicDiscoveryDestinations as visibleSiteDirectoryDestinations",
    );
    expect(discoveryVisibility).toContain('case "hod":');
    expect(discoveryVisibility).toContain('case "organizer":');
    expect(discoveryVisibility).toContain("return false;");
  });

  it("shows Sign in only to known anonymous viewers and signed-in Me only after auth", () => {
    expect(discoveryVisibility).toContain('case "signed-in":');
    expect(discoveryVisibility).toContain('viewer.authenticationState === "signed-in"');
    expect(discoveryVisibility).toContain('destination.id !== "sign-in"');
    expect(discoveryVisibility).toContain('viewer.authenticationState === "anonymous"');
  });

  it("fails contextual account discovery closed during session loading", () => {
    expect(discoveryVisibility).toContain('authenticationState: "loading" | "anonymous" | "signed-in"');
    expect(discoveryVisibility).toContain('destination.visibility === "contextual"');
    expect(route).toContain("[authenticationState, normalizedQuery]");
  });
});
