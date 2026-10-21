import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Archive Games publication safety", () => {
  it("filters broad archive reads through the canonical public archive before game derivation", () => {
    const route = read("src/routes/archive-games/index.tsx");

    expect(route).toContain('import { buildPublicCountryArchive } from "@/lib/public-country-archive"');
    expect(route).toContain("const publicArchive = useMemo(");
    expect(route).toContain("buildPublicCountryArchive({");
    expect(route).toContain("editions: publicArchive.editions");
    expect(route).toContain("shows: publicArchive.shows");
    expect(route).toContain("participants: publicArchive.participants");
    expect(route).toContain("results: publicArchive.results");
  });

  it("keeps the game engine downstream of publication filtering instead of becoming a second publication authority", () => {
    const route = read("src/routes/archive-games/index.tsx");
    const game = read("src/lib/archive-games.ts");

    expect(route.indexOf("const publicArchive = useMemo(")).toBeLessThan(
      route.indexOf("const gameInput = useMemo("),
    );
    expect(route.indexOf("const gameInput = useMemo(")).toBeLessThan(
      route.indexOf("archiveGameStats(gameInput)"),
    );
    expect(route.indexOf("const gameInput = useMemo(")).toBeLessThan(
      route.indexOf("buildArchiveGameQuestion("),
    );

    expect(game).not.toContain("resolveShowPublication(");
    expect(game).not.toContain("showPublishesResults(");
    expect(game).not.toContain("publication_status");
  });

  it("does not add a mutation or privileged client to the retained public game surface", () => {
    const route = read("src/routes/archive-games/index.tsx");

    expect(route).not.toContain("supabaseAdmin");
    expect(route).not.toContain("service_role");
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".upsert(");
    expect(route).not.toContain(".delete(");
  });
});
