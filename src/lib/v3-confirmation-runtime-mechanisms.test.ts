import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { proveInternalMechanisms } from "./v3-s16-internal-mechanisms";
import type { V3S16CatalogEvidence } from "./v3-s16-mutation-authority";
const observed = JSON.parse(
  readFileSync(".github/fixtures/v3-confirmation-runtime-mechanisms.json", "utf8"),
) as V3S16CatalogEvidence;
const proof = (c: V3S16CatalogEvidence) =>
  proveInternalMechanisms(c).classifications.filter(
    (x) => x.proof === ".github/tests/v3-confirmation-runtime-mechanisms.sql",
  );
describe("Confirmation runtime mechanism closure", () => {
  it("proves four internal mechanisms and every external ancestor from observed catalog evidence", () => {
    expect(proof(observed)).toHaveLength(4);
  });
  it("rejects direct service execution of the old bulk primitive", () => {
    const c = structuredClone(observed);
    const f = c.functions.find(
      (f) => f.name === "private.v3_reconcile_confirmation_requirements_core",
    )!;
    f.executeRoles = [...f.executeRoles, "service_role"];
    expect(
      proof(c).some((x) =>
        x.signature.startsWith("private.studio2_reconcile_confirmation_requirement("),
      ),
    ).toBe(false);
  });
  it("rejects an unreviewed ancestor or caller of requirement persistence", () => {
    const c = structuredClone(observed);
    const f = c.functions.find(
      (f) => f.name === "public.studio2_reconcile_confirmation_requirements",
    )!;
    f.definitionHash = "0".repeat(32);
    expect(
      proof(c).some((x) =>
        x.signature.startsWith("private.studio2_reconcile_confirmation_requirement("),
      ),
    ).toBe(false);
  });
  it("rejects caller-forged operation state through restored receipt writes", () => {
    const c = structuredClone(observed);
    const t = c.tables.find((t) => t.table === "public.studio2_operation_receipts")!;
    t.columnDmlGrants = [
      ...t.columnDmlGrants!,
      { role: "service_role", column: "result", privilege: "UPDATE" },
    ];
    expect(
      proof(c).some((x) =>
        x.signature.startsWith("private.studio2_reconcile_confirmation_requirement("),
      ),
    ).toBe(false);
  });
  it("rejects a round trigger changed to fire on different columns", () => {
    const c = structuredClone(observed);
    const t = c.tables.find((t) => t.table === "public.submissions")!;
    t.triggerDefinitions = t.triggerDefinitions!.map((d) =>
      d.name === "studio2_confirmation_submission_touch_round_version"
        ? { ...d, definitionHash: "0".repeat(32) }
        : d,
    );
    expect(
      proof(c).some((x) => x.signature === "private.studio2_touch_confirmation_round_version()"),
    ).toBe(false);
  });
  it("rejects raw requirement mutation or an unknown peer calling the invariant", () => {
    const c = structuredClone(observed);
    const f = c.functions.find(
      (f) => f.name === "private.studio2_reconcile_confirmation_requirement",
    )!;
    f.callers = [...f.callers!, "unknown-peer"];
    expect(proof(c).some((x) => x.signature === f.signature)).toBe(false);
    const d = structuredClone(observed);
    const t = d.tables.find((t) => t.table === "public.studio2_confirmation_requirements")!;
    t.dmlRoles = [...t.dmlRoles, "authenticated"];
    expect(proof(d).some((x) => x.signature === f.signature)).toBe(false);
  });
});
