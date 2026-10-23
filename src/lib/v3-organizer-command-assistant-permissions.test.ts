import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  filterSolarisAssistantCommandsByAccess,
  SOLARIS_ASSISTANT_COMMANDS,
  uniqueSolarisAssistantCapabilities,
  type SolarisAssistantCommand,
} from "./solaris-command-assistant";

const route = readFileSync(
  "src/routes/_authenticated/admin/command-assistant.tsx",
  "utf8",
);
const accessSource = readFileSync(
  "src/lib/solaris-command-assistant-access.ts",
  "utf8",
);

describe("Organizer Command Assistant permission-aware discovery", () => {
  it("uses only canonical Solaris capabilities in the command registry", () => {
    expect(
      SOLARIS_ASSISTANT_COMMANDS.find((command) => command.id === "entries-missing-song")
        ?.capability,
    ).toBe("entry.read_private");
    expect(JSON.stringify(SOLARIS_ASSISTANT_COMMANDS)).not.toContain('"entry.read"');
  });

  it("deduplicates capability checks before consulting authoritative access", () => {
    expect(uniqueSolarisAssistantCapabilities(SOLARIS_ASSISTANT_COMMANDS)).toEqual([
      "entry.read_private",
      "results.preview",
      "integrity.manage",
      "confirmation.manage",
      "edition.read",
    ]);
  });

  it("fails closed for missing, denied and unresolved capability evidence", () => {
    const commands: SolarisAssistantCommand[] = [
      {
        id: "edition",
        label: "Edition",
        description: "Edition",
        route: "/admin/operations",
        keywords: ["edition"],
        capability: "edition.read",
      },
      {
        id: "results",
        label: "Results",
        description: "Results",
        route: "/admin/results",
        keywords: ["results"],
        capability: "results.preview",
      },
    ];

    expect(filterSolarisAssistantCommandsByAccess(commands, undefined)).toEqual([]);
    expect(
      filterSolarisAssistantCommandsByAccess(commands, {
        "edition.read": true,
        "results.preview": false,
      }).map((command) => command.id),
    ).toEqual(["edition"]);
    expect(
      filterSolarisAssistantCommandsByAccess(commands, {
        "edition.read": true,
      }).map((command) => command.id),
    ).toEqual(["edition"]);
  });

  it("checks the current actor through the authoritative edition-scoped capability RPC", () => {
    expect(accessSource).toContain('name: "studio2_has_capability"');
    expect(accessSource).toContain("p_capability: capability");
    expect(accessSource).toContain("p_edition_id: editionId");
    expect(accessSource).toContain("Promise.all");
    expect(accessSource).toContain("uniqueSolarisAssistantCapabilities(commands)");
    expect(accessSource).not.toContain("user_roles");
    expect(accessSource).not.toContain("role ===");
  });

  it("binds permission evidence to the exact verified Organizer edition", () => {
    expect(route).toContain(
      'queryKey: ["command-assistant-access", resolvedEditionId]',
    );
    expect(route).toContain(
      "loadSolarisAssistantCapabilityAccess(SOLARIS_ASSISTANT_COMMANDS, resolvedEditionId)",
    );
    expect(route).toContain("enabled: Boolean(resolvedEditionId)");
    expect(route).toContain("filterSolarisAssistantCommandsByAccess");
  });

  it("does not build canonical explanations from unauthorized or unknown prompt matches", () => {
    expect(route).toContain("const hasAuthorizedPromptMatch = Boolean(prompt.trim()) && matches.length > 0;");
    expect(route).toContain("hasAuthorizedPromptMatch && projectionQuery.data");
    expect(route).toContain('title="No available command matched"');
    expect(route).toContain(
      "Commands outside your selected-edition access are not exposed through search results or explanations.",
    );
  });

  it("fails closed when capability verification cannot be completed", () => {
    expect(route).toContain('title="Could not verify command access"');
    expect(route).toContain(
      "Command Assistant fails closed when capability evidence is unavailable.",
    );
    expect(route).toContain("Commands stay hidden until access can be verified.");
  });

  it("does not add write authority to the read-only assistant", () => {
    expect(route).toContain("Read-only explanation");
    expect(route).toContain("cannot generate arbitrary SQL, bypass permissions or silently execute a write");
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".delete(");
  });
});
