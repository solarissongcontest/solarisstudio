import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("V3 Country Hub responsibility ownership", () => {
  const hodRoute = () => source("src/routes/_authenticated/country-hub/hod.tsx");
  const readinessRoute = () => source("src/routes/_authenticated/country-hub/readiness.tsx");

  it("hands legacy HOD responsibility entry points directly to Participate", () => {
    const route = hodRoute();

    expect(route).toContain("NAV_TARGETS.participate");
    expect(route).toContain("replace: true");
    expect(route).not.toContain("NAV_TARGETS.mySolarisTasks");
    expect(route).not.toContain("validateSearch");
    expect(route).not.toContain("country:");
  });

  it("hands legacy delegation readiness entry points directly to Participate", () => {
    const route = readinessRoute();

    expect(route).toContain("NAV_TARGETS.participate");
    expect(route).toContain("replace: true");
    expect(route).not.toContain("NAV_TARGETS.mySolarisEntry");
    expect(route).not.toContain('view: "readiness"');
    expect(route).not.toContain("validateSearch");
    expect(route).not.toContain("country:");
  });

  it("keeps both compatibility routes out of indexing", () => {
    expect(hodRoute()).toContain('{ name: "robots", content: "noindex" }');
    expect(readinessRoute()).toContain('{ name: "robots", content: "noindex" }');
  });
});
