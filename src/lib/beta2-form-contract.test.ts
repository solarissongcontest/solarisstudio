import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

describe("public beta archives and Beta 3 contract", () => {
  const sections = source("features/beta-test/sections.ts");
  const beta3 = source("features/beta-test/sections-beta3-navigation.ts");
  const beta2Round = source("features/beta-test/sections-round-2.ts");
  const beta2Discovery = source("features/beta-test/sections-beta2-discovery.ts");
  const beta2Evaluation = source("features/beta-test/sections-beta2-evaluation.ts");
  const beta1Sections = source("features/beta-test/sections-beta1.ts");
  const route = source("routes/beta-test/index.tsx");
  const beta3Dashboard = source("routes/_authenticated/admin/beta3-feedback.tsx");
  const beta2Dashboard = source("routes/_authenticated/admin/beta2-feedback.tsx");
  const beta1Archive = source("routes/_authenticated/admin/beta1-feedback.tsx");
  const more = source("routes/_authenticated/admin/more.tsx");
  const adminNavigation = source("components/admin/admin-navigation.ts");
  const beta2Migration = source("../supabase/migrations/20260820162000_close_beta1_open_beta2.sql");
  const beta3Migration = source("../supabase/migrations/20260919121500_beta3_navigation_feedback.sql");

  it("uses a dedicated Beta 3 form version and local draft namespace", () => {
    expect(sections).toContain('BETA_DRAFT_KEY = "solaris:public-beta-test:draft:v5"');
    expect(sections).toContain('BETA_SUBMITTED_KEY = "solaris:public-beta-test:submitted:v5"');
    expect(sections).toContain("BETA_FORM_VERSION = 5");
    expect(sections).toContain("beta3NavigationSections");
    expect(route).toContain('"Beta 3 — Solaris Studio"');
    expect(route).toContain('from("beta3_test_submissions" as never)');
  });

  it("runs the planned task-based navigation study", () => {
    for (const task of [
      "Find an old edition winner",
      "Find a country's entry in a specific edition",
      "Find detailed jury scores",
      "Compare two countries",
      "Change a result scenario",
      "Find the current confirmation",
      "Find jury voting",
      "Check whether a planned entry is allowed",
      "Report a concern",
      "Appeal a decision",
      "Explore your voting taste",
      "Find your country editing tools",
    ]) {
      expect(beta3).toContain(task);
    }
    expect(beta3).toContain("BETA3_RELEASE_GATES");
    expect(route).toContain("completePublicUxBetaTask");
    expect(route).toContain("navigation and findability test");
  });

  it("keeps Beta 2 questionnaire and dashboard frozen for comparison", () => {
    expect(beta2Round).toContain("...beta2DiscoverySections");
    expect(beta2Round).toContain("...beta2EvaluationSections");
    expect((beta2Discovery.match(/title: "\d+\./g) ?? []).length).toBe(10);
    expect((beta2Evaluation.match(/title: "\d+\./g) ?? []).length).toBe(10);
    expect(beta2Dashboard).toContain("betaSectionsRound2 as betaSections");
    expect(beta2Dashboard).toContain('title="Beta 2.0 feedback"');
    expect(beta2Migration).toContain("create table if not exists public.beta2_test_submissions");
    expect(beta2Migration).toContain("form_version = 4");
  });

  it("keeps Beta 1 archived instead of deleting or mixing responses", () => {
    expect(beta2Migration).toContain("Closed Beta 1 archive");
    expect(beta2Migration).not.toContain("delete from public.beta_test_submissions");
    expect(beta2Migration).not.toContain("truncate");
    expect(beta1Sections).toContain("...betaSectionsCore");
    expect(beta1Sections).toContain("...betaSectionsExtra");
    expect(beta1Archive).toContain("beta1Sections");
    expect(beta1Archive).toContain('title="Beta 1 archive"');
  });

  it("persists Beta 3 separately with RLS and organizer-only reads", () => {
    expect(beta3Migration).toContain("create table if not exists public.beta3_test_submissions");
    expect(beta3Migration).toContain("enable row level security");
    expect(beta3Migration).toContain('form_version = 5');
    expect(beta3Migration).toContain('to anon, authenticated');
    expect(beta3Migration).toContain(
      "public.studio2_access_allowed('rollout.manage', null, false)",
    );
    expect(beta3Migration).not.toContain("security definer");
  });

  it("exposes Beta 3 evidence without replacing historical dashboards", () => {
    expect(more).toContain('to: "/admin/beta3-feedback"');
    expect(more).toContain('to: "/admin/beta2-feedback"');
    expect(more).toContain('to: "/admin/beta1-feedback"');
    expect(adminNavigation).toContain('"Beta 3 feedback",');
    expect(adminNavigation).toContain('"/admin/beta3-feedback"');
    expect(beta3Dashboard).toContain('title="Beta 3 navigation"');
    expect(beta3Dashboard).toContain('to="/admin/public-ux"');
  });
});
