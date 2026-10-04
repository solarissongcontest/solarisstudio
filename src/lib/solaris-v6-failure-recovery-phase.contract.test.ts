import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 failure recovery phase", () => {
  const coverage = source("docs/solaris-v6/failure-recovery-coverage.yml");

  it("automates every V6-specific failure class without inventing outcome truth", () => {
    for (const id of [
      "ambiguous-response-after-command",
      "stale-concurrent-edit",
      "expired-authentication",
      "permission-revocation",
      "offline-official-mutation",
      "reconnect-reconciliation",
      "deferred-update-during-critical-work",
      "conflicting-edition-context",
      "interrupted-gesture",
    ]) {
      const start = coverage.indexOf(`- id: ${id}`);
      expect(start, id).toBeGreaterThanOrEqual(0);
      const next = coverage.indexOf("\n  - id:", start + 1);
      const block = coverage.slice(start, next < 0 ? coverage.length : next);
      expect(block, id).toContain("status: automated");
    }

    expect(coverage).toContain(
      "V6 recovery UI never guesses a consequential command outcome",
    );
  });

  it("inherits the full V5 mandatory failure-injection suite", () => {
    const v5 = source("docs/organisation-os-v5/failure-injection-coverage.yml");
    const matrix = source("docs/organisation-os-v5/completion-matrix.yml");

    expect(coverage).toContain(
      'extends: "docs/organisation-os-v5/failure-injection-coverage.yml"',
    );
    expect(matrix).toContain("mandatory_failure_cases: 17");
    expect(v5).not.toContain("status: partial");
  });

  it("uses the same stable-operation recovery policy across consequential V6 consumers", () => {
    const results = source("src/routes/_authenticated/admin/results.tsx");
    const publication = source(
      "src/routes/_authenticated/admin/publication/$slug.tsx",
    );
    const moderation = source(
      "src/routes/_authenticated/admin/community-moderation.tsx",
    );
    const system = source(
      "src/routes/_authenticated/admin/system-operations.tsx",
    );

    for (const consumer of [results, publication, moderation, system]) {
      expect(consumer).toContain("resolveSolarisV6OperationRecovery");
    }

    expect(results).toContain("stableOperationIdentity");
    expect(publication).toContain("stableOperationIdentity");
    expect(moderation).toContain("stableOperationIdentity");
    expect(system).toContain("stableOperationIdentity");
  });

  it("keeps offline reconnect update edition and gesture recovery fail-safe", () => {
    const offline = source("src/lib/app-launch-offline-reconnect.contract.test.ts");
    const update = source("src/lib/app-update-safety.ts");
    const edition = source("src/lib/solaris-v6-edition-context.ts");
    const publicTabs = source("src/components/app/AppTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(offline).toContain("official mutations");
    expect(update).toContain('id: "focused-participation-task"');
    expect(update).toContain('id: "organizer-workspace"');
    for (const route of ["confirmations", "jury-voting", "televoting", "next-in-line"]) {
      expect(update).toContain(route);
    }
    expect(update).toContain('pathname.startsWith("/admin/")');
    expect(edition).toContain("validateEditionCommandScope");
    expect(publicTabs).toContain("onPointerCancel");
    expect(organizerTabs).toContain("onPointerCancel");
  });
});
