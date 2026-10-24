import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

const privateDelegationEditorRoutes = [
  "src/routes/_authenticated/my-solaris/page-builder.tsx",
  "src/routes/_authenticated/my-solaris/theme.tsx",
  "src/routes/_authenticated/country-hub/page-builder.tsx",
  "src/routes/_authenticated/country-hub/theme.tsx",
] as const;

describe("private delegation editor route metadata", () => {
  it.each(privateDelegationEditorRoutes)("keeps %s out of search indexing", (path) => {
    const route = source(path);

    expect(route).toContain('{ name: "robots", content: "noindex" }');
    expect(route).toContain("head: () => ({");
  });

  it("keeps compatibility editors redirect-only while protecting their metadata", () => {
    const pageBuilder = source("src/routes/_authenticated/country-hub/page-builder.tsx");
    const theme = source("src/routes/_authenticated/country-hub/theme.tsx");

    expect(pageBuilder).toContain("NAV_TARGETS.mySolarisPageBuilder");
    expect(theme).toContain("NAV_TARGETS.mySolarisTheme");
    expect(pageBuilder).toContain("replace: true");
    expect(theme).toContain("replace: true");
  });
});
