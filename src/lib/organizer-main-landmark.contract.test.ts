import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Organizer main landmark ownership", () => {
  it("keeps AdminFrame as the canonical main for ordinary Organizer routes", () => {
    const frame = source("src/components/admin/AdminFrame.tsx");

    expect(frame).toContain('const childOwnsMainLandmark = pathname.startsWith("/admin/integrity-case/")');
    expect(frame).toContain('const MainContainer = childOwnsMainLandmark ? "div" : "main"');
    expect(frame).toContain('<MainContainer className="admin-page admin-main min-w-0">');
  });

  it("does not nest another main inside Rules Manager", () => {
    const rulesManager = source("src/routes/_authenticated/admin/rules-manager.tsx");

    expect(rulesManager).not.toContain('<main className="min-w-0 space-y-4">');
    expect(rulesManager).toContain(
      '<section aria-label="Rulebook release workspace" className="min-w-0 space-y-4">',
    );
  });

  it("hands landmark ownership to the legacy Integrity Case workspace only on that route", () => {
    const frame = source("src/components/admin/AdminFrame.tsx");
    const integrityCase = source("src/routes/_authenticated/admin/integrity-case.$caseId.tsx");

    expect(frame).toContain('pathname.startsWith("/admin/integrity-case/")');
    expect(integrityCase).toContain('<main className="min-w-0 space-y-4">');
  });
});
