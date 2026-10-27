import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { V3ResultCoverageNotice } from "@/components/v3/V3ResultCoverageNotice";
import { V3ScoreboardPresentation } from "@/components/v3/V3ScoreboardPresentation";
import { V3ExploreScreen } from "@/components/v3/V3ExploreScreen";
import { V3EditionHubScreen } from "@/components/v3/V3EditionHubScreen";
import { V3DelegationScreen } from "@/components/v3/V3DelegationScreen";
import { V3RecordsScreen } from "@/components/v3/V3RecordsScreen";
import { V3ScorechartsScreen } from "@/components/v3/V3ScorechartsScreen";
import { V3StoriesIndexScreen } from "@/components/v3/V3StoriesIndexScreen";
import { V3StoryDetailScreen } from "@/components/v3/V3StoryDetailScreen";
import { V3RelationshipsIndexScreen } from "@/components/v3/V3RelationshipsIndexScreen";
import { V3ResultLabScreen } from "@/components/v3/V3ResultLabScreen";
import { V3BroadcastIntelligenceScreen } from "@/components/v3/V3BroadcastIntelligenceScreen";
import { buildV3ExploreRootProjection, type V3ExploreEditionInput } from "./v3-explore";
import { buildV3EditionPageProjection } from "./v3-edition";
import { buildV3CountryExploreProjection } from "./v3-explore-entities";
import { buildBroadcastIntelligence } from "./broadcast-intelligence";
import type { Country } from "./data";
import type { V3StoriesIndexBundle } from "./v3-stories";

