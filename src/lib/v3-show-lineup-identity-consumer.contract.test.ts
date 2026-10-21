import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  resolve(process.cwd(), "src/components/admin/ShowLineupWorkspace.tsx"),
  "utf8",
);

describe("Organizer Show Line-up contest identity cutover", () => {
  it("routes all contest-entity mutations through the governed server adapters", () => {
    expect(component).toContain("useServerFn(ensureGlobalContestEntity)");
    expect(component).toContain("useServerFn(executeCustomContestEntityOperation)");
    expect(component).toContain("await ensureGlobalIdentity({");
    expect(component).toContain("await executeCustomIdentity({");
    expect(component).not.toContain('from("contest_entities")');
  });

  it("keeps operation identity stable across ambiguous retries for the exact semantic request", () => {
    expect(component).toContain("const semanticKey = JSON.stringify({");
    expect(component).toContain("operationIdsRef.current.get(key) ?? crypto.randomUUID()");
    expect(component).toContain("contest-entity:global:ensure:${operationId}");
    expect(component).toContain("contest-entity:custom:${action}:${operationId}");
    expect(component).toContain("return { commandResult, operationKey: key }");
  });

  it("does not retire a custom create operation until membership and reconciliation settle", () => {
    expect(component).toContain("await addEntityToShow(entity);");
    expect(component).toContain("operationIdsRef.current.delete(operationKey);");
    expect(component).toContain("Canonical custom identity receipt did not include an entity id.");
  });

  it("binds destructive deletion to an explicit reason and typed reviewed identity", () => {
    expect(component).toContain("const reason = deleteCustomReason.trim()");
    expect(component).toContain(
      "deleteCustomConfirmation !== deleteCustomTarget.display_name",
    );
    expect(component).toContain('"delete",\n        deleteCustomTarget.id,\n        {},\n        reason');
    expect(component).toContain("Why should this edition-only identity be permanently removed?");
    expect(component).toContain("recent authentication when you commit");
  });

  it("keeps unrelated participant metadata writes outside this narrow identity cutover", () => {
    expect(component).toContain('supabase.from("participants")');
    expect(component).not.toContain('supabase.from("contest_entities")');
  });
});
