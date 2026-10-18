import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("critical route recovery chrome", () => {
  it("keeps canonical critical error/not-found recovery out of generic AppShell chrome", () => {
    const frame = source("src/components/app/AppRouteStateFrame.tsx");
    expect(frame).toContain(
      "resolveSolarisAppScreen(pathname, searchStr).behavior.criticalTask",
    );
    expect(frame).toContain("shouldOwnCriticalRouteStateFrame(pathname, searchStr)");
    expect(frame).toContain('data-v3-critical-route-state={screen.id}');
    expect(frame).toContain('data-solaris-app-critical-task="true"');
    expect(frame.indexOf("if (shouldOwnCriticalRouteStateFrame")).toBeLessThan(
      frame.indexOf("<AppShell>"),
    );
  });

  it("keeps Organizer and service-admin recovery outside participant focused ownership", () => {
    const frame = source("src/components/app/AppRouteStateFrame.tsx");
    expect(frame).toContain('pathname === "/admin"');
    expect(frame).toContain('pathname.startsWith("/admin/")');
    expect(frame).toContain('pathname.startsWith("/confirmations/admin")');
    expect(frame).toContain('pathname.startsWith("/televoting/admin")');
  });

  it("does not reintroduce a handwritten participant critical-route allowlist", () => {
    const frame = source("src/components/app/AppRouteStateFrame.tsx");
    expect(frame).not.toContain("confirmations|jury-voting|televoting|next-in-line");
  });
});
