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
    expect(palette).toContain("buildAdminNavigation");
    expect(palette).toContain("buildAdminNavigation(activeEdition?.slug).flatMap");
  });

  it("labels public rule and integrity results as public references", () => {
    expect(palette).toContain('source: "public-reference"');
    expect(palette).toContain('item.source === "public-reference" ? " · Public reference" : ""');
    expect(palette).toContain('Search Solaris, rules, cases or tools…');
  });
});
