import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/v3/V3MeRoot.tsx", import.meta.url),
  "utf8",
);

describe("V3 Me resolved identity boundary", () => {
  it("keeps private Me reads disabled whenever viewer identity does not match", () => {
    expect(source).toContain("const ownsIdentity = workspace.user?.id === viewerId");
    expect(source).toContain("useFanProfile(ownsIdentity ? viewerId : undefined)");
    expect(source).toContain("useMyFollows(ownsIdentity ? viewerId : undefined)");
    expect(source).toContain("queryKey: summaryKey, enabled: ownsIdentity");
    expect(source).toContain("ownsIdentity && workspace.countryAccount?.access.userId === viewerId");
  });

  it("distinguishes a pending provider from a resolved identity mismatch", () => {
    const pendingGuard = source.indexOf("if (workspace.isLoading) {");
    const mismatchGuard = source.indexOf("if (!ownsIdentity) {");
    const privateProjection = source.indexOf("const projection = buildV3MeProjection({");
    expect(pendingGuard).toBeGreaterThan(-1);
    expect(mismatchGuard).toBeGreaterThan(pendingGuard);
    expect(privateProjection).toBeGreaterThan(mismatchGuard);
    expect(source).not.toContain("if (!ownsIdentity || workspace.isLoading)");
    expect(source).toContain("Account verification required");
    expect(source).toContain("No personal details are shown.");
    expect(source).toContain('to="/auth"');
  });
});
