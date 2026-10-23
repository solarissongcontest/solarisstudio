import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPORT_ROUTE_FILES = [
  "src/routes/integrity/report/category.tsx",
  "src/routes/integrity/report/privacy.tsx",
  "src/routes/integrity/report/details.tsx",
  "src/routes/integrity/report/support.tsx",
  "src/routes/integrity/report/review.tsx",
  "src/routes/integrity/report/receipt.tsx",
] as const;

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Integrity report route privacy", () => {
  it("keeps every sensitive report step noindex and nofollow", () => {
    for (const path of REPORT_ROUTE_FILES) {
      const route = source(path);
      expect(route, path).toContain('{ name: "robots", content: "noindex, nofollow" }');
      expect(route, path).not.toContain('{ name: "robots", content: "noindex" }');
    }
  });

  it("covers the review and receipt surfaces explicitly", () => {
    expect(REPORT_ROUTE_FILES).toContain("src/routes/integrity/report/review.tsx");
    expect(REPORT_ROUTE_FILES).toContain("src/routes/integrity/report/receipt.tsx");
  });

  it("does not turn crawler metadata into workflow authority", () => {
    for (const path of REPORT_ROUTE_FILES) {
      const route = source(path);
      expect(route, path).not.toContain("supabase.from(");
      expect(route, path).not.toContain("createClient(");
    }
  });
});
