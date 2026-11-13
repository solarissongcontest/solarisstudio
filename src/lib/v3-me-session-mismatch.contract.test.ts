import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { clearPrivateAccountQueries, isPrivateAccountQuery } from "./account-cache-isolation";
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
    expect(source).toContain("queryKey: summaryKey, enabled: ownsIdentity && Boolean(countryId)");
    expect(source).toContain("ownsIdentity && workspace.countryAccount?.access.userId === viewerId");
  });

  it("scopes Me evidence by verified delegation and evicts it with private account data", () => {
    expect(source).toContain('const countryId = account?.country?.id ?? null;');
    expect(source).toContain('["my-solaris-v3-me-summary", viewerId, countryId ?? "none"]');
    expect(source).toContain('queryKey: ["my-solaris-v3-me-summary", viewerId]');
    const oldCountry = ["my-solaris-v3-me-summary", "viewer", "country-a"];
    const nextCountry = ["my-solaris-v3-me-summary", "viewer", "country-b"];
    expect(isPrivateAccountQuery(oldCountry)).toBe(true);
    expect(isPrivateAccountQuery(nextCountry)).toBe(true);
    const client = new QueryClient();
    client.setQueryData(oldCountry, { receipt_count: 7 });
    client.setQueryData(nextCountry, { receipt_count: 3 });
    client.setQueryData(["countries"], ["public"]);
    clearPrivateAccountQueries(client);
    expect(client.getQueryData(oldCountry)).toBeUndefined();
    expect(client.getQueryData(nextCountry)).toBeUndefined();
    expect(client.getQueryData(["countries"])).toEqual(["public"]);
    client.clear();
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
