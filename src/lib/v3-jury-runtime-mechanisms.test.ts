import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { proveInternalMechanisms } from "./v3-s16-internal-mechanisms";
import type { V3S16CatalogEvidence } from "./v3-s16-mutation-authority";
const observed = JSON.parse(
  readFileSync(".github/fixtures/v3-jury-runtime-mechanisms.json", "utf8"),
) as V3S16CatalogEvidence;
const proved = (catalog: V3S16CatalogEvidence) =>
  proveInternalMechanisms(catalog).classifications.filter(
    (c) => c.proof === ".github/tests/v3-jury-runtime-mechanisms.sql",
  );
describe("Jury runtime mechanisms behind governed commands", () => {
  it("classifies six observed mechanisms and their four exact trigger attachments", () => {
    expect(proved(observed)).toHaveLength(6);
    expect(
      [...proveInternalMechanisms(observed).triggers].filter((t) => t.startsWith("jury:")),
    ).toHaveLength(4);
  });
  it("rejects external primitive execution and drift in the canonical score ancestor", () => {
    for (const mutation of ["acl", "ancestor"] as const) {
      const c = structuredClone(observed);
      const fn = c.functions.find(
        (f) =>
          f.name ===
          (mutation === "acl"
            ? "public.assign_jury_vote"
            : "public.studio2_apply_jury_vote_change"),
      )!;
      if (mutation === "acl") fn.executeRoles = [...fn.executeRoles, "service_role"];
      else fn.definitionHash = "0".repeat(32);
      expect(proved(c).some((p) => p.signature.startsWith("public.assign_jury_vote("))).toBe(false);
    }
  });
  it("does not bless a new peer caller or an unreviewed function body", () => {
    for (const mutation of ["caller", "body"] as const) {
      const c = structuredClone(observed);
      const fn = c.functions.find((f) => f.name === "public.clear_jury_point")!;
      if (mutation === "caller") fn.callers = [...fn.callers!, "unreviewed"];
      else fn.definitionHash = "0".repeat(32);
      expect(proved(c).some((p) => p.signature.startsWith("public.clear_jury_point("))).toBe(false);
    }
  });
  it("rejects a counter trigger reattached to other columns, timing or function", () => {
    const c = structuredClone(observed);
    const table = c.tables.find((t) => t.table === "public.jury_votes")!;
    table.triggerDefinitions = table.triggerDefinitions!.map((t) =>
      t.name === "studio2_jury_vote_touch_version" ? { ...t, definitionHash: "0".repeat(32) } : t,
    );
    expect(
      proveInternalMechanisms(c).triggers.has(
        "jury:public.jury_votes:studio2_jury_vote_touch_version",
      ),
    ).toBe(false);
  });
  it("rejects table/column mutation and forged operation-receipt access", () => {
    for (const name of [
      "public.jury_votes",
      "public.jury_ballot_submissions",
      "public.studio2_operation_receipts",
    ]) {
      const c = structuredClone(observed);
      const t = c.tables.find((t) => t.table === name)!;
      t.columnDmlGrants = [
        ...t.columnDmlGrants!,
        {
          role: "service_role",
          column: name.endsWith("receipts") ? "result" : "id",
          privilege: "UPDATE",
        },
      ];
      expect(proved(c).length).toBeLessThan(6);
    }
  });
  it("requires fixed search_path and owner for shared projection triggers", () => {
    const c = structuredClone(observed);
    c.functions.find(
      (f) => f.name === "private.studio2_jury_ballot_review_task_trigger",
    )!.searchPath = "public,pg_temp";
    expect(
      proved(c).some((p) => p.signature === "private.studio2_jury_ballot_review_task_trigger()"),
    ).toBe(false);
  });
  it("runs the semantic SQL proof on both migration paths and writer rehearsal", () => {
    const workflow = readFileSync(".github/workflows/v3-integrity-authority-chat5.yml", "utf8");
    expect(
      workflow.match(/--proof-file=\.github\/tests\/v3-jury-runtime-mechanisms\.sql/g),
    ).toHaveLength(2);
    expect(readFileSync(".github/scripts/v3-canonical-writer-rehearsal.sh", "utf8")).toContain(
      "--proof-file=.github/tests/v3-jury-runtime-mechanisms.sql",
    );
  });
  it("runs real independent sessions for same-operation and competing CAS requests", () => {
    const workflow = readFileSync(".github/workflows/v3-integrity-authority-chat5.yml","utf8");
    expect(workflow.match(/V3_VERIFICATION_TARGET=local python3.*v3-jury-concurrency.py/g)).toHaveLength(2);
  });

});
