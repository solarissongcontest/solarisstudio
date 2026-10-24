import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const guide = () => source("src/routes/guide/index.tsx");
const search = () => source("src/lib/v3-public-guide-search.ts");

describe("Public V3 P37 Guide & Help contract", () => {
  it("teaches the canonical V3 ownership model instead of a competing personal dashboard", () => {
    const route = guide();

    expect(route).toContain('to="/explore"');
    expect(route).toContain('to="/participate"');
    expect(route).toContain('to="/results"');
    expect(route).toContain('to="/me"');
    expect(route).toContain("Home</strong>");
    expect(route).toContain("Explore</strong>");
    expect(route).toContain("Participate</strong>");
    expect(route).toContain("Results</strong>");
    expect(route).toContain("Me</strong>");
    expect(route).not.toContain('to="/my-solaris"');
    expect(route).not.toContain("MySolaris is your HOD home base");
  });

  it("covers the canonical P37 help families", () => {
    const route = guide();

    expect(route).toContain('title: "Participating and voting"');
    expect(route).toContain('title: "Me and your account"');
    expect(route).toContain('title: "Predictions and Fantasy"');
    expect(route).toContain('title: "Results and analysis"');
    expect(route).toContain('title: "Rules, safety and more help"');
    expect(route).toContain('to="/rules"');
    expect(route).toContain('to="/predictions"');
  });

  it("provides accessible searchable help with an explicit no-result recovery path", () => {
    const route = guide();

    expect(route).toContain('type="search"');
    expect(route).toContain('id="guide-search"');
    expect(route).toContain('aria-live="polite"');
    expect(route).toContain("No matching help topic");
    expect(route).toContain("Clear search");
    expect(route).toContain('to="/site-directory"');
    expect(route).toContain("filterGuideSections(SECTIONS, query)");
  });

  it("keeps search presentation-only and free of browser-owned contest authority", () => {
    const controller = search();
    const route = guide();

    expect(controller).toContain("Search only narrows help content");
    expect(controller).not.toContain("Date.now");
    expect(controller).not.toContain("localStorage");
    expect(controller).not.toContain("sessionStorage");
    expect(route).not.toContain("@/integrations/supabase");
    expect(route).not.toContain("Date.now");
    expect(route).not.toContain("localStorage");
    expect(route).not.toContain("sessionStorage");
  });

  it("distinguishes personal Taste DNA from contest/country Voting DNA", () => {
    const route = guide();

    expect(route).toContain("Taste DNA is about <strong>your personal preference model</strong>");
    expect(route).toContain("Voting DNA is different");
  });
});
