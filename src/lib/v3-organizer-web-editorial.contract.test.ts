import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Organizer web contextual navigation", () => {
  it("keeps edition-context and workflow tabs navigable at narrow browser widths", () => {
    const nav = read("src/components/admin/AdminSectionNav.tsx");
    const css = read("src/styles/v3-organizer-editorial-shell.css");

    expect(nav).toContain('data-organizer-context-tabrow=""');
    expect(nav).toContain('data-organizer-tab-density={compact ? "workflow" : "section"}');
    expect(nav).toContain('data-organizer-workflow-tabs=""');
    expect(nav).toContain('aria-current={active ? "page" : undefined}');
    expect(css).toContain("@media (max-width: 719px)");
    expect(css).toContain("flex-wrap: nowrap");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("white-space: nowrap");
  });

  it("does not replace installed V3 or legacy Organizer navigation", () => {
    const shell = read("src/components/admin/AdminShell.tsx");
    const css = read("src/styles/v3-organizer-editorial-shell.css");

    expect(shell).toContain("OrganizerV3MobileChrome");
    expect(shell).toContain("OrganizerV6MobileChrome");
    expect(shell).toContain("data-organizer-edition-scope={scope}");
    expect(shell).toContain('import "@/styles/v3-organizer-editorial-shell.css"');
    expect(css).toContain("html:not([data-solaris-app]) .admin-control-room");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps the contextual edition label visible while removing redundant decoration", () => {
    const shell = read("src/components/admin/AdminShell.tsx");
    const nav = read("src/components/admin/AdminNav.tsx");
    expect(shell).toContain("data-organizer-context-lock");
    expect(shell).toContain('{editionLabel ?? "Selected edition"}');
    expect(nav).toContain("All Organizer tools");
    expect(nav).not.toContain("Core workflows are visible in their workspaces");
  });
});
