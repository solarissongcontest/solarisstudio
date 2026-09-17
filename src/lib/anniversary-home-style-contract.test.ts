import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Anniversary home style architecture", () => {
  it("keeps one stable stylesheet entrypoint on the home takeover", () => {
    const home = source("src/components/HomeAnniversaryTakeover.tsx");

    expect(home).toContain('import "@/anniversary-home.css"');
    expect(home).not.toContain("anniversary-home-polish.css");
    expect(home).not.toContain("anniversary-home-heading-fix.css");
    expect(home).not.toContain("anniversary-home-editorial-v3.css");
  });

  it("keeps the final composition ordered behind the shared home layer", () => {
    const entrypoint = source("src/anniversary-home.css");
    const sharedIndex = entrypoint.indexOf('anniversary-home-polish.css');
    const compositionIndex = entrypoint.indexOf('anniversary-home-editorial-v3.css');

    expect(sharedIndex).toBeGreaterThanOrEqual(0);
    expect(compositionIndex).toBeGreaterThan(sharedIndex);
    expect(entrypoint).not.toContain("heading-fix");
  });

  it("does not restore the obsolete heading-fix stylesheet", () => {
    expect(existsSync(resolve(process.cwd(), "src/anniversary-home-heading-fix.css"))).toBe(false);
  });

  it("styles the decorative anniversary artwork used by the current DOM", () => {
    const takeover = source("src/components/AnniversaryTakeover.tsx");
    const composition = source("src/anniversary-home-editorial-v3.css");

    expect(takeover).toContain('className="anniversary-editorial-art"');
    expect(takeover).not.toContain("anniversary-editorial-number");
    expect(composition).toContain(".anniversary-editorial-art");
  });
});
