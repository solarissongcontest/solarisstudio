import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicStorySpoilerDisclosure } from "./PublicStorySpoilerDisclosure";

const index = readFileSync("src/routes/stories/index.tsx", "utf8");
const detail = readFileSync("src/routes/stories/$editionSlug.tsx", "utf8");
const app = readFileSync("src/components/v3/V3StoriesIndexScreen.tsx", "utf8");

describe("Stories: spoiler protection parity across all three experiences", () => {
  it("never renders protected story titles, bylines or narratives before a reveal", () => {
    const html = renderToStaticMarkup(
      <PublicStorySpoilerDisclosure spoilerFree subject="this story">
        <h2>SECRET HEADLINE</h2>
        <p>SECRET RESULT</p>
      </PublicStorySpoilerDisclosure>,
    );
    expect(html).toContain("data-public-story-spoiler-protected");
    expect(html).toContain("Story details hidden");
    expect(html).toContain("Reveal this story");
    expect(html).not.toContain("SECRET HEADLINE");
    expect(html).not.toContain("SECRET RESULT");
  });

  it("preserves ordinary reading when spoiler-free mode is not enabled", () => {
    const html = renderToStaticMarkup(
      <PublicStorySpoilerDisclosure spoilerFree={false}>
        <h2>Published edition</h2>
      </PublicStorySpoilerDisclosure>,
    );
    expect(html).toContain("Published edition");
    expect(html).not.toContain("data-public-story-spoiler-protected");
    expect(html).not.toContain("Hide story details again");
  });

  it("protects both ordinary web routes and resets earlier reveal on a preference or story switch", () => {
    expect(index).toContain("useAppExperiencePreferences()");
    expect(detail).toContain("useAppExperiencePreferences()");
    expect(index).toContain("<PublicStorySpoilerDisclosure");
    expect(detail).toContain("<PublicStorySpoilerDisclosure");
    expect(index).toContain('key={preferences.spoilerFree ? "spoiler-protected" : "spoilers-open"}');
    expect(detail).toContain('key={`${editionSlug}:${preferences.spoilerFree ? "protected" : "open"}`}');
    expect(index).toContain('subject="published edition stories and historical moments"');
    expect(detail).toContain('subject="this published story"');
    expect(app).toContain("data-v3-stories-spoiler-protected");
  });

  it("keeps Story publication authority in the existing public RPC, never the reveal control", () => {
    expect(index).toContain("loadPublicStorylines(");
    expect(index).toContain("loadAnniversaryEngine(");
    expect(detail).toContain("loadPublicStoryline(editionSlug)");
    const reader = readFileSync("src/components/public/PublicStorySpoilerDisclosure.tsx", "utf8");
    expect(reader).not.toContain("supabase");
    expect(reader).not.toContain("useQuery(");
    expect(reader).toContain("onClick={() => setRevealed(false)}");
  });
});
