import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/routes/_authenticated/admin/command-assistant.tsx",
  "utf8",
);

describe("V3 Organizer Command Assistant edition context", () => {
  it("validates the selected Organizer edition before loading operational counts", () => {
    expect(source).toContain('import { useEditions } from "@/lib/data";');
    expect(source).toContain("const editionsQuery = useEditions();");
    expect(source).toContain(
      "const selectedEdition = editionsQuery.data?.find((edition) => edition.id === editionId) ?? null;",
    );
    expect(source).toContain('const resolvedEditionId = selectedEdition?.id ?? "";');
    expect(source).toContain(
      "enabled: feature.data === true && Boolean(resolvedEditionId)",
    );
    expect(source).toContain(
      '["command-assistant-snapshot", resolvedEditionId || "unscoped"]',
    );
  });

  it("keeps every live snapshot query inside the exact resolved edition", () => {
    expect(source).toContain("resolvedEditionId !== editionId");
    expect(source).toContain(
      'throw new Error("Command Assistant requires an exact Organizer edition context.")',
    );
    expect(source.match(/\.eq\("edition_id", resolvedEditionId\)/g)?.length).toBe(4);
    expect(source).not.toContain('.eq("edition_id", editionId)');
  });

  it("fails closed instead of presenting stale scope as an empty edition", () => {
    expect(source).toContain('title="Choose an edition"');
    expect(source).toContain(
      "Command Assistant will not turn a missing or stale edition into an all-editions query or a misleading zero-state summary.",
    );
    expect(source).toContain("Confirming edition context…");
  });
});
