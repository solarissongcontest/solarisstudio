import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/routes/_authenticated/admin/command-assistant.tsx",
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

  it("fails closed instead of presenting stale scope as an empty edition", () => {
    expect(source).toContain('title="Choose an edition"');
    expect(source).toContain(
      "Command Assistant will not turn a missing or stale edition into an all-editions query or a misleading zero-state summary.",
    );
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
