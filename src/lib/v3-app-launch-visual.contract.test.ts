import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const launchRoute = () => readFileSync("src/routes/app-launch.tsx", "utf8");

describe("V3 app launch visual contract", () => {
  it("uses Solaris identity without fake progress or legacy launch theatre", () => {
    const source = launchRoute();

    expect(source).toContain("Opening Solaris Studio…");
    expect(source).toContain("Solaris Studio");
    expect(source).toContain("/icon-192.png");
    expect(source).not.toContain("TSBC");
    expect(source).not.toContain("animate-pulse");
    expect(source).not.toContain("progressbar");
  });

  it("keeps the launch trampoline free of extra authority", () => {
    const source = launchRoute();

    expect(source).toContain("Parsing-time trampoline: no auth, telemetry, timer or hydration owner.");
    expect(source).toContain("window.location.replace(safeRoot)");
    expect(source).toContain('window.location.replace("/")');
  });
});
