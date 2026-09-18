import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Anniversary home style architecture", () => {
  it("keeps one stable stylesheet entrypoint on the home takeover", () => {
    const home = source("src/components/HomeAnniversaryTakeover.tsx");
    const takeover = source("src/components/AnniversaryTakeover.tsx");

    expect(home).toContain('import "@/anniversary-home.css"');
    expect(home).not.toContain("anniversary-home-polish.css");
    expect(home).not.toContain("anniversary-home-heading-fix.css");
    expect(home).not.toContain("anniversary-home-editorial-v3.css");
    expect(home).not.toContain("anniversary-redesign.css");
    expect(takeover).not.toContain("anniversary-redesign.css");
    expect(takeover).not.toContain("anniversary-home-polish.css");
    expect(takeover).not.toContain("anniversary-home-editorial-v3.css");
  });

  it("orders base, shared and final composition layers in the entrypoint", () => {
    const entrypoint = source("src/anniversary-home.css");
    const baseIndex = entrypoint.indexOf('anniversary-redesign.css');
    const sharedIndex = entrypoint.indexOf('anniversary-home-polish.css');
    const compositionIndex = entrypoint.indexOf('anniversary-home-editorial-v3.css');

    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(sharedIndex).toBeGreaterThan(baseIndex);
    expect(compositionIndex).toBeGreaterThan(sharedIndex);
    expect(entrypoint).not.toContain("heading-fix");
  });

  it("does not restore the obsolete heading-fix stylesheet", () => {
    expect(existsSync(resolve(process.cwd(), "src/anniversary-home-heading-fix.css"))).toBe(false);
  });

  it("keeps one stable stylesheet entrypoint for the global anniversary shell", () => {
    const celebration = source("src/components/SolarisAnniversaryCelebration.tsx");
    const shell = source("src/anniversary-shell.css");

    expect(celebration).toContain('import "@/anniversary-shell.css"');
    expect(celebration).not.toContain("anniversary-global.css");
    expect(celebration).not.toContain("anniversary-sitewide.css");
    expect(celebration).not.toContain("anniversary-season.css");
    expect(celebration).not.toContain("anniversary-deep.css");

    const globalIndex = shell.indexOf('anniversary-global.css');
    const sitewideIndex = shell.indexOf('anniversary-sitewide.css');
    const seasonIndex = shell.indexOf('anniversary-season.css');
    const deepIndex = shell.indexOf('anniversary-deep.css');

    expect(globalIndex).toBeGreaterThanOrEqual(0);
    expect(sitewideIndex).toBeGreaterThan(globalIndex);
    expect(seasonIndex).toBeGreaterThan(sitewideIndex);
    expect(deepIndex).toBeGreaterThan(seasonIndex);
  });

  it("styles the decorative anniversary artwork used by the current DOM", () => {
    const takeover = source("src/components/AnniversaryTakeover.tsx");
    const composition = source("src/anniversary-home-editorial-v3.css");

    expect(takeover).toContain('className="anniversary-editorial-art"');
    expect(takeover).not.toContain("anniversary-editorial-number");
    expect(composition).toContain(".anniversary-editorial-art");
  });
});
