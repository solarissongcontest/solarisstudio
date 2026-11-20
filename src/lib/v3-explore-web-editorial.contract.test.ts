import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/explore/index.tsx", "utf8");
const installed = readFileSync("src/components/v3/V3ExploreScreen.tsx", "utf8");
const style = readFileSync("src/styles/explore-web-editorial.css", "utf8");

describe("Explore website editorial completion", () => {
  it("keeps the installed PWA and the ordinary browser as distinct compositions", () => {
    expect(route).toContain('data-explore-web-experience="website"');
    expect(route).toContain("isAppMode ? (");
    expect(route).toContain("<AppExplorePersonalized />");
    expect(route).toContain("<ExploreWebEditorial />");
    expect(route).toContain("<V3ExploreRouteGate legacy={legacy} />");
    expect(style).toContain(".explore-web-editorial__columns");
    expect(style).toContain("@media (min-width: 58rem)");
    expect(style).toContain("@media (max-width: 25rem)");
    expect(style).toContain("@media (forced-colors: active)");
  });

  it("reuses canonical search and public World rollout without a second archive fetch", () => {
    expect(route).toContain("<PublicCommandPalette keyboardShortcut={false} />");
    expect(route).toContain("<WorldExploreEntry />");
    expect(route).not.toContain("useAllShows(");
    expect(route).not.toContain("useAllJuryVotes(");
    expect(route).not.toContain('from "@/integrations/supabase/client"');
  });

  it("gates every web link and the installed fallback on effective release availability", () => {
    expect(route).toContain('const { allowsReleased } = usePublicLaunchAvailability();');
    expect(route).toContain('const editionsAvailable = allowsReleased("/editions")');
    expect(route).toContain('item.to !== "/editions" && allowsReleased(item.to)');
    expect(route).toContain('WEB_ARCHIVE_DESTINATIONS.filter((item) => allowsReleased(item.to))');
    expect(route).toContain('WEB_MORE_DESTINATIONS.filter((item) => allowsReleased(item.to))');
    expect(route).toContain(".filter((item) => allowsReleased(item.to))");
  });

  it("never presents unreleased Live or upcoming Show links on the installed edition feature", () => {
    expect(installed).toContain("allowsReleased(edition.href)");
    expect(installed).toContain("edition.liveHref && allowsReleased(edition.liveHref)");
    expect(installed).toContain("edition.nextEvent && allowsReleased(edition.nextEvent.href)");
    expect(installed).not.toContain("allows(edition.href)");
  });
});
