import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { sanitizeRuleContextPath } from "./rule-context";

const route = () => readFileSync(resolve(process.cwd(), "src/routes/library.tsx"), "utf8");

describe("Public V3 legacy Library classification", () => {
  it("routes generic Library bookmarks to the canonical discovery directory", () => {
    const source = route();

    expect(source).toContain('to: search.from ? "/rules" : "/site-directory"');
    expect(source).toContain("generic Solaris destination discovery -> Site Directory");
  });

  it("preserves old contextual rule-help intent without accepting arbitrary paths", () => {
    const source = route();

    expect(source).toContain("sanitizeRuleContextPath(search.from)");
    expect(source).toContain("contextual rule / interpretation help -> Rules");
    expect(sanitizeRuleContextPath("/confirmations")).toBe("/confirmations");
    expect(sanitizeRuleContextPath("/jury-voting")).toBe("/jury-voting");
    expect(sanitizeRuleContextPath("/totally-unrelated/private/path")).toBeUndefined();
  });

  it("does not recreate Library as another V3 product area", () => {
    const source = route();

    expect(source).not.toContain("component:");
    expect(source).not.toContain("LibraryPage");
    expect(source).toContain("Keep the old URL working without preserving Library as a competing product");
  });
});
