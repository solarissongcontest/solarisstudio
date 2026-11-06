import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const offlineShell = readFileSync("public/offline.html", "utf8");

describe("offline shell canonical root mapping", () => {
  it("keeps critical participant routes under Participate while offline", () => {
    expect(offlineShell).toContain('path.startsWith("/my-solaris/entry")');
    expect(offlineShell).toContain('path.startsWith("/integrity/report") ? "participate"');

    const entryIndex = offlineShell.indexOf('path.startsWith("/my-solaris/entry")');
    const genericMySolarisIndex = offlineShell.indexOf('path.startsWith("/my-solaris") ||');
    expect(entryIndex).toBeGreaterThanOrEqual(0);
    expect(genericMySolarisIndex).toBeGreaterThan(entryIndex);
  });

  it("maps Televoting Results to Results before the broader Televoting task route", () => {
    const resultsIndex = offlineShell.indexOf('path === "/televoting/results"');
    const televotingIndex = offlineShell.indexOf('path.startsWith("/televoting")');

    expect(resultsIndex).toBeGreaterThanOrEqual(0);
    expect(televotingIndex).toBeGreaterThan(resultsIndex);
    expect(offlineShell).toContain('path === "/televoting/results" || path === "/televoting/results/" ? "results"');
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
