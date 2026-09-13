import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const nativeModules = [
  source("src/components/mysolaris/modules/MySolarisTasksModule.tsx"),
  source("src/components/mysolaris/modules/MySolarisEntryModule.tsx"),
  source("src/components/mysolaris/modules/MySolarisNoticesModule.tsx"),
];
const legacyRoutes = [
  source("src/routes/_authenticated/country-hub/hod.tsx"),
  source("src/routes/_authenticated/country-hub/readiness.tsx"),
  source("src/routes/_authenticated/country-hub/notices.tsx"),
];
const canonicalRoutes = [
  source("src/routes/_authenticated/my-solaris/tasks.tsx"),
  source("src/routes/_authenticated/my-solaris/entry.tsx"),
  source("src/routes/_authenticated/my-solaris/notices.tsx"),
];

describe("native MySolaris operational modules", () => {
  it("keeps implementation ownership outside legacy Country Hub routes", () => {
    for (const module of nativeModules) {
      expect(module).toContain('from "@/components/AppShell"');
      expect(module).not.toContain("createFileRoute");
      expect(module).not.toContain("redirect({");
    }
    for (const route of legacyRoutes) {
      expect(route).toContain("createFileRoute");
      expect(route).toContain("throw redirect({ to: NAV_TARGETS.mySolaris");
      expect(route).not.toContain('from "@/components/AppShell"');
      expect(route).not.toContain("useQuery(");
    }
  });

  it("makes canonical MySolaris routes load the native modules directly", () => {
    for (const route of canonicalRoutes) {
      expect(route).toContain("@/components/mysolaris/modules/");
      expect(route).not.toContain("@/routes/_authenticated/country-hub/");
    }
  });

  it("removes Studio 2 product language from participant-facing operational modules", () => {
    for (const module of nativeModules) {
      expect(module).not.toContain('eyebrow="Solaris Studio 2');
      expect(module).not.toContain("Studio 2 communications rollout");
    }
  });
});
