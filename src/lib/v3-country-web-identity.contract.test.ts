import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const countryRoute = () =>
  readFileSync(resolve(process.cwd(), "src/routes/countries/$code.tsx"), "utf8");
const styles = () =>
  readFileSync(resolve(process.cwd(), "src/styles/v3-visual-editorial-redesign.css"), "utf8");

describe("Country web editorial identity transition", () => {
  it("moves browser actions below the hero without changing installed-app hero actions", () => {
    const route = countryRoute();
    expect(route).toContain("actions={isAppMode ? (");
    expect(route.match(/actions=\{isAppMode \? \(/g)).toHaveLength(2);
    expect(route).toContain('className="country-editorial-identity-strip"');
    expect(route).toContain('className="country-editorial-identity-links"');
    expect(route).toContain('className="country-editorial-identity-follow"');
    expect(route).toContain("!isAppMode && (");
  });

  it("keeps published country identity and source-backed actions", () => {
    const route = countryRoute();
    expect(route).toContain("publishedDesign ? (");
    expect(route).toContain("CountryDesignV2Hero");
    expect(route).toContain("CountryIdentityHero");
    expect(route).toContain("image={country.flag_image}");
    expect(route).toContain('size="lg"');
    expect(route).toContain('to="/wiki/$code"');
    expect(route).toContain('to="/voting-dna/$code"');
    expect(route).toContain('entityType="country" entityId={country.id}');
  });

  it("scopes composition exclusively to browser web and retains keyboard clarity", () => {
    const css = styles();
    expect(css).toContain("html:not([data-solaris-app]) .country-editorial-profile .country-editorial-identity-strip");
    expect(css).toContain("html:not([data-solaris-app]) .country-editorial-profile .country-editorial-identity-links a:focus-visible");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("border-bottom: 1px solid var(--v3-editorial-rule)");
    expect(css).toContain("@media (max-width: 767px)");
  });
});
