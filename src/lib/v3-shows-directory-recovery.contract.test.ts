import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shows = readFileSync("src/components/v3/V3ShowsDiscoveryScreen.tsx", "utf8");

describe("Explore Show directory publication and recovery", () => {
  it("fails closed on archival query failure without rendering stale published results", () => {
    expect(shows).toContain("archiveHasError(editionsQuery, showsQuery)");
    expect(shows).toContain('<PublicDataState');
    expect(shows).toContain('title="Show directory unavailable"');
    expect(shows).toContain("No cached shows or results are exposed as a fallback.");
    expect(shows).toContain("if (editionsQuery.isError) void editionsQuery.refetch()");
    expect(shows).toContain("if (showsQuery.isError) void showsQuery.refetch()");
    expect(shows).toContain("editionsQuery.isFetching || showsQuery.isFetching");
    expect(shows).toContain("Retry published shows");
  });

  it("does not advertise public navigation or unsafe broadcast destinations", () => {
    expect(shows).toContain('allowsReleased("/editions")');
    expect(shows).toContain("publicBroadcastHref(item.broadcastUrl)");
    expect(shows).toContain("href={broadcastHref}");
    expect(shows).not.toContain("href={item.broadcastUrl}");
    expect(shows).not.toContain("useAllJuryVotes");
    expect(shows).not.toContain("useAllResults");
  });
});
