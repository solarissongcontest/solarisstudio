import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  snapshot: null as any,
  tables: {} as Record<string, unknown[]>,
  reads: [] as string[],
}));
vi.mock("@/integrations/confirmations/public-runtime.server", () => ({
  createConfirmationPublicRuntimeClient: () => ({
    from: (table: string) => {
      fixture.reads.push(table);
      if (table === "results" || table === "participants")
        throw Error("Mutable official rows must never be read");
      const q: any = {};
      for (const key of ["select", "eq", "order", "in"]) q[key] = () => q;
      q.then = (resolve: (x: unknown) => void) =>
        Promise.resolve({ data: fixture.tables[table] ?? [], error: null }).then(resolve);
      return q;
    },
  }),
}));
vi.mock("@/integrations/v3/public-result-snapshot.server", () => ({
  loadV3PublishedResultSnapshot: vi.fn(async () => fixture.snapshot),
}));
import { loadV3ResultsBundle } from "@/integrations/v3/results-source.server";
import { loadV3ScoreboardBundle } from "@/integrations/v3/scoreboard-source.server";
const edition = "11111111-1111-4111-8111-111111111111",
  show = "22222222-2222-4222-8222-222222222222",
  country = "33333333-3333-4333-8333-333333333333";
beforeEach(() => {
  fixture.reads = [];
  fixture.tables = {
    editions: [{ id: edition, slug: "ssc-22", edition_number: 22, name: "SSC", published: true }],
    shows: [
      {
        id: show,
        edition_id: edition,
        name: "Current renamed show",
        kind: "grand-final",
        sort_order: 1,
        status: "completed",
        published: true,
        publication_config: { results: true, jury_results: true, televote_results: true },
      },
    ],
    countries: [
      {
        id: country,
        name: "Frozen entry",
        short_code: "FE",
        flag_image: null,
        native_name: null,
        region: "Solaris",
        accent_color: "#fff",
        description: null,
        first_participation: null,
      },
    ],
    contest_entities: [],
  };
  fixture.snapshot = {
    resultVersion: 2,
    show: { id: show, name: "Published Grand Final", editionId: edition },
    edition: { id: edition },
    availability: { results: true, jury: false, televote: false, detailedVoting: false },
    rows: [{ countryId: country, contestEntityId: null, totalPoints: 312, finalRank: 1 }],
  };
});
describe("immutable Public Results consumers", () => {
  for (const state of ["unpublished", "unversioned", "missing snapshot"])
    it("fails closed for " + state, async () => {
      fixture.snapshot = null;
      const root = await loadV3ResultsBundle(show),
        scoreboard = await loadV3ScoreboardBundle(show);
      expect(root.input.publication).toBe("hidden");
      expect(root.input.rows).toEqual([]);
      expect(scoreboard.publication).toBe("hidden");
      expect(scoreboard.standings).toEqual([]);
      expect(fixture.reads).not.toContain("results");
      expect(fixture.reads).not.toContain("participants");
    });
  it("uses frozen totals/ranks/name despite changed live metadata, with hidden splits left null", async () => {
    const root = await loadV3ResultsBundle(show);
    expect(root.input.showName).toBe("Published Grand Final");
    expect(root.input.rows[0]).toMatchObject({
      rank: 1,
      points: 312,
      juryPoints: null,
      televotePoints: null,
      canonicalCountryId: country,
    });
    expect(root.input.juryPublished).toBe(false);
    expect(root.input.televotePublished).toBe(false);
    expect((await loadV3ScoreboardBundle(show)).standings).toEqual([
      { countryId: country, total: 312, rank: 1 },
    ]);
  });
  it("does not silently select another show for an unknown deep link", async () => {
    const root = await loadV3ResultsBundle("44444444-4444-4444-8444-444444444444");
    expect(root.input.rows).toEqual([]);
    expect(root.input.publication).toBe("hidden");
  });
  it("discloses only the published split", async () => {
    fixture.snapshot.availability.jury = true;
    fixture.snapshot.rows[0].juryPoints = 160;
    const root = await loadV3ResultsBundle(show);
    expect(root.input.rows[0]).toMatchObject({ juryPoints: 160, televotePoints: null });
    expect(root.input.juryPublished).toBe(true);
    expect(root.input.televotePublished).toBe(false);
  });
  it("keeps the exact frozen result for archived metadata and follows a newly bound published version", async () => {
    (fixture.tables.shows[0] as any).status = "archived";
    expect((await loadV3ResultsBundle(show)).input.rows[0].points).toBe(312);
    fixture.snapshot.resultVersion = 3;
    fixture.snapshot.rows[0].totalPoints = 320;
    expect((await loadV3ResultsBundle(show)).input.rows[0].points).toBe(320);
  });
  it("rejects an edition mismatch and unresolved immutable identity", async () => {
    fixture.snapshot.edition.id = "wrong-edition";
    await expect(loadV3ResultsBundle(show)).rejects.toThrow("escaped");
    fixture.snapshot.edition.id = edition;
    fixture.tables.countries = [];
    await expect(loadV3ResultsBundle(show)).rejects.toThrow("identity");
  });
});
