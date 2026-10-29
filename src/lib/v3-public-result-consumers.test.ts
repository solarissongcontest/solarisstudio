import { describe, expect, it } from "vitest";
import { loadCurrentV3ExploreBundle } from "@/integrations/v3/explore-source.server";
import { loadV3ResultsBundle } from "@/integrations/v3/results-source.server";
import { loadV3ResultLabBundle } from "@/integrations/v3/result-lab-source.server";
import { loadV3BroadcastIntelligenceBundle } from "@/integrations/v3/broadcast-intelligence-source.server";
import { loadV3EditionBundle } from "@/integrations/v3/edition-source.server";
import { loadV3ScorechartsBundle } from "@/integrations/v3/scorecharts-source.server";
import { loadV3RecordsBundle } from "@/integrations/v3/records-source.server";
import { loadV3RelationshipsIndexBundle, loadV3RelationshipDetailBundle } from "@/integrations/v3/relationships-source.server";

const edition = { id: "edition", name: "Published edition", year: 2026, slug: "ssc-22", edition_number: 22, status: "archived", published: true };
const show = { id: "show", edition_id: edition.id, name: "Published final", kind: "final", sort_order: 1, status: "complete", published: true, qualifier_count: null, publication_config: { participants: true, artists: true, songs: true, qualifiers: true, results: true, jury_results: true, televote_results: true, detailed_voting: true }, voting_config: {}, broadcast_config: {} };
const countries = ["A", "B"].map((id) => ({ id, name: `Country ${id}`, short_code: id, flag_image: null, accent_color: "#123456", native_name: null, region: "Solaris", description: null, first_participation: null }));
function fixture(snapshotsVisible = true, componentsPublic = true, withdrawn = false) {
  const calls: string[] = [];
  const participants = countries.map((country, i) => ({ id: `participant-${country.id}`, edition_id: edition.id, show_id: show.id, country_id: country.id, contest_entity_id: null, artist: `Artist ${country.id}`, song: `Song ${country.id}`, qualified: true, running_order: i + 1, publication_status: "published", participation_status: withdrawn ? "withdrawn" : "confirmed" }));
  const snapshot = { schemaVersion: 1, publicationState: "public", publicationVersion: 4, resultVersion: 2, show: { id: show.id, editionId: edition.id }, edition: { id: edition.id }, availability: { results: true, jury: componentsPublic, televote: componentsPublic, detailedVoting: componentsPublic }, rowCount: 2, rows: countries.map((country, i) => ({ countryId: country.id, contestEntityId: null, finalRank: i + 1, totalPoints: 22 - i, juryPoints: 12, televotePoints: 10 - i })) };
  const tables: Record<string, unknown[]> = { editions: [edition], shows: [show], countries, contest_entities: [], participants, jury_votes: [], televote_votes: [], voters: [] };
  const client = {
    from(table: string): any {
      calls.push(table);
      if (table === "results") throw new Error("Mutable Results must never be read: live total999 differs from published22");
      const query = { select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, not() { return query; }, range() { return query; }, limit() { return query; }, maybeSingle: async () => ({ data: tables[table]?.[0] ?? null, error: null }), then(resolve: (result: unknown) => unknown) { return Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve); } };
      return query;
    },
    async rpc(name: string, args?: Record<string, unknown>) {
      calls.push(name);
      if (name === "v3_public_published_result_snapshots") {
        const { rows, ...metadata } = snapshot;
        return { data: snapshotsVisible ? [args?.p_include_rows === false
          ? { ...metadata, winners: rows.filter((row) => row.finalRank === 1) } : snapshot] : [], error: null };
      }
      if (name === "v3_public_explore_counts") return { data: { countries: 2, entries: 2, shows: 1, stories: 0 }, error: null };
      if (name === "public_safe_participants") return { data: participants, error: null };
      if (name === "studio2_public_storyline") return { data: null, error: null };
      throw new Error(`Unexpected public RPC ${name}`);
    },
  };
  return { client, calls };
}

