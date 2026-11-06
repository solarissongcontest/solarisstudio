import { describe, expect, it } from "vitest";

import { buildPublicCountryArchive } from "./public-country-archive";

function baseInput() {
  return {
    editions: [
      {
        id: "e22",
        edition_number: 22,
        name: "SSC 22",
        slug: "ssc-22",
        published: true,
      },
    ],
    shows: [
      {
        id: "sf22",
        edition_id: "e22",
        name: "Semi-Final",
        kind: "semi-final",
        published: true,
        publication_config: {
          participants: true,
          artists: true,
          songs: true,
          semi_split: true,
          running_order: false,
          qualifiers: false,
          results: false,
          jury_results: false,
          televote_results: false,
          detailed_voting: false,
        },
      },
    ],
    participants: [
      {
        id: "p1",
        edition_id: "e22",
        show_id: "sf22",
        country_id: "ola",
        contest_entity_id: null,
        artist: "Artist",
        song: "Song",
        youtube_url: "https://example.com/video",
        spotify_url: "https://example.com/spotify",
        apple_music_url: "https://example.com/apple",
        publication_status: "published",
        scheduled_publish_at: null,
        running_order: 4,
        semi_final: "1",
        qualified: true,
        notes: "private note",
      },
    ],
    results: [
      {
        id: "r1",
        edition_id: "e22",
        show_id: "sf22",
        country_id: "ola",
        jury_points: 0,
        televote_points: 0,
        total_points: 0,
        final_rank: 5,
      },
    ],
    jury: [
      {
        id: "j1",
        edition_id: "e22",
        show_id: "sf22",
        voter_country_id: "nor",
        receiving_country_id: "ola",
        points: 12,
      },
    ],
    televote: [
      {
        id: "t1",
        edition_id: "e22",
        show_id: "sf22",
        country_id: "ola",
        points: 99,
      },
    ],
  } as any;
}

