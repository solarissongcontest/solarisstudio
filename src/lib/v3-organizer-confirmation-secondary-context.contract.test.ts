import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const calendar = readFileSync("src/routes/confirmations/admin/calendar.tsx", "utf8");
const settings = readFileSync("src/routes/confirmations/admin/settings.tsx", "utf8");
const recovery = readFileSync("src/routes/confirmations/admin/recovery-codes.tsx", "utf8");

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

  it("keeps recovery credentials fail-closed until the server supports edition scope", () => {
    expect(recovery).toContain("const { editionId, editionLabel } = useAdminContext();");
    expect(recovery).toContain("Edition-scoped Recovery Access requires a server update");
    expect(recovery).toContain("current legacy RPC does not accept an edition scope");
    expect(recovery).not.toContain("loadConfirmationRecoveryCodes");
  });
});
