import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { V3ResultsScreen } from "@/components/v3/V3ResultsScreen";
import type { Country } from "./data";
import type { V3ResultProjectionInput } from "./v3-results";

const country: Country = {
  id: "country-1",
  name: "WINNER-SECRET",
  native_name: null,
  short_code: "C1",
  flag_image: null,
  region: "Solaris",
  accent_color: "#123456",
  description: null,
  first_participation: null,
};
const countries = new Map([[country.id, country]]);
const input: V3ResultProjectionInput = {
  editionId: "edition-1",
  editionName: "SSC 22",
  showId: "show-1",
  showName: "Final",
  publication: "published",
  disclosure: "revealed",
  juryPublished: false,
  televotePublished: false,
  userDelegationCountryId: null,
  rows: [
    {
      countryId: country.id,
      countryName: country.name,
      flagUrl: null,
      rank: 1,
      points: 112233,
      juryPoints: 111222,
      televotePoints: 1111,
    },
  ],
  resultTools: [{ key: "scores", label: "Scorecharts", href: "/scorecharts" }],
  advancedTools: [{ key: "analysis", label: "ANALYSIS-SECRET", href: "/analysis" }],
};

async function renderScreen(element: React.ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const resultRoute = createRoute({
    getParentRoute: () => root,
    path: "/results",
    component: () => element,
  });
  const router = createRouter({
    routeTree: root.addChildren([resultRoute]),
    history: createMemoryHistory({ initialEntries: ["/results"] }),
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("production Results screen", () => {
  it("does not invent a global-country destination for a custom delegation", async () => {
    const custom = { ...country, entityType: "custom" as const };
    const html = await renderScreen(
      <V3ResultsScreen
        input={input}
        countries={new Map([[country.id, custom]])}
        hideSpoilers={false}
      />,
    );
    expect(html).toContain(country.name);
    expect(html).not.toContain("/countries/");
    expect(html).toContain("Open full official result");
  });
  it("does not render result or analysis leaks while shared spoiler mode is on", async () => {
    const html = await renderScreen(
      <V3ResultsScreen input={input} countries={countries} hideSpoilers />,
    );
    expect(html).toContain("Reveal official result");
    for (const secret of [
      country.name,
      "112233",
      "111222",
      "ANALYSIS-SECRET",
      "data-v3-scoreboard",
    ])
      expect(html).not.toContain(secret);
    expect(html).toContain('data-v3-results-state="spoiler-protected"');
  });

  it("leads with the canonical Scoreboard and only offers published point modes", async () => {
    const html = await renderScreen(
      <V3ResultsScreen input={input} countries={countries} hideSpoilers={false} />,
    );
    expect(html).toContain("data-v3-scoreboard");
    expect(html).toContain(country.name);
    expect(html).toContain("112233");
    expect(html).not.toContain("111222");
    expect(html).toContain("Combined");
    expect(html).not.toContain(">Jury<");
    expect(html).not.toContain(">Televote<");
    expect(html.indexOf("data-v3-scoreboard")).toBeLessThan(html.indexOf("ANALYSIS-SECRET"));
  });

  it("shows a truthful empty state before publication", async () => {
    const html = await renderScreen(
      <V3ResultsScreen
        input={{ ...input, publication: "hidden" }}
        countries={countries}
        hideSpoilers={false}
      />,
    );
    expect(html).toContain("No public result yet");
    expect(html).not.toContain(country.name);
    expect(html).not.toContain("ANALYSIS-SECRET");
  });

  it("does not fabricate a winner from a partial ranking without canonical rank one", async () => {
    const html = await renderScreen(
      <V3ResultsScreen
        input={{ ...input, rows: [{ ...input.rows[0], rank: 2 }] }}
        countries={countries}
        hideSpoilers={false}
      />,
    );
    expect(html).not.toContain(">Winner<");
    expect(html).toContain("Final ranking");
  });
});
