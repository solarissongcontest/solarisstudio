import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_PUBLICATION_CONFIG } from "./publication";
import { publishedShowReadAccess } from "./v3-public-show-edition";

const edition = { id: "edition-25", published: true };
const show = {
  id: "show-25-final",
  edition_id: edition.id,
  published: true,
  publication_config: { ...DEFAULT_PUBLICATION_CONFIG, participants: true },
};

describe("V3 Show detail public query scope", () => {
  it("does not start any Show, ballot or Edition content query for unavailable contexts", () => {
    for (const [candidateShow, candidateEdition] of [
      [null, edition],
      [show, null],
      [show, { ...edition, published: false }],
      [show, { ...edition, id: "other-edition" }],
      [{ ...show, published: false }, edition],
    ] as const) {
      const read = publishedShowReadAccess(candidateShow, candidateEdition);
      expect(Object.values(read).every((id) => id === undefined)).toBe(true);
    }
  });

  it("reads published participants while keeping unreleased outcomes and ballots disabled", () => {
    expect(publishedShowReadAccess(show, edition)).toEqual({
      showId: show.id,
      editionId: edition.id,
      resultsId: undefined,
      juryVotesId: undefined,
      televoteVotesId: undefined,
      votersId: undefined,
      televoteDetailId: undefined,
    });
  });

  it("allows aggregate published results without fetching individual jury or televote ballots", () => {
    const read = publishedShowReadAccess({
      ...show,
      publication_config: {
        ...DEFAULT_PUBLICATION_CONFIG,
        results: true,
        jury_results: true,
        televote_results: true,
      },
    }, edition);
    expect(read.resultsId).toBe(show.id);
    expect(read.juryVotesId).toBeUndefined();
    expect(read.televoteVotesId).toBeUndefined();
    expect(read.votersId).toBeUndefined();
    expect(read.televoteDetailId).toBeUndefined();
  });

  it("enables only the voting detail components explicitly published", () => {
    const juryOnly = publishedShowReadAccess({
      ...show,
      publication_config: {
        ...DEFAULT_PUBLICATION_CONFIG,
        jury_results: true,
        detailed_voting: true,
      },
    }, edition);
    expect(juryOnly.resultsId).toBe(show.id);
    expect(juryOnly.juryVotesId).toBe(show.id);
    expect(juryOnly.votersId).toBe(show.id);
    expect(juryOnly.televoteVotesId).toBeUndefined();
    expect(juryOnly.televoteDetailId).toBeUndefined();

    const televoteOnly = publishedShowReadAccess({
      ...show,
      publication_config: {
        ...DEFAULT_PUBLICATION_CONFIG,
        televote_results: true,
        detailed_voting: true,
      },
    }, edition);
    expect(televoteOnly.juryVotesId).toBeUndefined();
    expect(televoteOnly.televoteVotesId).toBe(show.id);
    expect(televoteOnly.televoteDetailId).toBe(show.id);
  });

  it("retains explicit legacy Show publication compatibility", () => {
    const read = publishedShowReadAccess({ ...show, publication_config: null }, edition);
    expect(read.showId).toBe(show.id);
    expect(read.resultsId).toBe(show.id);
    expect(read.juryVotesId).toBe(show.id);
  });

  it("wires existing Show detail hooks to exact public query IDs", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/shows/$showId.tsx"), "utf8");
    expect(source).toContain("publishedShowReadAccess(showQuery.data, editionQuery.data)");
    expect(source).toContain("usePublicShowParticipants(readAccess.showId)");
    expect(source).toContain("useResults(readAccess.resultsId)");
    expect(source).toContain("useJuryVotes(readAccess.juryVotesId)");
    expect(source).toContain("useTelevotes(readAccess.televoteVotesId)");
    expect(source).toContain("useShowVoters(readAccess.votersId)");
    expect(source).toContain("useContestEntities(readAccess.editionId)");
    expect(source).toContain("enabled: Boolean(readAccess.televoteDetailId)");
  });
});
