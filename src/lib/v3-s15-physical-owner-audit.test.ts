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

  it("fails closed when a physical inventory domain is absent from the canonical System registry", () => {
    const findings = validateV3PhysicalTableOwnership({
      ...V3_VERIFIED_DOMAIN_TABLES,
      "shadow-writer": ["private.unregistered_table"],
    });
    expect(findings).toContain("physical domain is not a registered System owner: shadow-writer");
    // A unique table must also fail. Looking for overlaps alone would miss it.
    expect(findings.filter((finding) => finding.includes("shadow-writer"))).toHaveLength(1);
  });

  it("rejects unqualified or ambiguous table identities", () => {
    const findings = validateV3PhysicalTableOwnership({
      ...V3_VERIFIED_DOMAIN_TABLES,
      edition: [...V3_VERIFIED_DOMAIN_TABLES.edition, "editions"],
      account: [...V3_VERIFIED_DOMAIN_TABLES.account, "public .account"],
    });
    expect(findings).toContain("physical table is not schema-qualified: edition -> editions");
    expect(findings).toContain("physical table is not schema-qualified: account -> public .account");
  });

  it("rejects undocumented overlap by construction", () => {
    const owners = physicalOwners();
    const contracts = new Set(V3_SHARED_PHYSICAL_TABLE_CONTRACTS.map((item) => item.table));
    for (const [table, tableOwners] of owners) {
      if (tableOwners.length > 1) expect(contracts.has(table), table).toBe(true);
    }
  });
});
