import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { Country, Edition, Participant, ResultRow, Show } from "./data";
import { canonicalEditionEntries, listenLinksFrom } from "./entry-utils";
import { buildFanRecords } from "./fan-records";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const countries = [
  { id: "a", name: "Aland", native_name: null, short_code: "ALA", flag_image: null, region: "North", accent_color: "#123456", description: null, first_participation: null },
  { id: "b", name: "Belor", native_name: null, short_code: "BEL", flag_image: null, region: "North", accent_color: "#654321", description: null, first_participation: null },
] as Country[];

const edition = { id: "e1", edition_number: 1, name: "SSC 1", year: 2026, slug: "ssc-1", description: null, host_country_id: null, host_city: null, logo: null, theme_id: null, status: "completed", published: true } as Edition;
const finalShow = { id: "final", edition_id: "e1", name: "Grand Final", kind: "grand-final", sort_order: 2, published: true, status: "done", qualifier_count: null, theme_id: null, voting_config: {}, broadcast_config: {}, publication_config: null } as Show;
const semiShow = { ...finalShow, id: "semi", name: "Semi", kind: "semi-final", sort_order: 1 } as Show;

function participant(id: string, countryId: string, showId: string | null, artist: string, song: string): Participant {
  return {
    id,
    edition_id: "e1",
    show_id: showId,
    country_id: countryId,
    contest_entity_id: null,
    artist,
    song,
    running_order: null,
    semi_final: "",
    qualified: showId === "semi" ? true : null,
    notes: null,
    youtube_url: showId == null ? "https://youtube.com/watch?v=test" : null,
    spotify_url: null,
    apple_music_url: null,
  } as Participant;
}

function result(id: string, countryId: string): ResultRow {
  return {
    id,
    edition_id: "e1",
    show_id: "final",
    country_id: countryId,
    jury_points: 50,
    televote_points: 50,
    total_points: 100,
    final_rank: 1,
  };
}

describe("beta-informed fan discovery", () => {
  it("keeps one canonical entry when the same song appears in a semi and final", () => {
    const rows = [
      participant("semi-a", "a", "semi", "Artist", "Song"),
      participant("final-a", "a", "final", "Artist", "Song"),
      participant("canonical-a", "a", null, "Artist", "Song"),
    ];
    const canonical = canonicalEditionEntries(rows);
    expect(canonical).toHaveLength(1);
    expect(canonical[0]!.id).toBe("canonical-a");
  });

  it("normalises optional listening links without making them required", () => {
    expect(listenLinksFrom({ youtube_url: " https://youtube.com/watch?v=x ", spotify_url: "", apple_music_url: null })).toEqual({
      youtube_url: "https://youtube.com/watch?v=x",
      spotify_url: null,
      apple_music_url: null,
    });
  });

  it("preserves every exact record holder instead of choosing one tied country", () => {
    const participants = [
      participant("canonical-a", "a", null, "Artist A", "Song A"),
      participant("canonical-b", "b", null, "Artist B", "Song B"),
    ];
    const records = buildFanRecords({
      countries,
      editions: [edition],
      shows: [semiShow, finalShow],
      participants,
      results: [result("ra", "a"), result("rb", "b")],
      jury: [],
    });
    const wins = records.find((record) => record.id === "wins");
    expect(wins?.holders.map((holder) => holder.countryId).sort()).toEqual(["a", "b"]);
    const score = records.find((record) => record.id === "highest-score");
    expect(score?.holders).toHaveLength(2);
    expect(score?.holders[0]?.editionLabel).toBe("SSC 1");
    expect(score?.holders.some((holder) => holder.song === "Song A")).toBe(true);
  });

  it("makes Analysis discovery-first and removes the unexplained public label", () => {
    const analysis = source("src/routes/analysis/index.tsx");
    expect(analysis).toContain('useState<Tab>("discover")');
    expect(analysis).toContain('label="Winner radar"');
    expect(analysis).not.toContain('label="Kingmaker"');
    expect(analysis).toContain('value: "connections", label: "Connections map"');
  });

  it("unifies signed-in navigation under My Solaris", () => {
    const shell = source("src/components/AppShell.tsx");
    expect(shell).toContain('const accountHref = email ? "/my-solaris" : "/auth"');
    expect(shell).toContain("Open My Solaris");
    expect(shell).not.toContain("Profile & activity");
    expect(shell).not.toContain('label: "My country"');
  });

  it("wires all eight country personalities to the actual public hero", () => {
    const countryRoute = source("src/routes/countries/$code.tsx");
    const visualTheme = source("src/lib/visual-theme.ts");
    const entityCss = source("src/entity-theme.css");
    const editor = source("src/routes/_authenticated/country-hub/theme.tsx");
    expect(countryRoute).toContain("country-public-hero");
    for (const layout of ["poster", "split", "spotlight", "broadcast"]) {
      expect(visualTheme).toContain(`"${layout}"`);
      expect(entityCss).toContain(`data-country-hero-layout="${layout}"`);
    }
    expect(editor).toContain("mobilePreviewOpen");
    expect(editor).toContain("Unsaved preview");
  });

  it("puts listening links on the main public entry surfaces", () => {
    const countryRoute = source("src/routes/countries/$code.tsx");
    const wiki = source("src/routes/wiki/$code.tsx");
    const editionRoute = source("src/routes/editions/$slug.tsx");
    const component = source("src/components/EntryListenLinks.tsx");
    expect(countryRoute).toContain("<EntryListenLinks");
    expect(wiki).toContain("<EntryListenLinks");
    expect(editionRoute).toContain("canonicalEditionEntries");
    expect(editionRoute).toContain("Listen to the edition");
    expect(component).toContain("Apple Music");
    expect(component).toContain('rel="noopener noreferrer"');
  });
});
