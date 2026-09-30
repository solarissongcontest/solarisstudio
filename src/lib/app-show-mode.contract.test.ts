import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris installed Show Mode", () => {
  it("provides a dedicated spoiler-aware current-show surface", () => {
    const route = source("src/routes/show-mode/index.tsx");
    expect(route).toContain('createFileRoute("/show-mode/")');
    expect(route).toContain("Hide result spoilers");
    expect(route).toContain('to="/broadcast/$showId"');
    expect(route).toContain('to="/televoting"');
  });

  it("keeps spoiler preference on-device and suppresses installed-app result previews", () => {
    const prefs = source("src/lib/app-experience.ts");
    const results = source("src/routes/results/index.tsx");
    expect(prefs).toContain("solaris.app.experience.v1");
    expect(results).toContain("hideSpoilers");
    expect(results).toContain("Spoiler-free mode is on");
    expect(results).toContain("Reveal official result");
  });

  it("makes Show Mode reachable from the installed-app utility sheet", () => {
    const more = source("src/components/app/AppMoreNavigation.tsx");
    expect(more).toContain('to: "/show-mode"');
    expect(more).toContain('label: "Show Mode"');
  });
});
