import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const offlineShell = readFileSync("public/offline.html", "utf8");

describe("offline shell canonical root mapping", () => {
  it("keeps participant routes grouped and renders Rules and authentication offline states", () => {
    for (const path of ["/my-solaris/entry", "/my-solaris/tasks", "/my-solaris/voting", "/confirmations", "/jury-voting", "/televoting"]) {
      expect(offlineShell).toContain(`path.startsWith("${path}")`);
    }
    expect(offlineShell).toContain('path.startsWith("/rules") ? "rules"');
    expect(offlineShell).toContain('path.startsWith("/auth") ? "auth"');
  });

  it("does not expose retired results, me or archive views through restored offline navigation", () => {
    expect(offlineShell).not.toContain('href="/results" data-tab="results"');
    expect(offlineShell).not.toContain('href="/me" data-tab="me"');
    expect(offlineShell).not.toContain('href="/explore" data-tab="explore"');
    expect(offlineShell).toContain('const initialView =');
    expect(offlineShell).toContain('"home";');
  });

  it("rejects protocol-relative and backslash paths from saved offline navigation", () => {
    // Cached public rows now pass through a strict display-time allowlist.
    // The old two prefix checks were insufficient for private/encoded paths.
    expect(offlineShell).toContain('candidate.startsWith("//")');
    expect(offlineShell).toContain('decoded.includes("\\\\")');
    expect(offlineShell).toContain('!isSafeOfflinePublicPath(item.path)');
    expect(offlineShell).toContain('return OFFLINE_PUBLIC_DETAILS.some((pattern) => pattern.test(candidate))');
  });
});
