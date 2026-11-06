import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const context = source("src/components/mysolaris/MySolarisContext.tsx");
const meRoute = source("src/routes/_authenticated/my-solaris/index.tsx");

describe("V3 Me identity-only query budget", () => {
  it("selects identity-only context for the canonical explicit-edition Me root", () => {
    expect(meRoute).toContain("<MySolarisProvider editionId={rollout.data.editionId}>");
    expect(context).toContain("includeParticipationContext = editionId === undefined");
  });

  it("retains actor/edition/delegation scoped current membership reads", () => {
    expect(context).toContain('queryKey: ["mysolaris-current-entry", userId, currentEdition?.id ?? "none", countryId ?? "none"]');
    expect(context).toContain("enabled: Boolean(userQuery.data && countryId && currentEdition?.id)");
  });

  it("does not issue secondary task, notice, capability, confirmation or jury requests in identity-only mode", () => {
    expect(context).toContain("enabled: Boolean(includeParticipationContext && userQuery.data)");
    expect(context).toContain("includeParticipationContext && userQuery.data && capabilities.official_communications");
    expect(context).toContain("enabled: Boolean(includeParticipationContext && userQuery.data && account?.country)");
    expect(context).toContain("includeParticipationContext &&\n        userQuery.data &&\n        account?.country");
  });

  it("does not display stale cached tasks as a new identity-only projection or write fake badge zeroes", () => {
    expect(context).toContain("const capabilities = includeParticipationContext");
    expect(context).toContain("const noticeSummary = includeParticipationContext && noticesQuery.data");
    expect(context).toContain("includeParticipationContext\n        ? buildParticipationTasks");
    expect(context).toContain("if (!includeParticipationContext) return;");
  });

  it("does not poll current membership unnecessarily from the V3 Me root", () => {
    expect(context).toContain("refetchInterval: includeParticipationContext ? 30_000 : false");
    expect(context).toContain("refetchOnWindowFocus: includeParticipationContext");
  });
});