// This accepts presentation downstream of existing public-only owners. It does
// not assert hosted rollout activation or substitute fixture data for a release
// rehearsal. Source/RPC/publication contracts run alongside these real screens.
const generatedAt = "2026-10-26T12:00:00Z";
const edition: V3ExploreEditionInput = {
  id: "edition", slug: "ssc-22", name: "Accepted public edition", editionNumber: 22,
  year: 2026, hostLabel: "Public host", artworkUrl: null, visibility: "public",
  experience: "pre-show", resultsPublication: "hidden", href: "/editions/ssc-22",
  liveHref: null, nextEvent: null, archiveEligible: false,
};
const country: Country = {
  id: "country", name: "Canonical country", native_name: null, short_code: "CC",
  flag_image: null, region: "Solaris", accent_color: "#123456", description: null,
  first_participation: null,
};
const option = {
  id: "show", name: "Published final", kind: "final", editionId: "edition",
  editionName: edition.name, editionSlug: edition.slug, editionNumber: 22,
};
const official = { id: country.id, name: country.name, juryPoints: 12, televotePoints: 24, officialRank: 1 };
const shell = { editionLabel: edition.name, phaseLabel: "Published history" };
async function render(node: ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({ getParentRoute: () => root, path: "/", component: () => node });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("accepted Public read family: canonical projection to actual production presentation", () => {
  it("Explore excludes private/scheduled discovery before rendering real public destinations", async () => {
    const projection = buildV3ExploreRootProjection({
      currentEditionId: edition.id, editions: [edition, { ...edition, id: "private", name: "PRIVATE-EDITION", visibility: "private", archiveEligible: true }],
      countries: [{ id: "public", title: country.name, href: "/countries/CC", visibility: "public" }, { id: "secret", title: "PRIVATE-COUNTRY", href: "/countries/secret", visibility: "private" }],
      songs: [], artists: [], shows: [], stories: [], routes: { countries: "/countries/", songsAndArtists: "/entries", shows: "/shows", stories: "/stories", results: "/results", rules: "/rules", editionsArchive: "/editions/", wiki: "/wiki", encyclopedia: "/encyclopedia", archiveGames: "/games", advancedDiscovery: "/discover" },
    });
    const html = await render(<V3ExploreScreen projection={projection} onOpenSearch={() => undefined} />);
    expect(html).toContain(edition.name);
    expect(html).toContain("1 public item");
    expect(html).toContain('href="/countries"');
    expect(html).not.toContain("PRIVATE-EDITION");
    expect(projection.discover[0].publicItemCount).toBe(1);
    expect(projection.archive.editions).toEqual([]);
  });

  it("Edition does not render stray result rows before canonical publication", async () => {
    const projection = buildV3EditionPageProjection({ edition, description: "Public edition", participants: [], entries: [], shows: [], story: null, resultShowHref: "/shows/show", results: [{ id: "secret", name: "UNPUBLISHED-WINNER", shortCode: "XX", flagImage: null, accentColor: "#111111", href: "/countries/XX", rank: 1, totalPoints: 998877 }] });
    expect(projection).not.toBeNull();
    const html = await render(<V3EditionHubScreen projection={projection!} />);
    expect(html).toContain(edition.name);
    expect(html).not.toContain("UNPUBLISHED-WINNER");
    expect(html).not.toContain("998877");
    expect(projection!.results.showHref).toBeNull();
    expect(projection!.results.rows).toEqual([]);
  });

  it("Country and Delegation share canonical history links without leaking historical scores", async () => {
    const projection = buildV3CountryExploreProjection({ code: "CC", name: country.name, nativeName: null, region: "Solaris", description: "Public history", flag: { src: null, alt: "Flag", aspectRatio: 1.5 }, colors: { primary: "#111111", accent: "#123456" }, facts: [], statistics: [], currentEntry: null, history: [{ editionId: edition.id, editionLabel: edition.name, artist: "Published artist", song: "Published song", placement: 12345, points: 998877, status: "published" }], actions: {} }, new Map([[edition.id, edition.href]]));
    const html = await render(<V3DelegationScreen projection={projection} hideResultSpoilers />);
    expect(html).toContain(country.name);
    expect(html).toContain("Published artist");
    expect(html).toContain('href="/editions/ssc-22"');
    expect(html).not.toContain("998877");
    expect(html).not.toContain("12345");
  });

  it("embedded Scoreboard preserves tied canonical ranks and does not choose a winner", async () => {
    const other = { ...country, id: "other", name: "Other country", short_code: "OC" };
    const html = await render(<V3ScoreboardPresentation standings={[{ countryId: country.id, jury: 12, televote: 24, total: 36, rank: 1, topPoints: 0 }, { countryId: other.id, jury: 24, televote: 12, total: 36, rank: 1, topPoints: 0 }]} countries={new Map([[country.id, country], [other.id, other]])} />);
    expect(html).toContain(country.name);
    expect(html).toContain(other.name);
    expect(html).toContain(">Tie<");
    expect(html).not.toContain(">Winner<");
    const empty = await render(<V3ScoreboardPresentation standings={[]} countries={new Map()} />);
    expect(empty).toContain("No published ranking yet");
    expect(empty).not.toContain(country.name);
  });

  it("Scorecharts renders only owner-supplied published matrix destinations and truthful empty state", async () => {
    const html = await render(<V3ScorechartsScreen items={[{ showId: option.id, showName: option.name, showKind: option.kind, editionId: edition.id, editionName: edition.name, editionSlug: edition.slug, editionNumber: 22 }]} generatedAt={generatedAt} />);
    expect(html).toContain(option.name);
    expect(html).toContain('href="/shows/show?tab=matrix&amp;from=results"');
    const empty = await render(<V3ScorechartsScreen items={[]} generatedAt={generatedAt} />);
    expect(empty).toContain("No published scorecharts yet");
    expect(empty).not.toContain(option.name);
  });

  it("Stories index and detail protect actual published titles, introductions and anniversary moments", async () => {
    const story = { editionId: edition.id, editionSlug: edition.slug, editionName: edition.name, editionNumber: 22, eventDate: null, title: "SECRET-PUBLISHED-TITLE", subtitle: "SECRET-SUBTITLE", introduction: "SECRET-INTRODUCTION", publishedAt: generatedAt, itemCount: 1, heroMoment: { sourceEventType: "results.published", occurredAt: generatedAt, importance: 10, headline: "SECRET-MOMENT", summary: "SECRET-SUMMARY" } };
    const bundle: V3StoriesIndexBundle = { shell, stories: [story], anniversary: { referenceDate: "2026-10-26", timeZone: "UTC", sscAnniversary: null, onThisDay: [story.heroMoment] }, generatedAt };
    const visible = await render(<V3StoriesIndexScreen bundle={bundle} hideSpoilers={false} />);
    expect(visible).toContain(story.title);
    expect(visible).toContain('href="/stories/ssc-22"');
    const protectedIndex = await render(<V3StoriesIndexScreen bundle={bundle} hideSpoilers />);
    const protectedDetail = await render(<V3StoryDetailScreen bundle={{ shell, story: { ...story, items: [story.heroMoment] }, relatedEdition: { label: edition.name, href: edition.href }, relatedStories: [], generatedAt }} hideSpoilers />);
    for (const html of [protectedIndex, protectedDetail]) for (const secret of [story.title, story.introduction, story.heroMoment.headline, story.heroMoment.summary]) expect(html).not.toContain(secret);
    const absent = await render(<V3StoryDetailScreen bundle={{ shell, story: null, relatedEdition: null, relatedStories: [], generatedAt }} hideSpoilers={false} />);
    expect(absent).toContain("No published story for this edition");
  });

  it("Relationships remains descriptive public analysis with canonical pair navigation", async () => {
    const a = { id: country.id, name: country.name, shortCode: "CC", flagImage: null, accentColor: "#123456" };
    const b = { ...a, id: "other", name: "Other country", shortCode: "OC" };
    const html = await render(<V3RelationshipsIndexScreen pairs={[{ key: "pair", pairParam: "CC-OC", a, b, sharedEditions: 2, friendshipScore: 50, rivalryScore: 40, reciprocityScore: 80, normalizedAtoB: 60, normalizedBtoA: 50, oneSidedGap: 10 }]} />);
    expect(html).toContain(country.name);
    expect(html).toContain('href="/relationships/CC-OC"');
    expect(html).toContain("not motive or coordinated voting");
  });

  it("Result Lab labels simulation while official rows retain their persisted rank", async () => {
    const html = await render(<V3ResultLabScreen bundle={{ rolloutEditionSlug: edition.slug, shell, options: [option], selectedShowId: option.id, detailedVotingPublic: false, officialEntries: [official], juryVotes: [], voters: [], identities: [{ id: country.id, name: country.name, shortCode: "CC", flagImage: null, accentColor: "#123456" }], generatedAt }} onShowChange={() => undefined} />);
    expect(html).toContain(country.name);
    expect(html).toContain("simulation");
    expect(html).toContain("Official");
    expect(official.officialRank).toBe(1);
  });

  it("Broadcast Intelligence uses the supplied official replay without enabling a live lifecycle", async () => {
    const entries = [{ ...official, totalPoints: 36 }];
    const html = await render(<V3BroadcastIntelligenceScreen bundle={{ rolloutEditionSlug: edition.slug, shell, options: [option], selectedShowId: option.id, entries, intelligence: buildBroadcastIntelligence(entries), identities: [{ id: country.id, name: country.name, shortCode: "CC", flagImage: null, accentColor: "#123456" }], generatedAt }} onShowChange={() => undefined} />);
    expect(html).toContain(country.name);
    expect(html).toContain("replay");
    expect(html).not.toContain("Publish result");
    expect(html).not.toContain("Start live show");
  });

  it("Records renders tied canonical archive holders and never fabricates a holder in an empty archive", async () => {
    const record = { id: "wins", label: "Most wins", value: "2", category: "career" as const, explanation: "Published archive wins", holders: [{ countryId: country.id, countryName: country.name, shortCode: "CC", flagImage: null, accentColor: "#123456" }, { countryId: "other", countryName: "Other country", shortCode: "OC", flagImage: null, accentColor: "#123456" }] };
    const html = await render(<V3RecordsScreen records={[record]} archivedFinalEditions={2} generatedAt={generatedAt} />);
    expect(html).toContain(country.name);
    expect(html).toContain("Other country");
    expect(html).toContain("Most wins");
    const empty = await render(<V3RecordsScreen records={[]} archivedFinalEditions={0} generatedAt={generatedAt} />);
    expect(empty).not.toContain(country.name);
    expect(empty).not.toContain("Most wins");
  });
  it("discloses unavailable public history instead of implying complete all-time comparisons", async () => {
    const partial = await render(<V3ResultCoverageNotice coverage={{ includedShows: 1, unavailableShows: 2 }} />);
    expect(partial).toContain("Some public results are not available in this view yet");
    expect(partial).toContain("Comparisons and records cover the available results");
    for (const internal of ["immutable", "version", "database", "RPC"]) expect(partial).not.toContain(internal);
    expect(await render(<V3ResultCoverageNotice coverage={{ includedShows: 2, unavailableShows: 0 }} />)).toBe("");
  });

});
