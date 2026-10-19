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

  it("moves HOD and readiness work into Participate rather than a second task center", () => {
    for (const name of ["hod", "readiness"] as const) {
      const source = route(name);
      expect(source).toContain("NAV_TARGETS.participate");
    }
  });

  it("moves notices to the canonical Me notice inbox", () => {
    const source = route("notices");
    expect(source).toContain('to: "/my-solaris/notices"');
    expect(source).toContain("notice: search.notice");
    expect(source).toContain("state: search.state");
  });

  it("moves page and visual identity work to canonical MySolaris destinations", () => {
    expect(route("page-builder")).toContain("NAV_TARGETS.mySolarisPage");
    expect(route("theme")).toContain("NAV_TARGETS.mySolarisAppearance");
  });

  it("keeps the Country Hub root as a compatibility path into Me", () => {
    expect(route("index")).toContain("NAV_TARGETS.mySolaris");
  });
});
