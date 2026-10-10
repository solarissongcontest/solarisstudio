import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 publication recovery contract", () => {
  it("reuses the canonical consequential-command recovery policy", () => {
    const publication = source(
      "src/routes/_authenticated/admin/publication/$slug.tsx",
    );

    expect(publication).toContain("resolveSolarisV6OperationRecovery");
    expect(publication).toContain(
      "stableOperationIdentity: Boolean(pendingRelease.operationId)",
    );
    expect(publication).toContain("if (next.shouldRefreshCanonical)");
    expect(publication).toContain("if (!next.keepOperationOpen)");
    expect(publication).toContain("setRecovery(next)");
  });

  it("preserves the same operation identity for outcome-unknown retries", () => {
    const publication = source(
      "src/routes/_authenticated/admin/publication/$slug.tsx",
    );

    expect(publication).toContain("const operationId = crypto.randomUUID()");
    expect(publication).toContain("\n        operationId,");
    expect(publication).toContain("idempotencyKey: operationId");
    expect(publication).toContain("operationId: pendingRelease.operationId");
    expect(publication).toContain("idempotencyKey: pendingRelease.idempotencyKey");
    expect(publication).toContain('"Retry same publication operation"');
    expect(publication).toContain("recovery?.allowSameIdentityRetry");
    expect(publication).toContain("recovery.outcomeUnknown");
  });

  it("fails stale edition scope before fresh authentication or publication write", () => {
    const publication = source(
      "src/routes/_authenticated/admin/publication/$slug.tsx",
    );

    const scopeIndex = publication.indexOf("validateEditionCommandScope");
    const authIndex = publication.indexOf("reauthenticateShowPublicationR3");
    const applyIndex = publication.indexOf("applyShowPublicationChange");

    expect(scopeIndex).toBeGreaterThanOrEqual(0);
    expect(scopeIndex).toBeLessThan(authIndex);
    expect(scopeIndex).toBeLessThan(applyIndex);
    expect(publication).toContain("{ status: 409 }");
  });
});
