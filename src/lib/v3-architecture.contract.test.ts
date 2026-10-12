import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const full = resolve(path, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

function v3SourceFiles() {
  const componentFiles = filesUnder(resolve(process.cwd(), "src/components/v3"));
  const libraryFiles = filesUnder(resolve(process.cwd(), "src/lib")).filter((path) =>
    basename(path).startsWith("v3-"),
  );

  return [...componentFiles, ...libraryFiles].filter(
    (path) => /\.(?:ts|tsx)$/.test(path) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(path),
  );
}

describe("V3 architecture boundaries", () => {
  it("keeps V3 presentation/projection code free of direct Supabase access", () => {
    const offenders = v3SourceFiles().filter((path) => {
      const contents = readFileSync(path, "utf8");
      return (
        contents.includes("@supabase/") ||
        contents.includes("integrations/supabase") ||
        contents.includes("createClient(") ||
        contents.includes(".from(\"") ||
        contents.includes(".from('")
      );
    });

    expect(offenders).toEqual([]);
  });

  it("keeps the bootstrap as a pure composition of domain projections", () => {
    const bootstrap = readFileSync(resolve(process.cwd(), "src/lib/v3-bootstrap.ts"), "utf8");

    expect(bootstrap).toContain("projectV3Experience");
    expect(bootstrap).toContain("projectV3Actions");
    expect(bootstrap).toContain("projectV3Attention");
    expect(bootstrap).toContain("projectV3Journey");
    expect(bootstrap).toContain("projectV3Home");
    expect(bootstrap).not.toContain("fetch(");
    expect(bootstrap).not.toContain("supabase");
  });

  it("does not let the responsibility journey invent results or optional voting milestones", () => {
    const journey = readFileSync(resolve(process.cwd(), "src/lib/v3-journey.ts"), "utf8");
    const responsibilityBlock = journey.slice(
      journey.indexOf("const RESPONSIBILITY_ORDER"),
      journey.indexOf("function isResponsibility"),
    );

    expect(responsibilityBlock).toContain('"confirmation"');
    expect(responsibilityBlock).toContain('"entry"');
    expect(responsibilityBlock).toContain('"media"');
    expect(responsibilityBlock).toContain('"jury"');
    expect(responsibilityBlock).not.toContain('"results"');
    expect(responsibilityBlock).not.toContain('"televote"');
  });
});
