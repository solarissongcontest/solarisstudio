import { mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Synthetic reader states exercise the real view without network or database access.
const fixture = vi.hoisted(() => ({
  app: false, resolved: true, connectivity: "online",
  body: {} as Record<string, unknown>, offices: {} as Record<string, unknown>,
  directory: {} as Record<string, unknown>, queries: [] as Record<string, any>[],
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: Record<string, any>) => {
  fixture.queries.push(options);
  return options.queryKey[2] === "body-offices" ? fixture.offices
    : options.queryKey[2] === "bodies" ? fixture.directory : fixture.body;
} }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, search: _search, children, ...props }: {
    to: string; params: Record<string, string>; search?: unknown; children: ReactNode;
  }) => <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)} {...props}>{children}</a>,
}));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/app/AppRuntime", () => ({ useSolarisApp: () => ({
  platformResolved: fixture.resolved, isAppMode: fixture.app,
  connectivity: { status: fixture.connectivity, checkedAt: 123 },
}) }));
vi.mock("@/lib/terra-world-bodies-public", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/terra-world-bodies-public")>(),
  readPublicWorldBodies: vi.fn(), readPublicWorldBody: vi.fn(), readPublicBodyOffices: vi.fn(),
}));

import { WorldBodiesDirectory, WorldBodyDetails } from "./WorldBodiesPublic";
const organization = { id: "org", slug: "institution", shortName: "Institution", officialName: "Published Institution" };
const body = { id: "body", slug: "assembly", name: "Published Assembly", type: "assembly", status: "active", description: "Published description" };
const ready = { isSuccess: true, isFetchedAfterMount: true, isFetching: false, isPending: false, isError: false, refetch: vi.fn(), dataUpdatedAt: 42 };
const details = () => renderToStaticMarkup(<WorldBodyDetails slug="institution" bodySlug="assembly" />);
const directory = () => renderToStaticMarkup(<WorldBodiesDirectory slug="institution" />);

describe("World body publication rendering", () => {
  beforeEach(() => {
    fixture.app = false; fixture.resolved = true; fixture.connectivity = "online";
    fixture.queries = [];
    fixture.body = { ...ready, data: { organization, body } };
    fixture.offices = { ...ready, data: [{ id: "office", title: "Published Office", officeType: "chair" }] };
    fixture.directory = { ...ready, isPlaceholderData: false, data: { organization, bodies: [body], total: 1 } };
  });
  it("renders verified bodies and office definitions with canonical deep links", () => {
    expect(details()).toContain("Published Office");
    expect(details()).toContain("[overflow-wrap:anywhere]");
    expect(details()).toContain("min-w-0 max-w-2xl");
    expect(details()).toContain("private terms and unpublished appointments are excluded");
    expect(directory()).toContain('href="/world/organizations/institution/bodies/assembly"');
  });
  it.each(["offline", "degraded", "service-restricted"])("hides cached body and office records when %s", (status) => {
    fixture.connectivity = status;
    for (const render of [details, directory]) {
      const html = render();
      expect(html).not.toContain("Published Assembly");
      expect(html).not.toContain("Published Office");
    }
    expect(fixture.queries.every((query) => query.enabled === false)).toBe(true);
  });
  it.each([{ isFetching: true }, { isError: true, isSuccess: false }, { isFetchedAfterMount: false }])(
    "withholds cached publication snapshots during %j", (state) => {
      Object.assign(fixture.body, state); Object.assign(fixture.directory, state);
      expect(details()).not.toContain("Published Office");
      expect(details()).not.toContain("Published Assembly");
      expect(directory()).not.toContain("Published Assembly");
    },
  );
  it.each([{ isFetching: true }, { isError: true, isSuccess: false }, { isFetchedAfterMount: false }])(
    "withholds stale offices while preserving verified body during %j", (state) => {
      Object.assign(fixture.offices, state);
      expect(details()).toContain("Published Assembly");
      expect(details()).not.toContain("Published Office");
    },
  );
  it("retains search but hides placeholder rows during a filtered read", () => {
    fixture.directory.isPlaceholderData = true;
    fixture.directory.isFetching = true;
    expect(directory()).toContain('role="search"');
    expect(directory()).not.toContain("Published Assembly");
    expect(directory()).toContain("Updating public body results");
  });
  it("keeps installed composition separate and waits for platform resolution", () => {
    fixture.app = true;
    expect(details()).not.toContain("world-bodies-editorial");
    fixture.resolved = false;
    expect(details()).toContain("Opening Terra Solaris");
    expect(details()).not.toContain("Published Assembly");
  });
  it("renders truthful empty and failed office states", () => {
    fixture.offices.data = [];
    expect(details()).toContain("No active public offices");
    Object.assign(fixture.offices, { isError: true, isSuccess: false });
    expect(details()).toContain("Retry offices");
    expect(details()).not.toContain("No active public offices");
  });
  it("optionally exports actual component markup for isolated visual inspection", () => {
    const target = process.env.WORLD_BODY_VISUAL_DIR;
    if (!target) return;
    mkdirSync(target, { recursive: true });
    body.name = "Published Assembly for Institutions and International Representation";
    body.description = "LongPublishedInstitutionalRecord".repeat(12);
    fixture.offices.data = [{ id: "office", title: "LongPublishedOfficeDefinition".repeat(7), officeType: "chair" }];
    for (const app of [false, true]) {
      fixture.app = app;
      writeFileSync(`${target}/${app ? "app" : "web"}-detail.html`, details());
      writeFileSync(`${target}/${app ? "app" : "web"}-directory.html`, directory());
    }
  });
});