describe("all Public result consumers use exact immutable Publication truth", () => {
  it("Results, Edition, Result Lab and Broadcast use published22 rather than mutable999", async () => {
    const { client, calls } = fixture();
    const results = await loadV3ResultsBundle("show", client);
    expect(results.input.rows[0].points).toBe(22);
    const page = await loadV3EditionBundle({ slug: edition.slug }, client);
    expect(page?.projection.results.rows[0].totalPoints).toBe(22);
    const lab = await loadV3ResultLabBundle("show", client);
    expect(lab.officialEntries[0]).toMatchObject({ juryPoints: 12, televotePoints: 10, officialRank: 1 });
    const broadcast = await loadV3BroadcastIntelligenceBundle("show", client);
    expect(broadcast.entries[0].totalPoints).toBe(22);
    expect(calls.filter((call) => call === "v3_public_published_result_snapshots")).toHaveLength(7);
    expect(calls).not.toContain("results");
  });
  it("Explore winner discovery consumes only immutable header winners, not current Results", async () => {
    const { client, calls } = fixture();
    const bundle = await loadCurrentV3ExploreBundle(client);
    expect(bundle.projection.archive.editions.length).toBeGreaterThan(0);
    expect(calls).not.toContain("results");
    expect(calls).toContain("v3_public_published_result_snapshots");
  });
  it("rejects publication/version drift between narrow discovery and the selected full read", async () => {
    for (const load of [loadV3ResultsBundle, loadV3ResultLabBundle, loadV3BroadcastIntelligenceBundle]) {
      const { client } = fixture();
      const original = client.rpc.bind(client);
      const changed = { ...client, async rpc(name: string, args?: Record<string, unknown>) {
        const result = await original(name,args);
        if (name === "v3_public_published_result_snapshots" && args?.p_include_rows === true && Array.isArray(result.data)) {
          return { ...result, data: result.data.map((row) => ({ ...row, resultVersion: 3 })) };
        }
        return result;
      } };
      await expect(load("show",changed)).rejects.toThrow("Published results changed during this read");
    }
  });
  it("Records and Relationships use the same bounded exact-version transport", async () => {
    const { client, calls } = fixture();
    const records = await loadV3RecordsBundle(client);
    expect(records.archivedFinalEditions).toBe(1);
    expect(records.records.some((record) => record.holders.some((holder) => holder.countryId === "A"))).toBe(true);
    const relationships = await loadV3RelationshipsIndexBundle(client);
    expect(relationships.pairs).toHaveLength(1);
    expect(calls.filter((call) => call === "v3_public_published_result_snapshots")).toHaveLength(2);
    expect((await loadV3ScorechartsBundle(client)).items).toHaveLength(1);
    expect(calls).not.toContain("results");
  });
  it("missing current immutable publication never falls back to current Results", async () => {
    const { client, calls } = fixture(false);
    expect((await loadV3ResultsBundle("show", client)).input.publication).toBe("hidden");
    expect((await loadV3ResultLabBundle("show", client)).officialEntries).toEqual([]);
    expect((await loadV3BroadcastIntelligenceBundle("show", client)).entries).toEqual([]);
    expect((await loadV3EditionBundle({ slug: edition.slug }, client))?.projection.results.rows).toEqual([]);
    const records = await loadV3RecordsBundle(client);
    expect(records.archivedFinalEditions).toBe(0);
    expect(records.resultCoverage).toEqual({ includedShows: 0, unavailableShows: 1 });
    const charts = await loadV3ScorechartsBundle(client);
    expect(charts.items).toEqual([]);
    expect(charts.resultCoverage).toEqual({ includedShows: 0, unavailableShows: 1 });
    expect((await loadV3RelationshipsIndexBundle(client)).resultCoverage).toEqual({ includedShows: 0, unavailableShows: 1 });
    expect((await loadV3ResultsBundle("show", client)).resultCoverage).toEqual({ includedShows: 0, unavailableShows: 1 });
    expect(calls).not.toContain("results");
  });
  it("later current-lineup withdrawal does not rewrite an immutable published version", async () => {
    const { client } = fixture(true, true, true);
    expect((await loadV3ResultsBundle("show", client)).input.rows).toHaveLength(2);
    expect((await loadV3ResultLabBundle("show", client)).officialEntries).toHaveLength(2);
    expect((await loadV3BroadcastIntelligenceBundle("show", client)).entries).toHaveLength(2);
    expect((await loadV3EditionBundle({ slug: edition.slug }, client))?.projection.results.rows).toHaveLength(2);
    expect((await loadV3RecordsBundle(client)).archivedFinalEditions).toBe(1);
    const detail = await loadV3RelationshipDetailBundle("A-VS-B", client);
    expect(detail?.headToHead.rows[0]).toMatchObject({ aRank: 1, bRank: 2 });
  });
  it("overall-only publication does not invent zero-score component records", async () => {
    const { client } = fixture(true, false);
    const results = await loadV3ResultsBundle("show", client);
    expect(results.input.rows[0]).toMatchObject({ points: 22, juryPoints: null, televotePoints: null });
    const records = (await loadV3RecordsBundle(client)).records;
    expect(records.find((record) => record.id === "highest-score")?.value).toBe("22 pts");
    for (const id of ["highest-jury", "highest-tele", "jury-winner-low", "tele-winner-low", "jury-tele-gap"]) expect(records.some((record) => record.id === id)).toBe(false);
    expect((await loadV3ResultLabBundle("show", client)).officialEntries).toEqual([]);
    expect((await loadV3BroadcastIntelligenceBundle("show", client)).entries).toEqual([]);
  });

});
