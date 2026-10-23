import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync("src/components/v3/V3JuryShareSheet.tsx", "utf8");
const actions = readFileSync("src/lib/v3-jury-share-actions.ts", "utf8");

describe("V3 Jury Share public UI contract", () => {
  it("keeps the share UI downstream of the canonical JuryShareProjection", () => {
    expect(screen).toContain("projection: JuryShareProjection");
    expect(screen).toContain("projection.publication.shareable");
    expect(screen).toContain("buildDefaultJuryShareModel(projection)");
    expect(screen).toContain("formatJuryShareText(projection)");
    expect(screen).not.toContain("from(\"jury_votes\")");
    expect(screen).not.toContain("from(\"jury_ballot_submissions\")");
    expect(screen).not.toContain("supabase");
    expect(actions).not.toContain("supabase");
  });

  it("implements the JSC-5 mobile share sheet without inventing a new navigation area", () => {
    expect(screen).toContain('side="responsive"');
    expect(screen).toContain("Choose design");
    expect(screen).toContain("Default");
    expect(screen).toContain("Edition");
    expect(screen).toContain("Liquid Glass");
    expect(screen).toContain("Share image");
    expect(screen).toContain("Save PNG");
    expect(screen).toContain("Save JPEG");
    expect(screen).toContain("Copy votes as text");
    expect(screen).not.toContain("Instagram Story");
  });

  it("keeps unavailable publication states visible and fail-closed", () => {
    expect(screen).toContain("Share after results");
    expect(screen).toContain("Ballot not final");
    expect(screen).toContain("Jury vote unavailable");
    expect(screen).toContain("The official jury-vote projection is incomplete or invalid");
    expect(screen).toContain("!canExport");
  });

  it("requires positive file-share capability detection and preserves a download fallback", () => {
    expect(actions).toContain('typeof navigatorLike.share !== "function"');
    expect(actions).toContain('typeof navigatorLike.canShare !== "function"');
    expect(actions).toContain("navigatorLike.canShare({ files: [file] })");
    expect(actions).toContain('return "download_fallback"');
    expect(screen).toContain("downloadJuryShareFile");
  });

  it("uses the canonical Story geometry and keeps the textual ballot accessible", () => {
    expect(screen).toContain('Story · 1080 × 1920 · 9:16');
    expect(screen).toContain('aspect-[9/16]');
    expect(screen).toContain('role="radiogroup"');
    expect(screen).toContain('role="radio"');
    expect(screen).toContain('aria-checked={selected}');
    expect(screen).toContain("formatJuryShareText");
  });

  it("does not fake image export before the server renderer is connected", () => {
    expect(screen).toContain("requestFile?: (request: JuryShareExportRequest) => Promise<File>");
    expect(screen).toContain("Image export stays disabled until Solaris can revalidate");
    expect(screen).toContain("Official preview pending");
    expect(screen).toContain("Solaris will not fake it with a browser-only approximation");
    expect(screen).not.toContain("canvas.toDataURL");
    expect(screen).not.toContain("html2canvas");
  });
});
