import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-investigations.tsx"),
  "utf8",
);

describe("V3 Organizer Investigation desk availability", () => {
  it("validates the authoritative case queue before rendering it", () => {
    expect(route).toContain('rpc("admin_integrity_cases")');
    expect(route).toContain("return parseCases(data)");
    expect(route).toContain("if (!Array.isArray(value))");
    expect(route).toContain("return value.map(parseCaseItem)");
    expect(route).toContain("CASE_PRIORITIES");
    expect(route).toContain("Integrity case authority returned an invalid queue payload.");
  });

  it("does not render zero operational metrics while the first queue load is unresolved", () => {
    expect(route).toContain("casesQuery.isLoading && !casesQuery.data");
    expect(route).toContain("Loading the authoritative investigation queue");
    expect(route).toContain("will not display zero operational cases until the queue has actually loaded");
  });

  it("fails the initial queue load closed and provides an explicit retry", () => {
    expect(route).toContain("casesQuery.error && !casesQuery.data");
    expect(route).toContain('title="Investigation queue unavailable"');
    expect(route).toContain("void casesQuery.refetch()");
    expect(route).toContain("Retry queue");
  });

  it("preserves last known validated cases on background refresh failure but marks them stale", () => {
    expect(route).toContain("casesQuery.error && casesQuery.data");
    expect(route).toContain("Last known queue");
    expect(route).toContain("Automatic investigation refresh failed.");
    expect(route).toContain("The cases below are the last successfully validated snapshot.");
    expect(route).toContain("Retry refresh");
  });

  it("retains bounded refresh behavior and keeps the desk read-only", () => {
    expect(route).toContain("refetchInterval: 120_000");
    expect(route).toContain("refetchIntervalInBackground: false");
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".delete(");
  });

  it("distinguishes a validated empty filter result from authority failure", () => {
    expect(route).toContain("The loaded queue contains no cases matching this filter.");
    expect(route).toContain("No matching cases");
  });

  it("keeps the authenticated integrity desk out of crawler discovery", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
  });
});