describe("buildPublicCountryArchive", () => {
  it("keeps released entries but hides draft results and qualification state", () => {
    const archive = buildPublicCountryArchive(baseInput());
    const publicEntry = archive.participants[0] as any;

    expect(archive.participants).toHaveLength(1);
    expect(publicEntry?.artist).toBe("Artist");
    expect(publicEntry?.song).toBe("Song");
    expect(publicEntry?.youtube_url).toBe("https://example.com/video");
    expect(publicEntry?.notes).toBeNull();
    expect(publicEntry?.running_order).toBeNull();
    expect(publicEntry?.qualified).toBeNull();

    expect(archive.results).toEqual([]);
    expect(archive.jury).toEqual([]);
    expect(archive.televote).toEqual([]);
  });

  it("redacts a draft entry even when the show's artist and song layers are public", () => {
    const input = baseInput();
    input.participants[0].publication_status = "draft";

    const archive = buildPublicCountryArchive(input);
    const publicEntry = archive.participants[0] as any;

    expect(archive.participants).toHaveLength(1);
    expect(publicEntry?.artist).toBeNull();
    expect(publicEntry?.song).toBeNull();
    expect(publicEntry?.youtube_url).toBeNull();
    expect(publicEntry?.spotify_url).toBeNull();
    expect(publicEntry?.apple_music_url).toBeNull();
  });

  it("redacts a future scheduled entry until its exact reveal time", () => {
    const input = baseInput();
    input.participants[0].publication_status = "scheduled";
    input.participants[0].scheduled_publish_at = "2999-08-29T21:02:00.000Z";

    const archive = buildPublicCountryArchive(input);
    const publicEntry = archive.participants[0] as any;

    expect(publicEntry?.artist).toBeNull();
    expect(publicEntry?.song).toBeNull();
  });

  it("reveals a scheduled entry after its reveal boundary has passed", () => {
    const input = baseInput();
    input.participants[0].publication_status = "scheduled";
    input.participants[0].scheduled_publish_at = "2000-01-01T00:00:00.000Z";

    const archive = buildPublicCountryArchive(input);

    expect(archive.participants[0]?.artist).toBe("Artist");
    expect(archive.participants[0]?.song).toBe("Song");
  });

  it("exposes results only after the result layer is published", () => {
    const input = baseInput();
    input.shows[0].publication_config.results = true;
    input.shows[0].publication_config.qualifiers = true;

    const archive = buildPublicCountryArchive(input);

    expect(archive.results).toHaveLength(1);
    expect(archive.participants[0]?.qualified).toBe(true);
    // Publishing aggregate results still does not publish individual ballots.
    expect(archive.jury).toEqual([]);
    expect(archive.televote).toEqual([]);
  });

  it("only exposes raw voting detail when detailed voting is published", () => {
    const input = baseInput();
    input.shows[0].publication_config.results = true;
    input.shows[0].publication_config.detailed_voting = true;

    const archive = buildPublicCountryArchive(input);

    expect(archive.jury).toHaveLength(1);
    expect(archive.televote).toHaveLength(1);
  });

  it("drops data from unpublished editions completely", () => {
    const input = baseInput();
    input.editions[0].published = false;

    const archive = buildPublicCountryArchive(input);

    expect(archive.editions).toEqual([]);
    expect(archive.shows).toEqual([]);
    expect(archive.participants).toEqual([]);
    expect(archive.results).toEqual([]);
  });
  it("never uses one edition's public show to release another edition's history", () => {
    const input = baseInput();
    input.shows[0].publication_config.results = true;
    input.shows[0].publication_config.detailed_voting = true;

    // Both editions are public, but a legacy row incorrectly points to the
    // other edition's published show. A show-id-only gate would leak it.
    input.editions.push({
      ...input.editions[0],
      id: "e23",
      slug: "ssc-23",
      edition_number: 23,
    });
    input.shows.push({ ...input.shows[0], id: "sf23", edition_id: "e23" });

    input.participants.push({
      ...input.participants[0],
      id: "p-cross",
      edition_id: "e23",
      show_id: "sf22",
      artist: "Cross-edition artist",
    });
    input.results.push({
      ...input.results[0],
      id: "r-cross",
      edition_id: "e23",
      show_id: "sf22",
      final_rank: 1,
    });
    input.jury.push({
      ...input.jury[0],
      id: "j-cross",
      edition_id: "e23",
      show_id: "sf22",
    });
    input.televote.push({
      ...input.televote[0],
      id: "t-cross",
      edition_id: "e23",
      show_id: "sf22",
    });

    // Correctly joined rows for the newer edition must still pass.
    input.participants.push({
      ...input.participants[0],
      id: "p23",
      edition_id: "e23",
      show_id: "sf23",
    });
    input.results.push({
      ...input.results[0],
      id: "r23",
      edition_id: "e23",
      show_id: "sf23",
    });
    input.jury.push({
      ...input.jury[0],
      id: "j23",
      edition_id: "e23",
      show_id: "sf23",
    });
    input.televote.push({
      ...input.televote[0],
      id: "t23",
      edition_id: "e23",
      show_id: "sf23",
    });

    const archive = buildPublicCountryArchive(input);
    expect(archive.participants.map((row) => row.id)).toEqual(["p1", "p23"]);
    expect(archive.results.map((row) => row.id)).toEqual(["r1", "r23"]);
    expect(archive.jury.map((row) => row.id)).toEqual(["j1", "j23"]);
    expect(archive.televote.map((row) => row.id)).toEqual(["t1", "t23"]);
  });

  it("never assigns show-specific running order or qualification to an edition entry", () => {
    const input = baseInput();
    input.shows[0].publication_config.running_order = true;
    input.shows[0].publication_config.qualifiers = true;
    input.participants.push({
      ...input.participants[0],
      id: "edition-only",
      show_id: null,
    });

    const archive = buildPublicCountryArchive(input);
    const appearance = archive.participants.find((row) => row.id === "p1");
    const canonical = archive.participants.find((row) => row.id === "edition-only");

    // The specific published show is authorized to disclose its own stage fields.
    expect(appearance?.running_order).toBe(4);
    expect(appearance?.qualified).toBe(true);

    // A showless canonical row is *not* a performance or qualifier decision:
    // public_safe_participants also returns null for both these fields.
    expect(canonical?.artist).toBe("Artist");
    expect(canonical?.song).toBe("Song");
    expect(canonical?.running_order).toBeNull();
    expect(canonical?.qualified).toBeNull();
  });

  it("retains correctly published edition-level canonical entries", () => {
    const input = baseInput();
    input.participants.push({
      ...input.participants[0],
      id: "edition-p1",
      show_id: null,
    });

    const archive = buildPublicCountryArchive(input);
    const editionEntry = archive.participants.find((row) => row.id === "edition-p1");
    expect(editionEntry?.artist).toBe("Artist");
    expect(editionEntry?.song).toBe("Song");
    expect(editionEntry?.notes).toBeNull();
    expect(editionEntry?.running_order).toBeNull();
  });

});
