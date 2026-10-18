import { describe, expect, it } from "vitest";
import { V3_VERIFIED_DOMAIN_TABLES } from "./v3-system-physical-audit";
import {
  V3_SHARED_PHYSICAL_TABLE_CONTRACTS,
  validateV3PhysicalTableOwnership,
} from "./v3-s15-physical-owner-audit";

function physicalOwners() {
  const owners = new Map<string, string[]>();
  for (const [domain, tables] of Object.entries(V3_VERIFIED_DOMAIN_TABLES)) {
    for (const table of tables) {
      const current = owners.get(table) ?? [];
      current.push(domain);
      owners.set(table, current);
    }
  }
  return owners;
}

describe("System V3 S15 physical ownership", () => {
  it("requires every current shared physical table to have one explicit boundary contract", () => {
    expect(validateV3PhysicalTableOwnership()).toEqual([]);

    const shared = [...physicalOwners()]
      .filter(([, owners]) => owners.length > 1)
      .map(([table]) => table)
      .sort();
    const contracted = V3_SHARED_PHYSICAL_TABLE_CONTRACTS.map((item) => item.table).sort();
    expect(contracted).toEqual(shared);
  });

  it("makes authority singular even when physical storage is shared", () => {
    for (const contract of V3_SHARED_PHYSICAL_TABLE_CONTRACTS) {
      expect(new Set(contract.owners).size).toBe(contract.owners.length);
      expect(contract.owners).toContain(contract.authority);
      expect(contract.owners.length).toBeGreaterThan(1);
      expect(contract.reason.trim().length).toBeGreaterThan(20);
    }
  });

  it("rejects undocumented overlap by construction", () => {
    const owners = physicalOwners();
    const contracts = new Set(V3_SHARED_PHYSICAL_TABLE_CONTRACTS.map((item) => item.table));
    for (const [table, tableOwners] of owners) {
      if (tableOwners.length > 1) expect(contracts.has(table), table).toBe(true);
    }
  });
});
