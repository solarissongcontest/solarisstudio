import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Story artwork contract", () => {
  it("resolves artwork from one published Edition by stable Story edition identity", () => {
    const source = read("src/integrations/v3/stories-source.server.ts");

    expect(source).toContain('from("editions")');
    expect(source).toContain('.select("id,artwork_url")');
    expect(source).toContain('.eq("id", story.editionId)');
    expect(source).toContain('.eq("published", true)');
    expect(source).toContain(".maybeSingle()");
    expect(source).toContain("editionId !== story.editionId");
    expect(source).not.toContain('.eq("slug", story.editionSlug)');
  });

  it("keeps the supplemental artwork read narrow and outside protected contest truth", () => {
    const source = read("src/integrations/v3/stories-source.server.ts");
    const artworkLoader = source.split("async function loadPublishedEditionArtwork")[1]?.split("/**")[0] ?? "";

    expect(artworkLoader).toContain('select("id,artwork_url")');
    expect(artworkLoader).not.toContain("participants");
    expect(artworkLoader).not.toContain("results");
    expect(artworkLoader).not.toContain("jury");
    expect(artworkLoader).not.toContain("televote");
    expect(artworkLoader).not.toContain("service_role");
  });

  it("fails artwork soft without making a published Story unavailable", () => {
    const source = read("src/integrations/v3/stories-source.server.ts");

    expect(source).toContain("Promise<V3StoryArtwork | null>");
    expect(source).toContain("if (error || !data || typeof data !== \"object\" || Array.isArray(data)) return null;");
    expect(source).toContain("Artwork is presentation-only");
    expect(source).toContain("return null;");
    expect(source).toContain("story,\n    artwork,");
  });

  it("renders only the server-projected artwork and keeps spoiler protection ahead of it", () => {
    const screen = read("src/components/v3/V3StoryDetailScreen.tsx");
    const spoilerBoundary = screen.indexOf("if (hideSpoilers && !revealed)");
    const artworkRender = screen.indexOf("bundle.artwork ? (");

    expect(spoilerBoundary).toBeGreaterThan(-1);
    expect(artworkRender).toBeGreaterThan(spoilerBoundary);
    expect(screen).toContain("src={bundle.artwork.src}");
    expect(screen).toContain("alt={bundle.artwork.alt}");
    expect(screen).not.toContain('.from("editions")');
    expect(screen).not.toContain("artwork_url");
  });
});
