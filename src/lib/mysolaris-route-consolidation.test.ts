import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("MySolaris route consolidation", () => {
  it("provides one canonical participant route family", () => {
    for (const route of [
      "country",
      "tasks",
      "entry",
      "notices",
      "page-builder",
      "theme",
    ]) {
      expect(
        existsSync(resolve(root, `src/routes/_authenticated/my-solaris/${route}.tsx`)),
        `/my-solaris/${route} route is missing`,
      ).toBe(true);
    }

    const targets = source("src/lib/navigation-targets.ts");
    expect(targets).toContain('mySolaris: "/my-solaris"');
    expect(targets).toContain('mySolarisTasks: "/my-solaris/tasks"');
    expect(targets).toContain('mySolarisEntry: "/my-solaris/entry"');
    expect(targets).toContain('mySolarisNotices: "/my-solaris/notices"');
  });

  it("keeps Country Hub bookmarks as redirects instead of alternate product shells", () => {
    const aliases = [
      ["index.tsx", "mySolarisCountry"],
      ["hod.tsx", "mySolarisTasks"],
      ["readiness.tsx", "mySolarisEntry"],
      ["notices.tsx", "mySolarisNotices"],
      ["page-builder.tsx", "mySolarisPageBuilder"],
      ["theme.tsx", "mySolarisTheme"],
    ] as const;

    for (const [file, destination] of aliases) {
      const content = source(`src/routes/_authenticated/country-hub/${file}`);
      expect(content, `${file} should redirect to ${destination}`).toContain(
        `to: NAV_TARGETS.${destination}`,
      );
      expect(content).toContain("replace: true");
    }
  });

  it("does not append major participant content from the authenticated layout", () => {
    const layout = source("src/routes/_authenticated/route.tsx");
    expect(layout).not.toContain("HodWorkspaceLauncher");
    expect(layout).not.toContain("MySolarisPortalExtension");

    const activity = source("src/components/MySolarisPortalExtension.tsx");
    expect(activity).not.toContain("createPortal");
    expect(activity).toContain("MySolarisActivityPanels");
  });
});
