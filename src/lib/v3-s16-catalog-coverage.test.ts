import { describe, expect, it } from "vitest";
import { requireV3S16CatalogTableCoverage } from "./v3-s16-catalog-coverage";

const expected = ["public.editions", "public.results", "auth.sessions"] as const;
const complete = expected.map((table) => ({ table, owner: "postgres" }));

describe("S16 local catalog critical-table completeness", () => {
  it("retains exact, complete evidence without changing its identity", () => {
    expect(requireV3S16CatalogTableCoverage(expected, complete)).toEqual(complete);
  });

  it("fails closed when pg_catalog returns null for a critical table", () => {
    expect(() => requireV3S16CatalogTableCoverage(expected, [complete[0], null, complete[2]]))
      .toThrow(/missing: public\.results/);
  });

  it("rejects a catalog row for another table even when the count matches", () => {
    expect(() => requireV3S16CatalogTableCoverage(expected, [complete[0], {
      table: "public.unrelated_table", owner: "postgres",
    }, complete[2]]))
      .toThrow(/mismatched identity: public\.results/);
  });

  it("rejects incomplete, duplicate or empty inventories rather than vacuous success", () => {
    expect(() => requireV3S16CatalogTableCoverage(expected, complete.slice(0, 2)))
      .toThrow(/returned 2 table rows for 3 required/);
    expect(() => requireV3S16CatalogTableCoverage(["public.editions", "public.editions"], [complete[0], complete[0]]))
      .toThrow(/nonempty, unique/);
    expect(() => requireV3S16CatalogTableCoverage([], [])).toThrow(/nonempty, unique/);
  });

  it("rejects malformed catalog identities rather than persisting them", () => {
    expect(() => requireV3S16CatalogTableCoverage(expected, [complete[0], {} as typeof complete[number], complete[2]]))
      .toThrow(/mismatched identity: public\.results/);
  });
});
