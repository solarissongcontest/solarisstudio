import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = readFileSync("src/routes/explore/index.tsx", "utf8");
const css = readFileSync("src/styles/explore-web-editorial.css", "utf8");

describe("Explore web public Edition spotlight", () => {
  it("mounts the lightweight edition query only inside the effective public release gate", () => {
    expect(root).toContain('const editionsAvailable = allowsReleased("/editions")');
    expect(root).toContain("editionsAvailable ? <ExploreWebEditionFeature /> : null");
    expect(root).toContain("function ExploreWebEditionFeature()");
    expect(root).toContain("const editionsQuery = useEditions()");
    expect(root).not.toContain("useAllResults(");
    expect(root).not.toContain("useAllShows(");
    expect(root).not.toContain("useAllJuryVotes(");
  });

  it("never promotes draft, failed or stale status into a current edition", () => {
    expect(root).toContain("editionsQuery.isSuccess && !editionsQuery.isFetching && !editionsQuery.isRefetchError");
    expect(root).toContain(".filter((item) => item.published)");
    expect(root).toContain("resolveActivePublicEdition(published)");
    expect(root).toContain('active ? "Current published edition" : featured ? "Latest published edition"');
    expect(root).toContain("Edition details are temporarily unavailable.");
    expect(root).toContain("featured.host_city");
  });

  it("uses the canonical deep link only if released, retaining an index fallback", () => {
    expect(root).toContain("allowsReleased(`/editions/${featured.slug}`)");
    expect(root).toContain('to="/editions/$slug"');
    expect(root).toContain('params={{ slug: featured.slug }}');
    expect(root).toContain('to="/editions"');
    expect(root).toContain("isAppMode ? (");
    expect(css).toContain(".explore-web-editorial__feature-meta");
    expect(css).toContain("overflow-wrap: anywhere");
  });
});
