import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/routes/_authenticated/admin/command-assistant.tsx",
  "utf8",
);
const commandRegistry = readFileSync(
  "src/lib/solaris-command-assistant.ts",
  "utf8",
);
const registry = readFileSync(
  "src/lib/v3-organizer-capability-registry.ts",
  "utf8",
);

describe("V3 Organizer Command Assistant edition context", () => {
  it("validates the selected Organizer edition before loading operational context", () => {
    expect(source).toContain('import { useEditions } from "@/lib/data";');
    expect(source).toContain("const editionsQuery = useEditions();");
    expect(source).toContain(
      "const selectedEdition = editionsQuery.data?.find((edition) => edition.id === editionId) ?? null;",
    );
    expect(source).toContain('const resolvedEditionId = selectedEdition?.id ?? "";');
    expect(source).toContain("useV3OrganizerProjection(resolvedEditionId || null)");
  });

  it("uses the canonical Organizer projection instead of parallel browser database reads", () => {
    expect(source).toContain("projectionQuery.data.readiness.overall");
    expect(source).toContain("projectionQuery.data.tasks.critical");
    expect(source).toContain("projectionQuery.data.attention.length");
    expect(source).toContain("projectionQuery.data.systemHealth.issueCount");
    expect(source).not.toContain("integrations/supabase");
    expect(source).not.toContain('.from("participants")');
    expect(source).not.toContain('.from("studio2_incidents")');
  });

  it("makes global-versus-edition command scope explicit", () => {
    expect(commandRegistry).toContain('scope: "global"');
    expect(commandRegistry).toContain('scope: "edition"');
    expect(commandRegistry).toContain("partitionSolarisAssistantCommandsByContext");
    expect(source).toContain(
      "partitionSolarisAssistantCommandsByContext(matches, Boolean(selectedEdition))",
    );
  });

  it("does not render edition-scoped matches as navigation before context is verified", () => {
    expect(source).toContain("commandContext.available.map");
    expect(source).toContain("commandContext.blockedByEdition.map");
    expect(source).toContain("Edition required");
    expect(source).toContain(
      "they are deliberately not links until the edition context is verified",
    );
  });

  it("distinguishes a stale stored edition from no edition selection", () => {
    expect(source).toContain("editionId && !selectedEdition");
    expect(source).toContain("Selected edition is unavailable");
    expect(source).toContain('onClick={() => setEditionId("")}');
    expect(source).toContain("Clear unavailable context");
    expect(source).toContain("Confirming edition context…");
  });

  it("explains blockers without executing a command", () => {
    expect(source).toContain("buildCommandAssistantInsight");
    expect(source).toContain('eyebrow="Canonical explanation"');
    expect(source).toContain("Read-only explanation");
    expect(source).toContain("cannot generate arbitrary SQL, bypass permissions or silently execute a write");
  });

  it("records Command Assistant as building without granting write authority", () => {
    expect(registry).toContain('id === "workspace-command-assistant"');
  });
});
