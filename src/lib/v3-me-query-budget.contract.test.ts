import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const context = source("src/components/mysolaris/MySolarisContext.tsx");
const meRoute = source("src/routes/_authenticated/my-solaris/index.tsx");

describe("V3 Me MySolaris provider query budget", () => {
  it("uses the explicit edition scope as the identity-only V3 Me boundary", () => {
    expect(meRoute).toContain("<MySolarisProvider editionId={rollout.data.editionId}>");
    expect(context).toContain("includeParticipationContext = editionId === undefined");
  });

  it("keeps the current membership read available to Me", () => {
    expect(context).toContain('queryKey: [\n      "mysolaris-current-entry"');
    expect(context).toContain(
      "enabled: Boolean(userQuery.data && countryId && currentEdition?.id)",
    );
  });

  it("does not start participant task query families in identity-only mode", () => {
    expect(context).toContain(
      "enabled: Boolean(includeParticipationContext && userQuery.data)",
    );
    expect(context).toContain(
      "includeParticipationContext && userQuery.data && capabilities.official_communications",
    );
    expect(context).toContain(
      "enabled: Boolean(includeParticipationContext && userQuery.data && account?.country)",
    );
    expect(context).toContain(
      "includeParticipationContext &&\n        userQuery.data &&\n        account?.country &&\n        currentEdition?.id",
    );
  });

  it("cannot project cached participation tasks or overwrite attention with fake zeroes", () => {
    expect(context).toContain("const capabilities = includeParticipationContext");
    expect(context).toContain("const noticeSummary = includeParticipationContext");
    expect(context).toContain("includeParticipationContext\n        ? buildParticipationTasks");
    expect(context).toContain("if (!includeParticipationContext) return;");
  });

  it("preserves the full provider refresh contract for legacy and nested MySolaris consumers", () => {
    expect(context.match(/refetchInterval: 30_000/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(context.match(/refetchOnWindowFocus: true/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });
});
