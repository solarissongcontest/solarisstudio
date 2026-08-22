import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Keep high-risk user-facing surfaces in this list so implementation copy cannot quietly leak back out.
const COPY_SURFACES = [
  "src/components/AppShell.tsx",
  "src/components/CountryWorldOverview.tsx",
  "src/components/ScoreboardStage.tsx",
  "src/components/viz/VotingHeatmap.tsx",
  "src/routes/analysis/index.tsx",
  "src/routes/archive-games/index.tsx",
  "src/routes/broadcast-intelligence/index.tsx",
  "src/routes/confirmations/index.tsx",
  "src/routes/countries/$code.tsx",
  "src/routes/editions/$slug.tsx",
  "src/routes/me/index.tsx",
  "src/routes/participate/index.tsx",
  "src/routes/predictions/index.tsx",
  "src/routes/predictions/$showId.tsx",
  "src/routes/predictions/share/$token.tsx",
  "src/routes/pulse/index.tsx",
  "src/routes/relationships/index.tsx",
  "src/routes/relationships/$pair.tsx",
  "src/routes/result-lab/index.tsx",
  "src/routes/scorecharts/index.tsx",
  "src/routes/shows/$showId.tsx",
  "src/routes/taste-dna/index.tsx",
  "src/routes/televoting/index.tsx",
  "src/routes/sitemap[.]xml.ts",
  "src/features/beta-test/sections-extra.ts",
  "src/features/admin-beta-test/sections-v2.ts",
  "src/components/studio/ThemeEditorImpl.tsx",
  "src/components/televoting/VotingResultsView.tsx",
  "src/routes/_authenticated/admin/edition-theme.$slug.tsx",
  "src/routes/_authenticated/admin/sync-health.tsx",
  "src/routes/_authenticated/admin/televote/$slug.tsx",
  "src/routes/confirmations/admin/countries.tsx",
  "src/routes/confirmations/admin/editions.tsx",
  "src/routes/confirmations/admin/responses/$id.tsx",
  "src/routes/confirmations/admin/settings.tsx",
  "src/routes/televoting/admin/analytics.tsx",
  "src/routes/televoting/admin/editions.tsx",
  "src/routes/televoting/admin/intelligence.tsx",
  "src/routes/televoting/admin/rounds/$id/entries.tsx",
];

const FORBIDDEN_PUBLIC_COPY = [
  /Phase\s+\d/i,
  /SQL migration/i,
  /setup SQL/i,
  /database setup/i,
  /database-timed/i,
  /database clock/i,
  /migration is live/i,
  /private prediction tables/i,
  /Publish\s+(?:the\s+)?overall/i,
  /TODO:/i,
  /Solaris Labs/i,
  /Lovable/i,
  /missing the public Televoting connection/i,
  /deployment is missing/i,
  /Open the edition in Studio/i,
  /save its Publication settings/i,
  /Save the show results once in Studio/i,
  /open .* in Studio and save/i,
  /configure .* in Studio/i,
  /One Solaris front door/i,
  /design language/i,
  /source of truth/i,
  /linked projections/i,
  /source\/binding/i,
  /workspace\/context/i,
];

function visibleSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("user-facing product copy", () => {
  for (const file of COPY_SURFACES) {
    it(`${file} does not expose implementation language`, () => {
      const source = visibleSource(file);

      for (const pattern of FORBIDDEN_PUBLIC_COPY) {
        expect(source, `${file} contains ${pattern}`).not.toMatch(pattern);
      }
    });
  }
});