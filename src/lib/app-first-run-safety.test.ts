import { describe, expect, it } from "vitest";

import { appFirstRunAllowedOnPath } from "@/components/app/AppFirstRun";

describe("first-run onboarding route safety", () => {
  it("never opens on canonical critical participant work", () => {
    for (const pathname of [
      "/confirmations",
      "/confirmations/edit/demo-token",
      "/jury-voting",
      "/televoting",
      "/next-in-line",
      "/my-solaris/entry",
      "/integrity/report/category",
      "/integrity/report/review",
    ]) {
      expect(appFirstRunAllowedOnPath(pathname), pathname).toBe(false);
    }
  });

  it("never opens on immersive, launch, auth or Organizer surfaces", () => {
    for (const pathname of [
      "/app-launch",
      "/show-mode",
      "/broadcast/grand-final",
      "/admin",
      "/admin/operations",
      "/auth",
      "/reset",
      "/recover",
    ]) {
      expect(appFirstRunAllowedOnPath(pathname), pathname).toBe(false);
    }
  });

  it("remains available on ordinary installed-app destinations", () => {
    for (const pathname of [
      "/",
      "/explore",
      "/participate",
      "/results",
      "/countries/OLA",
      "/my-solaris/account",
      "/integrity",
      "/televoting/results",
    ]) {
      expect(appFirstRunAllowedOnPath(pathname), pathname).toBe(true);
    }
  });
});
