import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const delegations = readFileSync(
  "src/routes/_authenticated/admin/delegations.tsx",
  "utf8",
);

const privateQuery = delegations.slice(
  delegations.indexOf("const requirementsQuery = useQuery({"),
  delegations.indexOf("const summary = summarizeConfirmationRequirementAttention("),
);

describe("Organizer Delegations private projection freshness", () => {
  it("binds private confirmation requirements to actor and verified edition authorization", () => {
    expect(privateQuery).toContain('"confirmation-requirements"');
    expect(privateQuery).toContain("actorId,");
    expect(privateQuery).toContain('resolvedEditionId || "none"');
    expect(privateQuery).toContain("enabled: hasConfirmationRead,");
    expect(delegations).toContain("verifyOrganizerConfirmationRead(resolvedEditionId)");
  });

  it("does not reuse an inactive private obligation cache as current server truth", () => {
    expect(privateQuery).toContain("gcTime: 0,");
    expect(privateQuery).toContain('refetchOnMount: "always",');
    expect(privateQuery).toContain("staleTime: 20_000,");
  });

  it("hides potentially stale success and all-clear states throughout in-flight revalidation", () => {
    const pending = delegations.indexOf("requirementsQuery.isPending || requirementsQuery.isFetching");
    const failed = delegations.indexOf("requirementsQuery.isError", pending);
    const summary = delegations.indexOf("summary.needsAttention.length", pending);
    expect(pending).toBeGreaterThan(-1);
    expect(failed).toBeGreaterThan(pending);
    expect(summary).toBeGreaterThan(failed);
    expect(delegations).toContain("Confirmation requirement truth could not be loaded.");
  });
});
