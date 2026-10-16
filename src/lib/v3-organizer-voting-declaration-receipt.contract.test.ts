import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const service = readFileSync("src/lib/voting-declaration-admin.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261003200000_organisation_os_v5_voting_declaration_lifecycle.sql",
  "utf8",
);

describe("V3 Organizer voting declaration trust boundary", () => {
  it("binds invalidation preview identity to the requested preflight", () => {
    expect(service).toContain("preview.id !== preflightId");
    expect(service).toContain("preview returned evidence for a different declaration");
  });

  it("validates declaration and operation identity on non-replay receipts", () => {
    expect(service).toContain("id !== input.preview.id");
    expect(service).toContain('state !== "invalidated"');
    expect(service).toContain("version < input.preview.declarationVersion");
    expect(service).toContain("!alreadyApplied && operationId !== command.operationId");
    expect(service).toContain("receipt for a different operation");
  });

  it("preserves the server's intentional already-applied short circuit", () => {
    expect(migration).toContain("'alreadyApplied', true");
    expect(migration.indexOf("'alreadyApplied', true")).toBeLessThan(
      migration.indexOf("private.studio2_claim_operation"),
    );
    expect(service).toContain("operationId: string | null");
  });
});
