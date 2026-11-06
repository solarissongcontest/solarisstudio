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
    expect(boundary).not.toContain("localStorage");
    // The route owns a stable shell through preference and account changes.
    expect(boundary).not.toContain("<AppShell>");
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
      const shellStart = source.lastIndexOf("<AppShell>");
      const guardStart = source.lastIndexOf("<PublicResultsAnalysisSpoilerBoundary");
      const guardEnd = source.lastIndexOf("</PublicResultsAnalysisSpoilerBoundary>");
      const shellEnd = source.lastIndexOf("</AppShell>");
      expect(shellStart).toBeGreaterThan(-1);
      expect(guardStart).toBeGreaterThan(shellStart);
      expect(guardEnd).toBeGreaterThan(guardStart);
      expect(shellEnd).toBeGreaterThan(guardEnd);
      expect(source).not.toContain("isAppMode = window.innerWidth");
    });
  }
});
