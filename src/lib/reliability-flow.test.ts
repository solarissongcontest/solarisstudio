import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("archive readiness", () => {
  it("waits for any required query and reports any query error", () => {
    expect(archiveIsLoading(
      { isLoading: false, isError: false },
      { isLoading: true, isError: false },
    )).toBe(true);
    expect(archiveHasError(
      { isLoading: false, isError: false },
      { isLoading: false, isError: true },
    )).toBe(true);
  });

  it("does not render country missing states before the country directory settles", () => {
    const countryRoute = source("routes/countries/$code.tsx");
    expect(countryRoute.indexOf("archiveIsLoading(...archiveQueries)")).toBeLessThan(
      countryRoute.indexOf("if (!country)"),
    );

    const wiki = source("components/wiki/CountryWikiExperience.tsx");
    expect(wiki.indexOf("if (countriesQuery.isLoading)")).toBeLessThan(
      wiki.indexOf("if (!country)"),
    );
    expect(wiki).toContain("archivePartial");
  });

  it("keeps Televoting data access out of the primary browser auth session", () => {
    const client = source("integrations/televoting/client.ts");
    expect(client).toContain('storageKey: "solaris-televoting-data-only"');
    expect(client).toContain("persistSession: false");
    expect(client).toContain("autoRefreshToken: false");
    expect(client).toContain("detectSessionInUrl: false");
  });

  it("does not mount the organizer shell while access is still being checked", () => {
    const gate = source("components/admin/UnifiedServiceAdminGate.tsx");
    const checkingBranch = gate.slice(gate.indexOf('if (state !== "allowed")'), gate.indexOf("return <AdminShell>{children}"));
    expect(checkingBranch).not.toContain("<AdminShell>");
  });

  it("keeps the four participation services in one responsive navigator", () => {
    const shell = source("components/ParticipationServiceShell.tsx");
    for (const route of ["/confirmations", "/jury-voting", "/televoting", "/next-in-line"]) {
      expect(shell).toContain(`to="${route}"`);
    }
    expect(shell).toContain('aria-label="Participation services"');
    expect(source("routes/participate/index.tsx")).not.toContain("Revolutionary, apparently");
  });

  it("uses compact wiki article navigation instead of an always-open page marathon", () => {
    const wiki = source("components/wiki/CountryWikiExperience.tsx");
    expect(wiki).toContain('aria-label="Article contents"');
    expect(wiki).toContain("<details");
    expect(wiki).toContain('id="introduction"');
    expect(wiki).toContain("buildCountryWikiCustomSections");
    expect(wiki).toContain('<WikiArticleSection id="solaris-song-contest" title="Solaris Song Contest"');
    expect(wiki).toContain("Quick facts about ${country.name}");
    expect(wiki).toContain("IntersectionObserver");
  });
});
