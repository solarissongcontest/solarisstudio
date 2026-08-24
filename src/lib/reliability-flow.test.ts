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

  it("does not render country missing states before every archive query settles", () => {
    for (const path of ["routes/countries/$code.tsx", "routes/wiki/$code.tsx"]) {
      const route = source(path);
      expect(route.indexOf("archiveIsLoading(...archiveQueries)")).toBeLessThan(
        route.indexOf("if (!country)"),
      );
    }
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
    const wiki = source("routes/wiki/$code.tsx");
    expect(wiki).toContain('aria-label="Article contents"');
    expect(wiki).toContain("<details id={id}");
    expect(wiki).toContain('id="overview" className="wiki-article-lead');
    expect(wiki).toContain('<WikiSection id="culture" title="Country, culture and media">');
    expect(wiki).toContain('<WikiSection id="contest" title="Solaris Song Contest">');
    expect(wiki).toContain("Quick facts about {country.name}");
  });
});
