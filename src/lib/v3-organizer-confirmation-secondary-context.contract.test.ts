import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const calendar = readFileSync("src/routes/confirmations/admin/calendar.tsx", "utf8");
const settings = readFileSync("src/routes/confirmations/admin/settings.tsx", "utf8");
const recovery = readFileSync("src/routes/confirmations/admin/recovery-codes.tsx", "utf8");
const scopedReads = readFileSync(
  "src/integrations/confirmations/scoped-admin-reads.ts",
  "utf8",
);

describe("V3 Organizer secondary Confirmation context guards", () => {
  it("keeps Calendar bound to exact Organizer context", () => {
    expect(calendar).toContain('editionRows.find((item) => item.id === organizerEditionId)?.id ?? ""');
    expect(calendar).not.toContain('item.status === "active"');
    expect(calendar).not.toContain("editionRows[0]");
    expect(calendar).toContain("Solaris will not load a globally active or first edition");
  });

  it("keeps Settings from substituting the globally active or first edition", () => {
    expect(settings).toContain('editions.find((edition) => edition.id === organizerEditionId) ?? null');
    expect(settings).not.toContain('edition.status === "active"');
    expect(settings).not.toContain("editions[0]");
    expect(settings).toContain("Edition locked");
  });

  it("loads recovery credentials only through the exact-edition server projection", () => {
    expect(recovery).toContain("const { editionId, editionLabel } = useAdminContext();");
    expect(recovery).toContain("loadConfirmationRecoveryCodesForEdition(editionId)");
    expect(recovery).toContain("No fallback request for all editions was attempted");
    expect(recovery).not.toContain("loadConfirmationRecoveryCodes()");
    expect(scopedReads).toContain('"admin_confirmation_recovery_codes_for_edition"');
    expect(scopedReads).toContain("_edition_id: exactEditionId");
    expect(scopedReads).not.toContain('rpc("admin_confirmation_recovery_codes")');
  });
});
