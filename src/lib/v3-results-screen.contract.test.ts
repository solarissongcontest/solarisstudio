import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const screen = () => read("src/components/v3/V3ResultsScreen.tsx");
const route = () => read("src/routes/results/index.tsx");

describe("V3 Results screen contract", () => {
  it("keeps the official result before personal context and advanced analysis", () => {
    const source = screen();
    const official = source.indexOf('title="Official result"');
    const personal = source.indexOf('title="Your result"');
    const explore = source.indexOf('title="Explore this result"');
    const advanced = source.indexOf('title="More analysis"');

    expect(official).toBeGreaterThan(-1);
    expect(personal).toBeGreaterThan(official);
    expect(explore).toBeGreaterThan(personal);
    expect(advanced).toBeGreaterThan(explore);
  });

  it("renders personal delegation context only from the publication-safe Results projection", () => {
    const source = screen();

    expect(source).toContain("projection.yourResult ?");
    expect(source).toContain('data-v3-results-personal-context=""');
    expect(source).toContain("projection.yourResult.countryName");
    expect(source).toContain("projection.yourResult.rank");
    expect(source).toContain("projection.yourResult.points");
    expect(source).not.toContain("useMyCountryAccount");
    expect(source).not.toContain("supabase");
  });

  it("continues to fail closed for unpublished or spoiler-protected results", () => {
    const source = screen();

    expect(source).toContain('projection.status === "unpublished"');
    expect(source).toContain('projection.status === "spoiler-protected"');
    expect(source).toContain("Reveal official result");
  });

  it("documents the remaining server-projection gap instead of hiding it", () => {
    const source = route();

    expect(source).toContain("userDelegationCountryId: null");
  });
});
