import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Confirmations sync browser boundary", () => {
  it("keeps the node-only reconciliation implementation out of the browser route", () => {
    const route = source("src/routes/confirmations/admin/sync.tsx");
    const wrapper = source("src/integrations/confirmations/sync-submission.functions.ts");

    expect(route).toContain(
      'from "@/integrations/confirmations/sync-submission.functions"',
    );
    expect(route).not.toContain(
      'from "@/integrations/confirmations/sync.functions"',
    );
    expect(wrapper).not.toContain('from "node:crypto"');
    expect(wrapper).toContain(
      'await import(\n      "@/integrations/confirmations/sync.functions"\n    )',
    );
  });

  it("syncs the authoritative server-side submission instead of trusting a browser snapshot", () => {
    const route = source("src/routes/confirmations/admin/sync.tsx");
    const wrapper = source("src/integrations/confirmations/sync-submission.functions.ts");

    expect(route).toContain("submissionId: row.id");
    expect(route).not.toContain("snapshotFromRow");
    expect(wrapper).toContain("syncConfirmationSubmissionToSolarisInternal(data.submissionId)");
    expect(wrapper).toContain("requireSolarisOrganizerServer");
  });

  it("gives the integrity declaration search an explicit accessible name", () => {
    const declarations = source("src/routes/televoting/admin/integrity-declarations.tsx");
    expect(declarations).toContain('aria-label="Search integrity declarations"');
  });
});
