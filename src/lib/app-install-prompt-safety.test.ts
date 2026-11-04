import { describe, expect, it } from "vitest";

import { installPromptAllowedOnPath } from "@/components/app/AppInstallPrompt";

describe("install prompt route safety", () => {
  it("never interrupts canonical critical participant work", () => {
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
      expect(installPromptAllowedOnPath(pathname), pathname).toBe(false);
    }
  });

  it("never interrupts immersive or administrative surfaces", () => {
    for (const pathname of [
      "/show-mode",
      "/broadcast/grand-final",
      "/admin",
      "/admin/operations",
      "/auth",
      "/reset",
      "/recover",
    ]) {
      expect(installPromptAllowedOnPath(pathname), pathname).toBe(false);
    }
  });

  it("remains eligible on ordinary browsing and account surfaces", () => {
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
      expect(installPromptAllowedOnPath(pathname), pathname).toBe(true);
    }
  });
});
