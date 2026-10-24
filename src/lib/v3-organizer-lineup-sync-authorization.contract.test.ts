import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/admin-lineup.functions.ts"),
  "utf8",
);

const mutationStart = source.indexOf("export const addCountriesToShow");
const mutation = mutationStart >= 0 ? source.slice(mutationStart) : "";
const inputStart = source.indexOf("type AddCountriesInput");
const inputEnd = source.indexOf("type SyncTargetsInput");
const inputContract =
  inputStart >= 0 && inputEnd > inputStart ? source.slice(inputStart, inputEnd) : "";

describe("Organizer lineup-sync authorization boundary", () => {
  it("requires exact-edition entry.edit before crossing into service-role access", () => {
    const capabilityCheck = mutation.indexOf(
      'await requireSolarisCapabilityServer("entry.edit", data.editionId);',
    );
    const serviceRoleImport = mutation.indexOf(
      'await import("@/integrations/supabase/client.server")',
    );

    expect(mutationStart).toBeGreaterThanOrEqual(0);
    expect(capabilityCheck).toBeGreaterThanOrEqual(0);
    expect(serviceRoleImport).toBeGreaterThan(capabilityCheck);
    expect(mutation).not.toContain("requireSolarisOrganizerServer()");
  });

  it("keeps exact show-to-edition object scope validation after capability resolution", () => {
    expect(mutation).toContain('.from("shows")');
    expect(mutation).toContain('.eq("id", data.showId)');
    expect(mutation).toContain("show.edition_id !== data.editionId");
    expect(mutation).toContain("That show does not belong to this edition.");
  });

  it("does not accept browser-supplied actor identity", () => {
    expect(inputContract).toContain("editionId: string");
    expect(inputContract).toContain("showId: string");
    expect(inputContract).not.toMatch(/actorId|userId|organizerId/);
  });

  it("uses the canonical server capability resolver instead of role-name inference", () => {
    expect(source).toContain(
      'import { requireSolarisCapabilityServer } from "@/integrations/supabase/capabilities.server";',
    );
    expect(mutation).not.toMatch(/role\s*[!=]==?\s*["']/i);
  });
});
