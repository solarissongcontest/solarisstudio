import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { buildV3CapabilityEvidenceIntegrityReport } from "./check-v3-capability-evidence-integrity";

const PUBLIC_PATHS = [
  "src/lib/v3-public-capability-registry.ts",
  "src/lib/v3-public-capability-supplements.ts",
] as const;
const ORGANIZER_PATH = "src/lib/v3-organizer-capability-registry.ts";

const PUBLIC_RANK = {
  discovered: 0,
  mapped: 1,
  specified: 2,
  building: 3,
  parity: 4,
  cutover: 5,
  retired: 6,
} as const;

const ORGANIZER_RANK = {
  planned: 0,
  building: 1,
  parity: 2,
  cutover: 3,
  retired: 4,
} as const;

type PublicStatus = keyof typeof PUBLIC_RANK;
type OrganizerStatus = keyof typeof ORGANIZER_RANK;
type Classification = "redesign" | "merge" | "contextualize" | "restrict" | "retire";
type Promotion = { surface: "public" | "organizer"; capabilityId: string; from: string; to: string };

function gitShow(ref: string, path: string) {
  return execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" });
}

function parsePublicStatuses(source: string) {
  const rows = new Map<string, PublicStatus>();
  let currentId: string | null = null;

  for (const line of source.split(/\r?\n/)) {
    const id = line.match(/^\s*id:\s*"([^"]+)"/);
    if (id) currentId = id[1];

    const status = line.match(
      /^\s*specificationStatus:\s*"(discovered|mapped|specified|building|parity|cutover|retired)"/,
    );
    if (status && currentId) {
      rows.set(currentId, status[1] as PublicStatus);
      currentId = null;
    }
  }

  return rows;
}

function organizerClassificationIds(source: string) {
  const start = source.indexOf("export const V3_ORGANIZER_CLASSIFICATION_BY_ID = {");
  const end = source.indexOf("} as const satisfies Record<string, V3MigrationClassification>", start);
  if (start < 0 || end < 0) throw new Error("Could not parse Organizer classification registry");

  const classifications = new Map<string, Classification>();
  const block = source.slice(start, end);
  for (const match of block.matchAll(
    /^\s*"([^"]+)":\s*"(redesign|merge|contextualize|restrict|retire)",?\s*$/gm,
  )) {
    classifications.set(match[1], match[2] as Classification);
  }
  return classifications;
}

function parseOrganizerStatuses(source: string) {
  const classifications = organizerClassificationIds(source);
  const statuses = new Map<string, OrganizerStatus>(
    [...classifications.keys()].map((id) => [id, "planned" as OrganizerStatus] as const),
  );

  const start = source.indexOf("function migrationStatusFor(id: string)");
  const end = source.indexOf("function targetRouteFor", start);
  if (start < 0 || end < 0) throw new Error("Could not parse Organizer migrationStatusFor implementation");
  const block = source.slice(start, end);

  for (const match of block.matchAll(
    /if\s*\(id\s*===\s*"([^"]+)"\)\s*return\s*"(planned|building|parity|cutover|retired)"\s*;/g,
  )) {
    statuses.set(match[1], match[2] as OrganizerStatus);
  }

  for (const match of block.matchAll(
    /if\s*\(([\s\S]*?)\)\s*\{\s*return\s*"(planned|building|parity|cutover|retired)"\s*;\s*\}/g,
  )) {
    const condition = match[1];
    const status = match[2] as OrganizerStatus;
    for (const id of condition.matchAll(/id\s*===\s*"([^"]+)"/g)) statuses.set(id[1], status);
  }

  return { statuses, classifications };
}

function comparePublic(baseSource: string, currentSource: string) {
  const errors: string[] = [];
  const promotions: Promotion[] = [];
  const before = parsePublicStatuses(baseSource);
  const after = parsePublicStatuses(currentSource);
  const currentClassifications = new Map<string, Classification>();
  let currentId: string | null = null;
  for (const line of currentSource.split(/\r?\n/)) {
    const id = line.match(/^\s*id:\s*"([^"]+)"/);
    if (id) currentId = id[1];
    const classification = line.match(/^\s*classification:\s*"(redesign|merge|contextualize|restrict|retire)"/);
    if (classification && currentId) currentClassifications.set(currentId, classification[1] as Classification);
  }

  for (const [id, from] of before) {
    const to = after.get(id);
    if (!to) {
      errors.push(`Public ${id}: capability row disappeared from the canonical registry; retain it and mark it retired instead`);
      continue;
    }
    if (from === "retired" && to !== "retired") {
      errors.push(`Public ${id}: retired is terminal, but status changed retired -> ${to}`);
      continue;
    }
    if (to === "retired" && currentClassifications.get(id) !== "retire") {
      errors.push(`Public ${id}: ${from} -> retired requires classification=retire`);
      continue;
    }
    if (PUBLIC_RANK[to] < PUBLIC_RANK[from]) {
      errors.push(`Public ${id}: backward status transition ${from} -> ${to} is forbidden`);
      continue;
    }
    if (PUBLIC_RANK[to] > PUBLIC_RANK[from] && PUBLIC_RANK[to] >= PUBLIC_RANK.parity) {
      promotions.push({ surface: "public", capabilityId: id, from, to });
    }
  }

  for (const [id, to] of after) {
    if (!before.has(id) && PUBLIC_RANK[to] >= PUBLIC_RANK.parity) {
      promotions.push({ surface: "public", capabilityId: id, from: "new", to });
    }
  }

  return { errors, promotions };
}

