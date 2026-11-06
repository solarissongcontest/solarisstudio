import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = () => readFileSync(
  resolve(process.cwd(), "src/components/v3/V3EditionRouteGate.tsx"),
  "utf8",
);

describe("V3 Edition rollout and bundle failure recovery", () => {
  it("retains legacy compatibility for explicitly disabled rollout and ordinary web routes", () => {
    const source = route();
    expect(source).toContain("if (!isAppMode) return <>{legacy}</>");
    expect(source).toContain("rollout.data?.editionHubEnabled !== true");
    expect(source).toContain("return <>{legacy}</>");
  });

  it("does not mount legacy archive queries when V3 rollout authority or the bundle fails", () => {
    const source = route();
    const rolloutStart = source.indexOf("if (rollout.isError) {");
    const disabledStart = source.indexOf("rollout.data?.enabled !== true");
    const bundleStart = source.indexOf("if (bundleQuery.isError) {");
    const unavailableStart = source.indexOf("if (!bundleQuery.data) {");
    const shellStart = source.indexOf("const shell = decideV3ShellForRoute");
    expect(rolloutStart).toBeGreaterThan(0);
    expect(disabledStart).toBeGreaterThan(rolloutStart);
    expect(bundleStart).toBeGreaterThan(disabledStart);
    expect(unavailableStart).toBeGreaterThan(bundleStart);
    const rolloutError = source.slice(rolloutStart, disabledStart);
    const bundleError = source.slice(bundleStart, unavailableStart);
    expect(rolloutError).not.toContain("return <>{legacy}</>");
    expect(bundleError).not.toContain("return <>{legacy}</>");
    expect(source.slice(bundleStart, shellStart)).not.toContain("useAllResults(");
    expect(source.slice(bundleStart, shellStart)).not.toContain("supabase");
  });

  it("provides a shared, retryable, non-leaking failure state", () => {
    const source = route();
    const failure = source.slice(
      source.indexOf("function EditionReadFailure("),
      source.indexOf("export function V3EditionRouteGate("),
    );
    expect(failure).toContain('editionLabel="Edition"');
    expect(failure).toContain('kind="error"');
    expect(failure).toContain("Edition could not be loaded");
    expect(failure).toContain("onClick={onRetry}");
    expect(failure).toContain("disabled={retrying}");
    expect(failure).not.toContain("error.message");
    expect(source).toContain("onRetry={() => void rollout.refetch()}");
    expect(source).toContain("onRetry={() => void bundleQuery.refetch()}");
  });

  it("shows generic unavailability when no published bundle exists", () => {
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
