import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const palette = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminCommandPalette.tsx"),
  "utf8",
);

describe("organizer search governance integration", () => {
  it("uses the shared public governance Library provider", () => {
    expect(palette).toContain('searchGovernanceLibrary');
    expect(palette).toContain('from "@/lib/public-library-governance"');
  });

  it("keeps specialist governance workspaces searchable instead of relying only on sidebar buttons", () => {
    expect(palette).toContain('"Integrity investigations", "/admin/integrity-investigations"');
    expect(palette).toContain('"Integrity appeals", "/admin/integrity-appeals"');
    expect(palette).toContain('"Evidence lifecycle", "/admin/integrity-evidence"');
    expect(palette).toContain('"Identity access", "/admin/integrity-identity"');
    expect(palette).toContain('"Rules manager", "/admin/rules-manager"');
    expect(palette).toContain('"Official interpretations", "/admin/rule-interpretations"');
  });

  it("labels public rule and integrity results as Library results", () => {
    expect(palette).toContain('item.source === "library" ? " · Library" : ""');
    expect(palette).toContain('Search Solaris, rules, cases or tools…');
  });
});
