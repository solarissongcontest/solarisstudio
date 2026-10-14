import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const context = readFileSync("src/components/admin/AdminContext.tsx", "utf8");
const projection = readFileSync("src/lib/v3-organizer-projection.ts", "utf8");
const selector = readFileSync("src/components/admin/AdminSelectors.tsx", "utf8");
const shell = readFileSync("src/components/admin/AdminShell.tsx", "utf8");

describe("V3 OrganizerContext shell contract", () => {
  it("exposes the canonical context shape without breaking legacy editionId consumers", () => {
    expect(context).toContain('import type { OrganizerContext } from "@/lib/v3-organizer-projection"');
    expect(projection).toContain("export type OrganizerContext");
    expect(context).toContain("editionSlug: state.editionSlug");
    expect(context).toContain("editionLabel: state.editionLabel");
    expect(context).toContain("showId: state.showId");
    expect(context).toContain("showLabel: state.showLabel");
    expect(context).toContain('mode: "organizer"');
    expect(context).toContain("contextVersion: state.contextVersion");
    expect(context).toContain("setEditionId: (id: string) => void");
  });

  it("makes the shell edition selector establish canonical edition identity", () => {
    expect(selector).toContain("setEditionContext");
    expect(selector).toContain("slug: activeEdition.slug");
    expect(selector).toContain("label");
    expect(selector).not.toContain("setEditionId(nextEdition.id)");
  });

  it("clears stale show scope when edition changes and visibly locks context", () => {
    expect(context).toContain("showId: editionChanged ? null : current.showId");
    expect(context).toContain("showLabel: editionChanged ? null : current.showLabel");
    expect(shell).toContain('data-organizer-context-lock=""');
    expect(shell).toContain("data-organizer-context-version={contextVersion}");
    expect(shell).toContain('key={`${scope}:${contextVersion}`}');
  });

  it("increments contextVersion for scope changes, not same-edition metadata hydration", () => {
    expect(context).toContain(
      "contextVersion: editionChanged ? current.contextVersion + 1 : current.contextVersion",
    );
    expect(context).toMatch(/setShowContext[\s\S]*contextVersion: current\.contextVersion \+ 1/);
  });
});
