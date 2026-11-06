import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/mysolaris/modules/MySolarisEntryModule.tsx"),
  "utf8",
);

describe("V3 MySolaris Entry private context", () => {
  it("never substitutes the viewing Organizer's own country when an inspection target is invalid", () => {
    expect(source).toContain("const organizerInspection = Boolean(access?.isOrganizer && targetCountryId)");
    expect(source).toContain("const country = organizerInspection ? organizerCountry : ownCountry");
    expect(source).not.toContain("const country = organizerCountry ?? ownCountry");
    expect(source).toContain("!organizerInspection");
  });

  it("keys participant Entry and Confirmation reads to the authenticated actor", () => {
    expect(source).toContain('queryKey: ["studio2-readiness-editions", actorId, country?.id ?? "none"]');
    expect(source).toMatch(/"studio2-entry-readiness",\s+actorId,\s+country\?\.id/);
    expect(source).toContain('queryKey: ["country-confirmation-access", "mysolaris-entry", actorId, ownCountry?.id ?? "none"]');
    expect(source).toContain("Boolean(actorId && ownCountry && !organizerInspection)");
    expect(source).toContain("Boolean(actorId && country?.id && editionId)");
  });

  it("cancels and evicts private Entry cache on actor or delegation changes", () => {
    expect(source).toContain("queryClient.cancelQueries({ queryKey })");
    expect(source).toContain("queryClient.removeQueries({ queryKey })");
    expect(source).toContain("}, [queryClient, actorId, country?.id, ownCountry?.id])");
  });

  it("distinguishes failed access from an empty entry", () => {
    expect(source).toContain("if (account.isError || featureQuery.isError)");
    expect(source).toContain("Entry access could not be verified");
    expect(source).toContain("Retry access check");
    expect(source).toContain("void account.refetch()");
  });
});
