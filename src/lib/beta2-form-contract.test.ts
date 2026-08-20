import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("public Beta 2.0 contract", () => {
  const sections = source("features/beta-test/sections.ts");
  const round = source("features/beta-test/sections-round-2.ts");
  const discovery = source("features/beta-test/sections-beta2-discovery.ts");
  const evaluation = source("features/beta-test/sections-beta2-evaluation.ts");
  const beta1Sections = source("features/beta-test/sections-beta1.ts");
  const route = source("routes/beta-test/index.tsx");
  const dashboard = source("routes/_authenticated/admin/beta2-feedback.tsx");
  const beta1Archive = source("routes/_authenticated/admin/beta1-feedback.tsx");
  const more = source("routes/_authenticated/admin/more.tsx");
  const palette = source("components/admin/AdminCommandPalette.tsx");
  const migration = source("../supabase/migrations/20260820162000_close_beta1_open_beta2.sql");

  it("uses a new form version and keeps old local drafts separate", () => {
    expect(sections).toContain('BETA_DRAFT_KEY = "solaris:public-beta-test:draft:v4"');
    expect(sections).toContain('BETA_SUBMITTED_KEY = "solaris:public-beta-test:submitted:v4"');
    expect(sections).toContain("BETA_FORM_VERSION = 4");
  });

  it("renders the full twenty-section Beta 2 plan", () => {
    expect(round).toContain("...beta2DiscoverySections");
    expect(round).toContain("...beta2EvaluationSections");
    expect((discovery.match(/title: "\d+\./g) ?? []).length).toBe(10);
    expect((evaluation.match(/title: "\d+\./g) ?? []).length).toBe(10);
    expect(route).toContain("Beta 2.0 has 20 sections");
  });

  it("tests the new country-account flows instead of only the old public analytics", () => {
    for (const phrase of [
      "Create your country account",
      "Find and edit your confirmation",
      "Understand My Solaris",
      "Edit your country page",
      "Find help",
    ]) {
      expect(discovery).toContain(phrase);
    }
    expect(discovery).toContain("Without using a recovery code");
    expect(discovery).toContain("Overview");
    expect(discovery).toContain("Page & media");
    expect(discovery).toContain("Entries");
  });

  it("carries the real Beta 1 weaknesses into the comparison", () => {
    expect(evaluation).toContain("only 5/11 found their target immediately");
    expect(evaluation).toContain("3/11 could not find a country's entries");
    expect(evaluation).toContain("4 testers wanted more explanation");
    expect(evaluation).toContain("7/11 explored only a little or not really");
    expect(evaluation).toContain("6/11 hit at least one visual problem");
  });

  it("keeps activity points neutral and validates forced priorities", () => {
    expect(route).toContain("Activity points reward the amount and usefulness of testing");
    expect(route).toContain("Choose exactly THREE areas Solaris should improve most before release.");
    expect(route).toContain("calculateActivityPoints");
  });

  it("archives Beta 1 instead of deleting or mixing its responses", () => {
    expect(migration).toContain("create table if not exists public.beta2_test_submissions");
    expect(migration).toContain("form_version = 4");
    expect(migration).toContain("return null");
    expect(migration).toContain("Closed Beta 1 archive");
    expect(migration).not.toContain("delete from public.beta_test_submissions");
    expect(migration).not.toContain("truncate");
    expect(beta1Sections).toContain("...betaSectionsCore");
    expect(beta1Sections).toContain("...betaSectionsExtra");
    expect(beta1Archive).toContain("beta1Sections");
    expect(beta1Archive).toContain('title="Beta 1 archive"');
  });

  it("keeps the current Beta 2 report beside the Beta 1 archive", () => {
    expect(more).toContain('to: "/admin/beta2-feedback"');
    expect(more).toContain('to: "/admin/beta1-feedback"');
    expect(palette).toContain('["Beta 2 feedback", "/admin/beta2-feedback"');
    expect(palette).toContain('["Beta 1 archive", "/admin/beta1-feedback"');
    expect(dashboard).toContain('title="Beta 2.0 feedback"');
    expect(dashboard).toContain('to="/admin/beta1-feedback"');
    expect(dashboard).toContain("Beta 1 weaknesses");
  });
});
