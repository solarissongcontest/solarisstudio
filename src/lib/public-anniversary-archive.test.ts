import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildPublicAnniversaryArchive } from "./public-anniversary-archive";

const publication = (overrides: Record<string, boolean> = {}) => ({
  participants: false,
  artists: false,
  songs: false,
  semi_split: false,
  running_order: false,
  qualifiers: false,
  results: false,
  jury_results: false,
  televote_results: false,
  detailed_voting: false,
  ...overrides,
});

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public Anniversary archive", () => {
  it("does not count participants or results merely because their edition is public", () => {
    const archive = buildPublicAnniversaryArchive({
      editions: [{ id: "e1", published: true } as any],
      shows: [
        {
          id: "s1",
          edition_id: "e1",
          published: true,
          publication_config: publication(),
        } as any,
      ],
      participants: [
        {
          id: "p1",
          edition_id: "e1",
          show_id: "s1",
          country_id: "c1",
          publication_status: "published",
        } as any,
      ],
      results: [
        {
          id: "r1",
          edition_id: "e1",
          show_id: "s1",
          country_id: "c1",
          total_points: 100,
          final_rank: 1,
        } as any,
      ],
    });

    expect(archive.participants).toEqual([]);
    expect(archive.results).toEqual([]);
  });

  it("allows the public participant layer without inventing result publication", () => {
    const archive = buildPublicAnniversaryArchive({
      editions: [{ id: "e1", published: true } as any],
      shows: [
        {
          id: "s1",
          edition_id: "e1",
          published: true,
          publication_config: publication({ participants: true }),
        } as any,
      ],
      participants: [
        {
          id: "p1",
          edition_id: "e1",
          show_id: "s1",
          country_id: "c1",
          publication_status: "published",
        } as any,
      ],
      results: [
        {
          id: "r1",
          edition_id: "e1",
          show_id: "s1",
          country_id: "c1",
          total_points: 100,
          final_rank: 1,
        } as any,
      ],
    });

    expect(archive.participants).toHaveLength(1);
    expect(archive.results).toEqual([]);
  });

  it("makes both public Anniversary consumers use the shared publication-safe archive", () => {
    const route = read("src/routes/anniversary/index.tsx");
    const home = read("src/components/HomeAnniversaryTakeover.tsx");

    expect(route).toContain("buildPublicAnniversaryArchive({");
    expect(route).toContain("publicArchive.participants");
    expect(route).toContain("publicArchive.results");
    expect(route).not.toContain("for (const entry of participants ?? [])");
    expect(home).toContain("buildPublicAnniversaryArchive({");
    expect(home).toContain("participants: publicArchive.participants");
    expect(home).toContain("results: publicArchive.results");
  });
});
