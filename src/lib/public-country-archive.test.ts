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

    expect(archive.participants).toHaveLength(1);
    expect(archive.participants[0]?.artist).toBe("Artist");
    expect(archive.participants[0]?.song).toBe("Song");
    expect(archive.participants[0]?.youtube_url).toBe("https://example.com/video");
    expect(archive.participants[0]?.notes).toBeNull();
    expect(archive.participants[0]?.running_order).toBeNull();
    expect(archive.participants[0]?.qualified).toBeNull();

    expect(archive.results).toEqual([]);
    expect(archive.jury).toEqual([]);
    expect(archive.televote).toEqual([]);
  });

  it("redacts a draft entry even when the show's artist and song layers are public", () => {
    const input = baseInput();
    input.participants[0].publication_status = "draft";

    const archive = buildPublicCountryArchive(input);

    expect(archive.participants).toHaveLength(1);
    expect(archive.participants[0]?.artist).toBeNull();
    expect(archive.participants[0]?.song).toBeNull();
    expect(archive.participants[0]?.youtube_url).toBeNull();
    expect(archive.participants[0]?.spotify_url).toBeNull();
    expect(archive.participants[0]?.apple_music_url).toBeNull();
  });

  it("redacts a future scheduled entry until its exact reveal time", () => {
    const input = baseInput();
    input.participants[0].publication_status = "scheduled";
    input.participants[0].scheduled_publish_at = "2999-08-29T21:02:00.000Z";

    const archive = buildPublicCountryArchive(input);

    expect(archive.participants[0]?.artist).toBeNull();
    expect(archive.participants[0]?.song).toBeNull();
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
});
