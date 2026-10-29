import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/integrations/v3/explore-source.server.ts"),
    "utf8",
  );

describe("V3 Explore combined archive and chronology source", () => {
  it("rejects an archived resolver fallback as the current edition", () => {
    const text = source();
    expect(text).toContain("const resolvedCurrentEdition = resolveCurrentPublicEdition(editions)");
    expect(text).toContain(
      'normalizeLegacyEditionStatus(resolvedCurrentEdition.status) !== "archived"',
    );
    expect(text).toContain("currentEditionId: currentEdition?.id ?? null");
  });

  it("loads bounded public result evidence across published editions", () => {
    const text = source();
    expect(text).toContain("const publishedEditionIds = editions.map");
    expect(text).toContain('.in("edition_id", publishedEditionIds)');
    expect(text).toContain('.eq("published", true)');
    expect(text).toContain("await loadPublicResultSnapshotHeaders(client,");
    expect(text).toContain("snapshot.winners");
    expect(text).not.toContain('.from("results")');
    expect(text).toContain("resultsPublished: finalResultsPublished(editionShows, editionWinners)");
    expect(text).toContain('resultsPublication: resultsPublished ? "published" : "hidden"');
    expect(text).not.toContain('.from("participants")');
    expect(text).not.toContain("jury_votes");
    expect(text).not.toContain("televotes");
  });

  it("uses canonical scheduledStart and one server timestamp for the current event", () => {
    const text = source();
    expect(text).toContain("publication_config,broadcast_config");
    expect(text).toContain("const generatedAt = new Date().toISOString()");
    expect(text).toContain(
      "currentNextEvent = resolveV3ExploreNextPublicEvent(currentShows, generatedAt)",
    );
    expect(text).toContain("nextEvent: isCurrent ? currentNextEvent : null");
  });

  it("does not create browser chronology or browser publication authority", () => {
    const text = source();
    expect(text).not.toContain("Date.now()");
    expect(text).not.toContain("window.");
    expect(text).not.toContain("localStorage");
    expect(text).not.toContain("sessionStorage");
  });
});
