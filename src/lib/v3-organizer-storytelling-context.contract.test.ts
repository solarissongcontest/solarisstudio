import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const storytelling = readFileSync("src/routes/_authenticated/admin/storytelling.tsx", "utf8");

describe("V3 Organizer Storytelling edition context", () => {
  it("never substitutes the newest edition for missing Organizer scope", () => {
    expect(storytelling).toContain("useAdminContext");
    expect(storytelling).toContain("const edition = editions.find((item) => item.id === editionId) ?? null");
    expect(storytelling).not.toContain("[...editions].sort");
    expect(storytelling).toContain("enabled: Boolean(resolvedEditionId)");
    expect(storytelling).toContain("will not substitute the newest or globally active edition");
  });

  it("clears stale editor state and rejects mutations after edition drift", () => {
    expect(storytelling).toContain("setItemTarget(null)");
    expect(storytelling).toContain("setManualOpen(false)");
    expect(storytelling).toContain("setConfirmAction(null)");
    expect(storytelling).toContain("[resolvedEditionId]");
    expect(storytelling).toContain("resolvedEditionId !== editionId");
    expect(storytelling).toContain("Edition context changed before the Storytelling command");
  });

  it("keeps Anniversary preview dormant when no exact edition is selected", () => {
    expect(storytelling).toContain("enabled: Boolean(resolvedEditionId) && view === 'anniversary'");
  });

  it("accepts Storytelling only after story.read ownership and cutover evidence are explicit", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "current-edition-storytelling",
    );
    expect(capability).toBeDefined();
    expect(capability?.ownerCapability).toBe("story.read");
    expect(capability?.migrationStatus).toBe("cutover");
  });
});
