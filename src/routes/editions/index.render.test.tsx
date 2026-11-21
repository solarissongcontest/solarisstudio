import { mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real route view and publication model with synthetic, networkless
// readers. These tests do not certify the surrounding shell or a hosted backend.
const fixture = vi.hoisted(() => ({
  presentation: "mobile-web",
  search: {} as Record<string, string>,
  query: { isSuccess: true, isFetching: false, isRefetchError: false, isError: false },
  countries: [{ id: "winner", name: "The Federated Republic of Long Country Names", short_code: "LC", accent_color: "#5268ac", flag_image: null }],
  editions: [
    { id: "current", slug: "ssc-22", name: "SSC 22", edition_number: 22, year: 2026, published: true, status: "active" },
    { id: "past", slug: "ssc-21", name: "SSC 21 — An Unusually Long Historical Contest Title", edition_number: 21, year: 2025, published: true, status: "completed" },
    { id: "private", slug: "secret", name: "Private edition", edition_number: 23, published: false },
  ],
  shows: [
    { id: "published-final", edition_id: "past", name: "Grand Final", kind: "grand-final", published: true, publication_config: { results: true }, sort_order: 1 },
    { id: "private-final", edition_id: "current", name: "Hidden final", kind: "grand-final", published: false, publication_config: { results: true }, sort_order: 1 },
  ],
  winners: [{ show_id: "published-final", country_id: "winner", final_rank: 1, total_points: 123 }],
  refetch: vi.fn(),
  readWinners: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useSearch: () => fixture.search, useNavigate: () => vi.fn() }),
  Link: ({ to, params, children, ...props }: { to: string; params: { slug: string }; children: ReactNode }) =>
    <a href={to.replace("$slug", params.slug)} {...props}>{children}</a>,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header>,
}));
vi.mock("@/components/app/AppRuntime", () => ({ useSolarisApp: () => ({ platformResolved: true, isAppMode: fixture.presentation === "installed-app" }) }));
vi.mock("@/lib/v3-directory-presentation", () => ({ useV3DirectoryPresentation: () => fixture.presentation }));
vi.mock("@/lib/data", () => ({
  editionLabel: (edition: { name: string }) => edition.name,
  useEditions: () => ({ data: fixture.editions }),
  useAllShows: () => ({ data: fixture.shows }),
  useCountries: () => ({ data: fixture.countries }),
}));
vi.mock("@/lib/public-final-winners", () => ({
  usePublicFinalWinners: (ids: string[]) => {
    fixture.readWinners(ids);
    return { ...fixture.query, data: fixture.winners, refetch: fixture.refetch };
  },
}));

import { Route } from "./index";

function render() {
  const Page = (Route as unknown as { options: { component: ComponentType } }).options.component;
  return renderToStaticMarkup(<Page />);
}

describe("published Editions rendering", () => {
  beforeEach(() => {
    fixture.presentation = "mobile-web";
    fixture.search = {};
    fixture.query = { isSuccess: true, isFetching: false, isRefetchError: false, isError: false };
    vi.clearAllMocks();
  });

  it("shows the public winner on mobile and reads only a published final", () => {
    const html = render();
    expect(html).toContain("123 pts");
    expect(html).toContain(fixture.countries[0].name);
    expect(html).not.toContain("Private edition");
    expect(html).not.toContain("Hidden final");
    expect(fixture.readWinners).toHaveBeenCalledWith(["published-final"]);
    expect(html).toContain('href="/editions/ssc-21"');
  });

  it.each([
    [{ isFetching: true }, "Checking published winner…"],
    [{ isRefetchError: true }, "Winner details temporarily unavailable"],
    [{ isError: true, isSuccess: false }, "Winner details temporarily unavailable"],
  ])("hides cached winners during verification or failed refresh: %j", (state, message) => {
    Object.assign(fixture.query, state);
    const html = render();
    expect(html).toContain(message);
    expect(html).not.toContain("123 pts");
    expect(html).not.toContain(fixture.countries[0].name);
  });

  it("offers a bounded retry outside edition links only for visible published results", () => {
    fixture.query.isRefetchError = true;
    expect(render()).toContain("Retry winner details");
    fixture.search = { scope: "latest" };
    expect(render()).not.toContain("Retry winner details");
  });

  it("restores scope and order from the URL without rendering excluded editions", () => {
    fixture.search = { scope: "past", order: "oldest" };
    const html = render();
    expect(html).toContain("SSC 21");
    expect(html).not.toContain('href="/editions/ssc-22"');
  });

  it.each(["mobile-web", "desktop-web", "installed-app"])("renders one composition for %s", (mode) => {
    fixture.presentation = mode;
    const html = render();
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain(`data-directory-experience="${mode}"`);
    expect(html.includes("v3-editions-timeline-link")).toBe(mode === "desktop-web");
    expect(html.includes("v3-editions-timeline-mobile-row")).toBe(mode === "mobile-web");
    expect(html.includes("solaris-app-edition-row")).toBe(mode === "installed-app");
    // Optional export for a local, no-network visual harness of the actual view.
    const output = process.env.SOLARIS_COMPONENT_EVIDENCE_DIR;
    if (output) {
      mkdirSync(output, { recursive: true });
      writeFileSync(`${output}/editions-${mode}.html`, html);
    }
  });
});
