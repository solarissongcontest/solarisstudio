import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/public/PublicBreadcrumbs.tsx"),
  "utf8",
);

describe("V3 Public breadcrumb request budget", () => {
  it("does not load the complete show catalogue from globally mounted breadcrumbs", () => {
    expect(source).not.toContain("useAllShows");
    expect(source).toContain("useShow(showId)");
  });

  it("keeps static breadcrumb routes data-free", () => {
    expect(source).toContain('return { kind: "static" }');
    expect(source).toContain('return <BreadcrumbView pathname={pathname} />;');
  });

  it("loads country, edition and show context only in route-specific child loaders", () => {
    const countryLoader = source.slice(
      source.indexOf("function CountryBreadcrumbs"),
      source.indexOf("function EditionBreadcrumbs"),
    );
    const editionLoader = source.slice(
      source.indexOf("function EditionBreadcrumbs"),
      source.indexOf("function ShowBreadcrumbs"),
    );
    const showLoader = source.slice(
      source.indexOf("function ShowBreadcrumbs"),
      source.indexOf("function BreadcrumbView"),
    );

    expect(countryLoader).toContain("useCountries()");
    expect(countryLoader).not.toContain("useEditions()");
    expect(countryLoader).not.toContain("useShow(");

    expect(editionLoader).toContain("useEditions()");
    expect(editionLoader).not.toContain("useCountries()");
    expect(editionLoader).not.toContain("useShow(");

    expect(showLoader).toContain("useShow(showId)");
    expect(showLoader).toContain("useEditions()");
    expect(showLoader).not.toContain("useCountries()");
  });

  it("preserves hydration-safe entity-label upgrades and existing UX tracking", () => {
    expect(source).toContain("useEffect(() => setHydrated(true), []);");
    expect(source).toContain("hydrated ? countries : []");
    expect(source).toContain("hydrated ? editions : []");
    expect(source).toContain("hydrated && show ? [show] : []");
    expect(source).toContain('trackPublicUxEvent("breadcrumb_clicked"');
  });

  it("recognizes only breadcrumb detail routes that need entity data", () => {
    expect(source).toContain('/^\\/(?:countries|wiki)\\/[^/]+\\/?$/i');
    expect(source).toContain('/^\\/(?:editions|stories)\\/[^/]+\\/?$/i');
    expect(source).toContain('/^\\/shows\\/([^/]+)\\/?$/i');
  });
});
