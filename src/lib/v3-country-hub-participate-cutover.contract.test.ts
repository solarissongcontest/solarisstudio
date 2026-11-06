import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = (name: string) =>
  source(`src/routes/_authenticated/country-hub/${name}.tsx`);

const COUNTRY_HUB_COMPATIBILITY_ROUTES = [
  "index",
  "hod",
  "notices",
  "readiness",
  "page-builder",
  "theme",
] as const;

describe("V3 Country Hub compatibility cutover", () => {
  it("keeps every retained Country Hub route redirect-only", () => {
    for (const name of COUNTRY_HUB_COMPATIBILITY_ROUTES) {
      const routeSource = route(name);

      expect(routeSource).toContain("throw redirect({");
      expect(routeSource).toContain("component: () => null");
      expect(routeSource).not.toContain("useQuery(");
      expect(routeSource).not.toContain("useMutation(");
      expect(routeSource).not.toContain("@/integrations/supabase");
      expect(routeSource).not.toContain("<AppShell");
    }
  });

  it("moves delegation responsibility and readiness deep links into Participate", () => {
    for (const name of ["hod", "readiness"] as const) {
      const routeSource = route(name);

      expect(routeSource).toContain("NAV_TARGETS.participate");
      expect(routeSource).toContain("search, replace: true");
      expect(routeSource).not.toContain("NAV_TARGETS.mySolarisTasks");
      expect(routeSource).not.toContain("NAV_TARGETS.mySolarisEntry");
    }
  });

  it("keeps personal Country Hub capabilities on one canonical personal route family", () => {
    expect(route("index")).toContain("NAV_TARGETS.mySolarisCountry");
    expect(route("notices")).toContain("NAV_TARGETS.mySolarisNotices");
    expect(route("page-builder")).toContain("NAV_TARGETS.mySolarisPageBuilder");
    expect(route("theme")).toContain("NAV_TARGETS.mySolarisTheme");
  });

  it("preserves safe deep-link context instead of reopening legacy workflow state", () => {
    for (const name of ["index", "hod", "readiness", "page-builder", "theme"] as const) {
      const routeSource = route(name);
      expect(routeSource).toContain('country: typeof search.country === "string"');
      expect(routeSource).toContain("search, replace: true");
    }

    const noticesSource = route("notices");
    expect(noticesSource).toContain('notice: typeof search.notice === "string"');
    expect(noticesSource).toContain("INBOX_STATES.has(search.state)");
    expect(noticesSource).toContain("search, replace: true");
  });
});
