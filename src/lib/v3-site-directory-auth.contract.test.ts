import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/site-directory/index.tsx"),
  "utf8",
);
const visibility = readFileSync(
  resolve(process.cwd(), "src/lib/site-directory-visibility.ts"),
  "utf8",
);

describe("V3 Site Directory auth-aware discovery contract", () => {
  it("resolves session state before applying the canonical destination registry", () => {
    expect(route).toContain("useFanSession()");
    expect(route).toContain('isSessionLoading ? "loading" : user ? "signed-in" : "anonymous"');
    expect(route).toContain("visibleSiteDirectoryDestinations(PUBLIC_DESTINATIONS");
    expect(route).not.toContain("PUBLIC_DESTINATIONS.filter(\n      (item) => item.discoverable !== false");
  });

  it("keeps restricted destinations out of the public directory even for signed-in viewers", () => {
    expect(visibility).toContain('case "hod":');
    expect(visibility).toContain('case "organizer":');
    expect(visibility).toContain("return false;");
  });

  it("shows Sign in only to known anonymous viewers and signed-in Me only after auth", () => {
    expect(visibility).toContain('case "signed-in":');
    expect(visibility).toContain('viewer.authenticationState === "signed-in"');
    expect(visibility).toContain('destination.id !== "sign-in"');
    expect(visibility).toContain('viewer.authenticationState === "anonymous"');
  });

  it("fails contextual account discovery closed during session loading", () => {
    expect(visibility).toContain('authenticationState: "loading" | "anonymous" | "signed-in"');
    expect(route).toContain("[authenticationState, normalizedQuery]");
  });
});
