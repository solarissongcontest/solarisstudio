import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Home canonical current-contest entry", () => {
  it("projects a route only from a published official edition without extra reads", () => {
    const server = source("src/lib/v3-primary-surface-bootstrap.ts");
    expect(server).toContain("publicContest.edition?.published === true");
    expect(server).toContain("encodeURIComponent(publicContest.edition.slug.trim())");
    expect(server).toContain('href: string | null;');
    expect(server).not.toContain('queryFn:');
  });

  it("provides an actual current edition action and an archive fallback", () => {
    const home = source("src/components/v3/V3HomeScreen.tsx");
    expect(home).toContain('data-v3-home-contest-entry=""');
    expect(home).toContain('"Explore current edition" : "Browse editions"');
    expect(home).toContain('to={currentContest.href ?? "/editions"}');
    expect(home).not.toContain('window.location');
  });
});
