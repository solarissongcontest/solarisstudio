import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/EditionHostingExtension.tsx"),
  "utf8",
);

function section(start: string, end?: string) {
  const startIndex = source.indexOf(start);
  const endIndex = end ? source.indexOf(end) : source.length;
  return source.slice(startIndex, endIndex);
}

describe("V3 Edition split-host request budget", () => {
  it("does not load the country catalogue before split hosting is established", () => {
    const outer = section("export function EditionHostingExtension", "function SplitHostingPanel");

    expect(outer).toContain("useEdition(slug ?? \"\")");
    expect(outer).toContain("useShows(edition?.id)");
    expect(outer).toContain("if (hosts.length <= 1) return null;");
    expect(outer).toContain("return <SplitHostingPanel hosts={hosts} />;");
    expect(outer).not.toContain("useCountries()");
  });

  it("loads countries only inside the visible split-host panel", () => {
    const panel = section("function SplitHostingPanel");

    expect(panel).toContain("useCountries()");
    expect(panel).toContain("title=\"Split hosting\"");
    expect(panel).toContain("countryMap.get(host.countryId)");
    expect(panel).toContain("host.shows.map((show)");
  });

  it("keeps host grouping on public edition-scoped Shows", () => {
    const outer = section("export function EditionHostingExtension", "function SplitHostingPanel");

    expect(outer).toContain(".filter((show) => isShowPublic(show))");
    expect(outer).toContain("show.host_country_id ?? edition.host_country_id ?? null");
    expect(outer).toContain("show.host_city ?? edition.host_city ?? null");
  });
});
