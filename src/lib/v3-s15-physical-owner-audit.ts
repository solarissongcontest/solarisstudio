import { V3_VERIFIED_DOMAIN_TABLES } from "./v3-system-physical-audit";

export type V3SharedPhysicalTableContract = {
  table: string;
  owners: readonly string[];
  authority: string;
  reason: string;
};

/**
 * Physical table overlaps that are intentional architectural boundaries rather
 * than competing write authorities. Any newly duplicated table must be reviewed
 * and added here explicitly instead of becoming shared authority by accident.
 */
export const V3_SHARED_PHYSICAL_TABLE_CONTRACTS: readonly V3SharedPhysicalTableContract[] = [
  {
    table: "public.country_accounts",
    owners: ["account", "delegation"],
    authority: "account",
    reason: "Account identity is canonical; delegation reads the account-country ownership boundary.",
  },
  {
    table: "public.delegation_hod_assignments",
    owners: ["delegation", "membership"],
    authority: "delegation",
    reason: "Delegation owns HOD assignment truth; membership consumes it when resolving effective access.",
  },
  {
    table: "public.studio2_role_assignments",
    owners: ["membership", "permissions"],
    authority: "permissions",
    reason: "Permission Engine owns scoped role assignments; membership consumes the effective assignment boundary.",
  },
  {
    table: "public.country_media",
    owners: ["country-profile", "media"],
    authority: "media",
    reason: "Media owns asset lifecycle truth; country profile references approved country presentation assets.",
  },
  {
    table: "public.jury_voting_windows",
    owners: ["jury", "voting-configuration"],
    authority: "jury",
    reason: "Jury owns voting-window lifecycle; voting configuration consumes the effective window configuration.",
  },
  {
    table: "public.televoting_round_bindings",
    owners: ["televote", "voting-configuration"],
    authority: "televote",
    reason: "Televote owns round binding lifecycle; voting configuration consumes the effective binding.",
  },
  {
    table: "public.studio2_notice_receipts",
    owners: ["acknowledgement", "receipt"],
    authority: "acknowledgement",
    reason: "Acknowledgement owns notice-version recipient acknowledgement truth; receipt exposes the durable receipt view.",
  },
  {
    table: "public.studio2_edition_runtime",
    owners: ["edition", "live-show"],
    authority: "edition",
    reason: "Edition owns edition runtime lifecycle; Live Show consumes the shared runtime state for show operations.",
  },
  {
    table: "auth.users",
    owners: ["account", "identity"],
    authority: "identity",
    reason: "Supabase Auth identity is canonical; account state references the authenticated user identity.",
  },
  {
    table: "televoting.integrity_action_audit",
    owners: ["audit", "integrity"],
    authority: "integrity",
    reason: "Integrity writes the action evidence; audit owns its audit-history consumption and retention semantics.",
  },
] as const;

function sorted(values: readonly string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function validateV3PhysicalTableOwnership() {
  const failures: string[] = [];
  const ownerMap = new Map<string, string[]>();

  for (const [domain, tables] of Object.entries(V3_VERIFIED_DOMAIN_TABLES)) {
    for (const table of tables) {
      const owners = ownerMap.get(table) ?? [];
      owners.push(domain);
      ownerMap.set(table, owners);
    }
  }

  const contracts = new Map<string, V3SharedPhysicalTableContract>();
  for (const contract of V3_SHARED_PHYSICAL_TABLE_CONTRACTS) {
    if (contracts.has(contract.table)) {
      failures.push(`shared physical table contract duplicated: ${contract.table}`);
      continue;
    }
    contracts.set(contract.table, contract);

    const actualOwners = sorted(ownerMap.get(contract.table) ?? []);
    const declaredOwners = sorted(contract.owners);
    if (new Set(declaredOwners).size !== declaredOwners.length) {
      failures.push(`shared physical table contract repeats an owner: ${contract.table}`);
    }
    if (actualOwners.join("|") !== declaredOwners.join("|")) {
      failures.push(
        `shared physical table owner mismatch: ${contract.table} -> actual=${actualOwners.join(",") || "none"}; declared=${declaredOwners.join(",")}`,
      );
    }
    if (!contract.owners.includes(contract.authority)) {
      failures.push(`shared physical table authority is not an owner: ${contract.table} -> ${contract.authority}`);
    }
    if (!contract.reason.trim()) {
      failures.push(`shared physical table contract lacks reason: ${contract.table}`);
    }
  }

  for (const [table, owners] of ownerMap) {
    if (owners.length <= 1) continue;
    if (!contracts.has(table)) {
      failures.push(`physical table has multiple owners without boundary contract: ${table} -> ${sorted(owners).join(",")}`);
    }
  }

  for (const table of contracts.keys()) {
    if ((ownerMap.get(table) ?? []).length <= 1) {
      failures.push(`shared physical table contract is orphaned: ${table}`);
    }
  }

  return failures;
}
