import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = (name: string) =>
  readFileSync(`src/routes/_authenticated/country-hub/${name}.tsx`, "utf8");

const redirectOnlyRoutes = [
  "index",
  "hod",
  "notices",
  "readiness",
  "page-builder",
  "theme",
] as const;

describe("V3 Country Hub convergence", () => {
  it("keeps every retained Country Hub route compatibility-only", () => {
    for (const name of redirectOnlyRoutes) {
      const source = route(name);
      expect(source).toContain("throw redirect({");
      expect(source).not.toContain("useQuery(");
      expect(source).not.toContain("useMutation(");
      expect(source).not.toContain("@/integrations/supabase");
      expect(source).not.toContain("<AppShell");
      expect(source).not.toContain("<Panel");
    }
  });

  it("routes delegation work into canonical MySolaris participant destinations", () => {
    expect(route("hod")).toContain("NAV_TARGETS.mySolarisTasks");

    const readiness = route("readiness");
    expect(readiness).toContain("NAV_TARGETS.mySolarisEntry");
    expect(readiness).toContain('view: "readiness"');
  });

  it("moves notices to the canonical Me notice inbox without dropping validated search state", () => {
    const source = route("notices");
    expect(source).toContain("NAV_TARGETS.mySolarisNotices");
    expect(source).toContain("notice: typeof search.notice");
    expect(source).toContain("state:");
    expect(source).toContain("search, replace: true");
  });

  it("moves page and visual identity work to canonical MySolaris destinations", () => {
    expect(route("page-builder")).toContain("NAV_TARGETS.mySolarisPageBuilder");
    expect(route("theme")).toContain("NAV_TARGETS.mySolarisTheme");
  });

  it("keeps the Country Hub root as a compatibility path into Me", () => {
    expect(route("index")).toContain("NAV_TARGETS.mySolaris");
  });
});
