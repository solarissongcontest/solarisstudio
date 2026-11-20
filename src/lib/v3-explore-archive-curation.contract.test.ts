import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const archive = readFileSync("src/routes/archive/index.tsx", "utf8");
const directory = readFileSync("src/components/v3/V3DirectoryFamilyIndex.tsx", "utf8");
const wiki = readFileSync("src/routes/wiki/index.tsx", "utf8");

describe("Explore historical Archive integrity and discovery", () => {
  it("groups published-history topics without inventing a second archive data source", () => {
    expect(archive).toContain('label: "Contests and broadcasts"');
    expect(archive).toContain('label: "Countries, music and stories"');
    expect(archive).toContain('label: "Reference and records"');
    expect(archive).toContain("V3DirectoryFamilyIndex");
    expect(archive).toContain("Current participation responsibilities belong in Participate");
    expect(archive).not.toContain('from "@/integrations/supabase/client"');
    expect(archive).not.toContain("useAllResults(");
    expect(archive).not.toContain("useAllJuryVotes(");
  });

  it("offers unique historical destinations with a separately gated P9 music catalogue", () => {
    const routes = [...archive.matchAll(/\bto: "(\/[^"]+)"/g)].map((m) => m[1]);
    expect(routes).toHaveLength(8);
    expect(new Set(routes).size).toBe(routes.length);
    expect(archive).toContain('to: "/wiki", group: "reference-results"');
    expect(archive).toContain('aliases: ["wiki", "encyclopedia", "country articles"');
    expect(wiki).toContain('<Navigate to="/encyclopedia"');
    expect(wiki).toContain("referenceRollout.data === true");
    expect(archive).toContain('title: "Songs & artists"');
    expect(archive).toContain('to: "/music", group: "countries-stories"');
    expect(directory).toContain("item.aliases");
    expect(directory).toContain("allows(item.to)");
  });

  it("retains independent release checks for each archive destination", () => {
    expect(directory).toContain("usePublicLaunchAvailability()");
    expect(directory).toContain("group.items.filter(item => allows(item.to))");
    expect(archive).toContain("Historical context stays historical");
    expect(archive).toContain("groups={GROUPS}");
  });
});
