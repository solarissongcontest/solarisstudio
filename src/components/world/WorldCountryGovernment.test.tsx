import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  mode: "verified" as "verified" | "rechecking" | "error" | "not-found",
  read: {
    country: {
      id: "00000000-0000-4000-8000-000000000001",
      code: "OL",
      name: "Oland",
      nativeName: "Ålanti",
      region: "Hydra",
      flagImage: null,
    },
    profile: {
      governmentType: "PUBLIC_GOVERNMENT_SENTINEL",
      leaderTitle: "President",
      leaderName: "Published leader",
      capital: "Tetlehamn",
      summary: null,
      updatedAt: "2026-11-04T12:00:00Z",
    },
    articles: [{
      id: "00000000-0000-4000-8000-000000000002",
      title: "Government",
      body: "PUBLIC_ARTICLE_SENTINEL",
    }],
    sectionsTruncated: false,
  },
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) =>
    <a href={to}>{children}</a>,
}));
vi.mock("@/lib/world-country-government-data", () => ({
  useCountryGovernment: () => ({
    data: mock.mode === "not-found" ? null : mock.read,
    isSuccess: mock.mode !== "error",
    isError: mock.mode === "error",
    isRefetchError: mock.mode === "error",
    isPending: false,
    isFetching: mock.mode === "rechecking",
    isFetchedAfterMount: true,
    refetch: vi.fn(),
  }),
}));

import { WorldCountryGovernmentScreen } from "./WorldCountryGovernment";

const render = (code = "OL") =>
  renderToStaticMarkup(<WorldCountryGovernmentScreen code={code} />);

beforeEach(() => { mock.mode = "verified"; });

describe("TG3 Government fail-closed public rendering", () => {
  it("renders published government facts and articles only after verification", () => {
    const html = render();
    expect(html).toContain("PUBLIC_GOVERNMENT_SENTINEL");
    expect(html).toContain("PUBLIC_ARTICLE_SENTINEL");
    expect(html).toContain("International memberships");
    expect(html.match(/<main/g)).toHaveLength(1);
  });

  it("hides old public content during a new publication recheck", () => {
    mock.mode = "rechecking";
    const html = render();
    expect(html).toContain("Verifying government profile");
    expect(html).not.toContain("PUBLIC_GOVERNMENT_SENTINEL");
    expect(html).not.toContain("PUBLIC_ARTICLE_SENTINEL");
  });

  it("hides old public content after a failed background recheck", () => {
    mock.mode = "error";
    const html = render();
    expect(html).toContain("Government profile unavailable");
    expect(html).not.toContain("PUBLIC_GOVERNMENT_SENTINEL");
    expect(html).not.toContain("PUBLIC_ARTICLE_SENTINEL");
  });

  it("does not reveal cached identities through malformed route codes", () => {
    const html = render("../OL");
    expect(html).toContain("Country not found");
    expect(html).not.toContain("PUBLIC_GOVERNMENT_SENTINEL");
  });

  it("shows a genuine missing country without inventing officeholders", () => {
    mock.mode = "not-found";
    const html = render();
    expect(html).toContain("Country not found");
    expect(html).not.toContain("Published leader");
  });

  it("keeps the route behind the canonical post-mount World rollout gate", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/world/countries/$code_.government.tsx"), "utf8");
    expect(route).toContain("WorldPublicGate verifyOnMount");
    const international = readFileSync(resolve(process.cwd(),
      "src/components/world/WorldCountryInternational.tsx"), "utf8");
    expect(international).toContain('to="/world/countries/$code/government"');
    const reader = readFileSync(resolve(process.cwd(),
      "src/lib/world-country-government-data.ts"), "utf8");
    expect(reader).toContain("queryFn: ({ signal }) => loadCountryGovernment(code, signal)");
    expect(reader).toContain("refetchOnMount: \"always\"");
    expect(reader).toContain("profileRequest.abortSignal(signal)");
    expect(reader).toContain("sectionRequest.abortSignal(signal)");
  });
});