function compareOrganizer(baseSource: string, currentSource: string) {
  const errors: string[] = [];
  const promotions: Promotion[] = [];
  const before = parseOrganizerStatuses(baseSource);
  const after = parseOrganizerStatuses(currentSource);

  for (const [id, from] of before.statuses) {
    const to = after.statuses.get(id);
    if (!to) continue;
    if (from === "retired" && to !== "retired") {
      errors.push(`Organizer ${id}: retired is terminal, but status changed retired -> ${to}`);
      continue;
    }
    if (to === "retired" && after.classifications.get(id) !== "retire") {
      errors.push(`Organizer ${id}: ${from} -> retired requires classification=retire`);
      continue;
    }
    if (ORGANIZER_RANK[to] < ORGANIZER_RANK[from]) {
      errors.push(`Organizer ${id}: backward status transition ${from} -> ${to} is forbidden`);
      continue;
    }
    if (ORGANIZER_RANK[to] > ORGANIZER_RANK[from] && ORGANIZER_RANK[to] >= ORGANIZER_RANK.parity) {
      promotions.push({ surface: "organizer", capabilityId: id, from, to });
    }
  }

  for (const [id, to] of after.statuses) {
    if (!before.statuses.has(id) && ORGANIZER_RANK[to] >= ORGANIZER_RANK.parity) {
      promotions.push({ surface: "organizer", capabilityId: id, from: "new", to });
    }
  }

  return { errors, promotions };
}

function validatePromotionEvidence(promotions: Promotion[]) {
  if (!promotions.length) return [] as string[];
  const report = buildV3CapabilityEvidenceIntegrityReport();
  const evidenceByCapability = new Map(
    [...report.public, ...report.organizer].map(
      (row) => [`${row.surface}/${row.capabilityId}`, row] as const,
    ),
  );
  const errors: string[] = [];

  for (const promotion of promotions) {
    const key = `${promotion.surface}/${promotion.capabilityId}`;
    const evidence = evidenceByCapability.get(key);
    if (!evidence || evidence.statusIntegrityViolation) {
      const detail = !evidence
        ? "capability is absent from the live aggregate evidence registry"
        : evidence.missingRepositoryEvidence.length
          ? `missing repository evidence paths: ${evidence.missingRepositoryEvidence.join(", ")}`
          : "no machine-verifiable repository evidence path is declared";
      errors.push(
        `${promotion.surface === "public" ? "Public" : "Organizer"} ${promotion.capabilityId}: ` +
          `${promotion.from} -> ${promotion.to} cannot be accepted without exact-tree evidence (${detail})`,
      );
    }
  }

  return errors;
}

const baseRef = process.env.V3_STATUS_BASE_REF?.trim();
if (!baseRef) {
  process.stdout.write("V3 capability status transitions: SKIP (no V3_STATUS_BASE_REF supplied)\n");
  process.exit(0);
}

try {
  const basePublic = PUBLIC_PATHS.map((path) => gitShow(baseRef, path)).join("\n");
  const baseOrganizer = gitShow(baseRef, ORGANIZER_PATH);
  const currentPublic = PUBLIC_PATHS.map((path) => readFileSync(path, "utf8")).join("\n");
  const currentOrganizer = readFileSync(ORGANIZER_PATH, "utf8");
  const publicComparison = comparePublic(basePublic, currentPublic);
  const organizerComparison = compareOrganizer(baseOrganizer, currentOrganizer);
  const promotions = [...publicComparison.promotions, ...organizerComparison.promotions];
  const errors = [
    ...publicComparison.errors,
    ...organizerComparison.errors,
    ...validatePromotionEvidence(promotions),
  ];

  if (errors.length) {
    process.stderr.write(`V3 capability status transition guard failed:\n- ${errors.join("\n- ")}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `V3 capability status transitions: PASS against ${baseRef}; ` +
      `${promotions.length} final-state promotion(s) carried machine-verifiable exact-tree evidence\n`,
  );
} catch (error) {
  process.stderr.write(
    `V3 capability status transition guard could not prove history against ${baseRef}: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
