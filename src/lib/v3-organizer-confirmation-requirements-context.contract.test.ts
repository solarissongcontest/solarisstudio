import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/confirmations/admin/requirements.tsx",
  "utf8",
);

describe("V3 Organizer Confirmation Requirements command boundary", () => {
  it("fails closed and discards pending R2 decisions when edition context changes", () => {
    expect(route).toContain("const { editionId } = useAdminContext();");
    expect(route).toContain("setPending(null);");
    expect(route).toContain("setReason(\"\");");
    expect(route).toContain("}, [editionId]);");
    expect(route).toContain("Organizer edition context changed before this confirmation requirement command");
  });

  it("checks the exact Organizer edition before opening and submitting a requirement command", () => {
    expect(route).toContain("next.requirement.editionId !== editionId");
    expect(route).toContain("pending.requirement.editionId !== editionId");
    expect(route).toContain("input.requirement.editionId !== input.organizerEditionId");
    expect(route).toContain("organizerEditionId: editionId");
    expect(route).toContain("editionId: input.organizerEditionId");
  });

  it("keeps mutation follow-up invalidation scoped to the edition that actually ran", () => {
    const materialization = readFileSync("src/components/admin/ConfirmationRequirementMaterializationControl.tsx", "utf8");
    expect(materialization).toContain("invalidateRequirementState(queryClient, reviewed.editionId)");
    expect(materialization).toContain('["confirmation-requirements", editionId]');
    expect(materialization).toContain('["organizer-tasks-v5", editionId]');
    expect(materialization).toContain('["organizer-task-count-v5", editionId]');
    expect(route).toContain('["confirmation-requirements", variables.organizerEditionId]');
  });
});
