import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = () => readFileSync(
  resolve(process.cwd(), "src/components/v3/V3EditionRouteGate.tsx"),
  "utf8",
);

describe("V3 Edition bundle failure recovery", () => {
  it("retains legacy compatibility for disabled rollout and ordinary website routes", () => {
    const source = route();
    expect(source).toContain("if (!isAppMode) return <>{legacy}</>");
    expect(source).toContain("rollout.data?.editionHubEnabled !== true");
    expect(source).toContain("return <>{legacy}</>");
  });

  it("does not mount legacy archive-wide queries when an enabled V3 Edition read fails", () => {
    const source = route();
    const errorStart = source.indexOf("if (bundleQuery.isError) {");
    const unavailableStart = source.indexOf("if (!bundleQuery.data) {");
    const shellStart = source.indexOf("const shell = decideV3ShellForRoute");
    expect(errorStart).toBeGreaterThan(0);
    expect(unavailableStart).toBeGreaterThan(errorStart);
    expect(shellStart).toBeGreaterThan(unavailableStart);
    const failedBranches = source.slice(errorStart, shellStart);
    expect(failedBranches).not.toContain("return <>{legacy}</>");
    expect(failedBranches).not.toContain("useAllResults(");
    expect(failedBranches).not.toContain("supabase");
  });

  it("shows a retryable and non-leaking error on a failed exact Edition bundle", () => {
    const source = route();
    const error = source.slice(
      source.indexOf("if (bundleQuery.isError) {"),
      source.indexOf("if (!bundleQuery.data) {"),
    );
    expect(error).toContain('editionLabel="Edition"');
    expect(error).toContain('kind="error"');
    expect(error).toContain("Edition could not be loaded");
    expect(error).toContain("onClick={() => void bundleQuery.refetch()}");
    expect(error).toContain("disabled={bundleQuery.isFetching}");
    expect(error).not.toContain("bundleQuery.error.message");
  });

  it("shows only a generic unavailable state if the publication-safe bundle is absent", () => {
    const source = route();
    const unavailable = source.slice(
      source.indexOf("if (!bundleQuery.data) {"),
      source.indexOf("const shell = decideV3ShellForRoute"),
    );
    expect(unavailable).toContain('kind="empty"');
    expect(unavailable).toContain("Edition unavailable");
    expect(unavailable).not.toContain("slug}");
    expect(unavailable).not.toContain("return <>{legacy}</>");
  });
});
