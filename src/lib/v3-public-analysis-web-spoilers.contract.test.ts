import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public Results analysis spoiler safety across browser presentations", () => {
  it("reuses shared Results preference resolution and a viewer/show scoped reveal", () => {
    const boundary = read("src/components/public/PublicResultsAnalysisSpoilerBoundary.tsx");

    expect(boundary).toContain("useFanSession()");
    expect(boundary).toContain("useNotificationPreferences(viewerId ?? undefined)");
    expect(boundary).toContain("resolveV3ResultsSpoilerProtection({");
    expect(boundary).toContain("viewerResolved: session.isSuccess");
    expect(boundary).toContain("serverPending: notificationPreferences.isPending");
    expect(boundary).toContain("serverError: notificationPreferences.isError");
    expect(boundary).toContain("resolveV3ResultsAnalysisReveal({");
    expect(boundary).toContain("selectedShowId,");
    expect(boundary).toContain("viewerId,");
  });

  it("conditionally renders an editorial placeholder rather than a hidden spoiler DOM", () => {
    const boundary = read("src/components/public/PublicResultsAnalysisSpoilerBoundary.tsx");
    expect(boundary).toContain("if (!gate.protected) return <>{children}</>");
    expect(boundary).toContain('data-v3-public-analysis-web-spoiler-protected=""');
    expect(boundary).toContain("Reveal this replay");
    expect(boundary).toContain("Reveal this simulation");
    expect(boundary).toContain("min-h-11");
    expect(boundary).not.toContain("display: none");
    // Session/pref transitions may swap the inner screen, not the whole
    // AppShell/keyboard focus tree.
    expect(boundary).not.toContain("<AppShell>");
    expect(boundary).not.toContain("localStorage");
  });

  for (const [route, title] of [
    ["src/routes/result-lab/index.tsx", "Result Lab"],
    ["src/routes/broadcast-intelligence/index.tsx", "Broadcast Intelligence"],
  ] as const) {
    it(`protects the real ${title} browser route while preserving installed mode`, () => {
      const source = read(route);
      expect(source).toContain("return <Legacy");
      expect(source).toContain("isAppMode");
      expect(source).toContain(
        `<PublicResultsAnalysisSpoilerBoundary selectedShowId={selectedShow?.id ?? null} title="${title}">`,
      );
      expect(source).toContain("</PublicResultsAnalysisSpoilerBoundary>");
      const stableShell = source.lastIndexOf("<AppShell>");
      const protectedContent = source.lastIndexOf("<PublicResultsAnalysisSpoilerBoundary");
      const shellClosing = source.lastIndexOf("</AppShell>");
      const protectionClosing = source.lastIndexOf("</PublicResultsAnalysisSpoilerBoundary>");
      expect(stableShell).toBeGreaterThan(-1);
      expect(protectedContent).toBeGreaterThan(stableShell);
      expect(protectionClosing).toBeLessThan(shellClosing);
      expect(source).not.toContain("isAppMode = window.innerWidth");
    });
  }
});
