import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "src/routes/confirmations/admin/recovery-codes.tsx"), "utf8");
const rpc = readFileSync(resolve(process.cwd(), "src/integrations/confirmations/scoped-admin-reads.ts"), "utf8");

describe("V3 Confirmation Recovery Access exact-edition UI", () => {
  it("only calls the scoped server projection, never a global recovery read", () => {
    expect(route).toContain("loadConfirmationRecoveryCodesForEdition(editionId,");
    expect(route).not.toContain("admin_confirmation_recovery_codes(");
    expect(route).not.toContain("loadConfirmationRecoveryCodes()");
    expect(rpc).toContain('"admin_confirmation_recovery_codes_for_edition"');
  });
  it("fails closed on actor/edition change and inaccessible server projection", () => {
    expect(route).toContain("onAuthStateChange");
    expect(route).toContain("setRows([])");
    expect(route).toContain("setRevealedId(null)");
    expect(route).toContain("loadedEditionId !== editionId");
    expect(route).toContain("row.edition_id === editionId");
  });
  it("requires deliberate reveal, conceals in background and never logs secrets", () => {
    expect(route).toContain('document.visibilityState === "hidden"');
    expect(route).toContain("revealedId === row.id");
    expect(route).toContain("Recovery code copied");
    expect(route).not.toContain("console.log");
    expect(route).not.toContain("localStorage");
    expect(route).not.toContain("sessionStorage");
  });
});
