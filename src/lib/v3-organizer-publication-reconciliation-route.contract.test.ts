import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "src/routes/_authenticated/admin/publication/$slug.tsx"),
  "utf8",
);
const lifecycle = fs.readFileSync(
  path.join(root, "src/lib/show-publication-lifecycle.ts"),
  "utf8",
);

describe("Organizer Publication uncertain-outcome reconciliation contract", () => {
  it("switches an ambiguous reviewed publication into reconciliation-only mode", () => {
    expect(route).toContain("const [reconciliationOnly, setReconciliationOnly] = useState(false)");
    expect(route).toContain("if (reconciliationOnly) {\n      await reconcilePendingRelease();\n      return;\n    }");
    expect(route).toContain(
      "onConfirm={reconciliationOnly ? reconcilePendingRelease : applyPendingRelease}",
    );
    expect(route).toContain('"Reconcile publication operation"');
    expect(route).toContain("No new publication mutation will be sent.");
  });

  it("does not demand a second R3 password challenge while only reconciling an existing operation", () => {
    expect(route).toContain(
      'pendingRelease.preview.riskClass === "R3" && !reconciliationOnly',
    );
    expect(route).toContain(
      '!reconciliationOnly && pendingRelease?.preview.riskClass === "R3" && !publicationPassword',
    );
    expect(route).toContain(
      'danger={!reconciliationOnly && pendingRelease?.preview.riskClass === "R3"}',
    );
  });

  it("keeps the unresolved operation review open instead of allowing it to disappear", () => {
    expect(route).toContain("if (reconciliationOnly) {");
    expect(route).toContain(
      'toast.error("Reconcile this publication operation before closing the review.")',
    );
  });

  it("uses only the actor-scoped operation ledger for uncertain recovery", () => {
    expect(route).toContain("reconcileShowPublicationChange({");
    expect(lifecycle).toContain('client.rpc("studio2_reconcile_operation"');
    expect(lifecycle).toContain('command !== "publication.show.change"');
    expect(lifecycle).toContain("receipt.operationId !== input.operationId");
    expect(lifecycle).toContain("receipt.showId !== input.preview.showId");
    expect(lifecycle).toContain("receipt.version !== input.preview.expectedVersion + 1");
  });

  it("prevents a second mutation for an operation identity already marked ambiguous", () => {
    const guard = lifecycle.indexOf(
      "if (ambiguousPublicationOperations.has(input.operationId))",
    );
    const mutation = lifecycle.indexOf(
      'await rpc(\n        "studio2_apply_show_publication_change"',
    );

    expect(guard).toBeGreaterThan(-1);
    expect(mutation).toBeGreaterThan(guard);
    expect(lifecycle.slice(guard, mutation)).toContain("reconcileShowPublicationChange");
  });

  it("keeps the protected Organizer publication surface out of indexing", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
  });
});
