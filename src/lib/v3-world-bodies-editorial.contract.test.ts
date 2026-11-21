import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const screen = () => readFileSync(resolve(process.cwd(), "src/components/world/WorldBodiesPublic.tsx"), "utf8");
const css = () => readFileSync(resolve(process.cwd(), "src/styles/v3-world-bodies-editorial.css"), "utf8");

describe("World institutional bodies: browser editorial experience", () => {
  it("introduces concise browsing copy and a readable institutional hierarchy", () => {
    const source = screen();
    expect(source).toContain("world-bodies-editorial");
    expect(source).toContain("world-bodies-page-header");
    expect(source).toContain("world-bodies-search");
    expect(source).toContain("world-bodies-item");
    expect(source).toContain("world-body-reading-grid");
    expect(source).toContain("Currently active public office definitions only.");
    expect(source).toContain("Public assemblies, committees and other organs of {result.organization.officialName}.");
  });

  it("preserves one AppShell and the existing installed-app layout", () => {
    const source = screen();
    expect(source).toContain("<AppShell><div");
    expect(source).toContain("(isAppMode ? \"\" : \"world-bodies-editorial \")");
    expect(source).toContain('isAppMode ? "max-w-2xl px-3 pt-3"');
    expect(source).toContain("platformResolved ? children");
    expect(css()).toContain("html:not([data-solaris-app]) .world-bodies-editorial");
    expect(source).toContain('"world-bodies-frame mx-auto w-full pb-28 [overflow-wrap:anywhere] "');
    expect(css()).toContain("@media (max-width: 767px)");
  });

  it("does not alter verified publication and connectivity safety boundaries", () => {
    const source = screen();
    expect(source).toContain("enabled: valid && !publicationBlocked");
    expect(source).toContain("private terms and unpublished appointments are excluded.");
    expect(source).toContain('search={{ q: "", status: "all", page: 1 }}');
    expect(source).toContain("enabled: valid && !officeNetworkBlocked");
    expect(source).toContain("enabled: !!result && !officeNetworkBlocked");
    expect(source).toContain('queryKey: ["world", "public", "bodies", slug, term, status, page, connectivity.checkedAt]');
    expect(source).toContain('refetchOnMount: "always"');
    expect(source).toContain("!query.isFetchedAfterMount || query.isFetching ? undefined : query.data");
    expect(source).toContain("disabled={officeNetworkBlocked}");
    expect(css()).toContain("prefers-reduced-motion: reduce");
    expect(css()).toContain("forced-colors: active");
  });
});
