import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const primitives = () => readFileSync(resolve(process.cwd(), "src/components/admin/AdminWorkspacePrimitives.tsx"), "utf8");
const style = () => readFileSync(resolve(process.cwd(), "src/styles/v3-organizer-workspaces-editorial.css"), "utf8");

describe("Organizer browser workspace layout", () => {
  it("keeps every workflow tab readable and keyboard navigable at narrow widths", () => {
    const code = primitives();
    const css = style();
    expect(code).toContain('className={cn("admin-editorial-workspace-tabs flex gap-1 overflow-x-auto", className)}');
    expect(code).toContain("aria-label={label}");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("flex-wrap: nowrap");
    expect(css).toContain("white-space: nowrap");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain(":focus-visible");
  });

  it("removes redundant filter chrome without affecting control semantics", () => {
    const code = primitives();
    expect(code).toContain('AdminCard className={cn("admin-editorial-filterbar min-w-0", className)}');
    expect(code).toContain("WorkspaceActionBar");
    expect(code).toContain('data-admin-action-layer="task"');
    expect(code).toContain("admin-editorial-workqueue");
    expect(code).toContain("admin-editorial-metric-strip");
    expect(style()).toContain("border-bottom: 1px solid var(--admin-border)");
  });

  it("does not style installed PWA or touch operational gates", () => {
    const code = primitives();
    const css = style();
    expect(code).toContain('import "@/styles/v3-organizer-workspaces-editorial.css"');
    expect(css).toContain("html:not([data-solaris-app]) .admin-control-room");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");
    expect(code).not.toContain("supabase");
    expect(code).not.toContain("useMutation");
  });
});
