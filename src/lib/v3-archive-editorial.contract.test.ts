import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 editorial Archive web surface", () => {
  it("uses an opt-in web design scope, not a new data or publication source", () => {
    const route = read("src/routes/archive/index.tsx");
    const directory = read("src/components/v3/V3DirectoryFamilyIndex.tsx");
    const css = read("src/styles/v3-archive-editorial.css");
    expect(route).toContain('visualClassName="v3-editorial-archive"');
    expect(directory).toContain("visualClassName?: string");
    expect(css).toContain("html:not([data-solaris-app]) .v3-editorial-archive");
    expect(route).not.toContain("useQuery(");
    expect(route).not.toContain('.from("');
  });
});
