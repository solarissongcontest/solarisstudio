import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const palette = readFileSync(
  resolve(process.cwd(), "src/components/public/PublicCommandPalette.tsx"),
  "utf8",
);

const app = palette.slice(
  palette.indexOf("function AppPublicPaletteDialog"),
  palette.indexOf("function WebPublicPaletteDialog"),
);
const web = palette.slice(
  palette.indexOf("function WebSearchArchiveResults"),
  palette.indexOf("function renderSearchGroups"),
);

describe("V3 global Search relevance integration", () => {
  it("ranks both app and web results before applying the 50-result budget", () => {
    expect(app).toContain("rankV3PublicSearchResults(dedupePublicSearchResults([...local, ...remoteResults]), normalized).slice(0, 50)");
    expect(web).toContain("rankV3PublicSearchResults(dedupePublicSearchResults(values), normalized).slice(0, 50)");
  });

  it("uses typo-aware matching only on existing source records and navigation results", () => {
    expect(palette).toContain("matchesV3PublicSearch");
    expect(app).toContain("matchesV3PublicSearch(normalized");
    expect(web).toContain("matchesV3PublicSearch(");
    expect(web).toContain("publicSearchPublicationScope(editions, shows)");
    expect(web).toContain("usePublicSearchParticipants()");
    expect(web).not.toContain("useAllParticipants()");
  });

  it("retains server RPC authority and request-budget protection", () => {
    expect(app).toContain('rpc("solaris_public_search"');
    expect(app).toContain("result_limit: 30");
    expect(app).toContain("retry: false");
    expect(web).toContain("storiesQuery.isError ? [] : storiesQuery.data ?? []");
    expect(palette).toContain("{normalized.length >= 2 ? (");
  });

  it("preserves canonical destinations and visible-result click telemetry", () => {
    expect(app).toContain("trackPublicUxEvent(\"search_result_clicked\"");
    expect(web).toContain("trackPublicUxEvent(\"search_result_clicked\"");
    expect(web).toContain('group: "Entries"');
    expect(web).toContain('group: "Stories"');
    expect(web).toContain('group: "Records"');
  });
});
