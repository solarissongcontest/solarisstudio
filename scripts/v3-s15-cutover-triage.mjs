#!/usr/bin/env node
/**
 * Read-only S15 cutover ownership triage, NOT a cutover waiver or S16 certificate.
 * Consumes the unchanged exact-SHA S15 scanner artifact; never queries Supabase.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const CUTOVER = /^(PUBLIC|ORGANIZER)_CUTOVER_UNRESOLVED (.+):([^:\s]+)$/;
const PREFIX = /^(?:PUBLIC|ORGANIZER)_CUTOVER_UNRESOLVED(?:\s|$)/;
const OWNERS = Object.freeze({
  PUBLIC: "Chat 2 / Public",
  ORGANIZER: "Chat 3 / Organizer",
});

export function buildS15CutoverTriage(source, expectedSha) {
  if (!SHA.test(expectedSha)) throw new Error("An exact lowercase 40-character candidate SHA is required");
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("S15 source must be an object");
  }
  if (source.candidateSha !== expectedSha) {
    throw new Error("S15 inventory is not bound to the exact checked-out candidate");
  }
  if (!Number.isInteger(source.schemaVersion) || source.schemaVersion < 4) {
    throw new Error("S15 inventory lacks versioned physical ownership evidence");
  }
  if (typeof source.zeroOrphans !== "boolean" || !Array.isArray(source.findings)) {
    throw new Error("S15 inventory is missing authoritative readiness and findings");
  }
  if (!source.physicalOwnership || typeof source.physicalOwnership.zeroOwnershipConflicts !== "boolean") {
    throw new Error("S15 inventory is missing physical ownership status");
  }
  if (source.findings.some(item => typeof item !== "string" || !item.trim())) {
    throw new Error("S15 findings must be nonempty strings");
  }
  if (new Set(source.findings).size !== source.findings.length) {
    throw new Error("S15 evidence contains duplicate findings");
  }
  if (source.zeroOrphans && (source.findings.length !== 0 || !source.physicalOwnership.zeroOwnershipConflicts)) {
    throw new Error("S15 zeroOrphans claim contradicts inventory/physical ownership");
  }
  if (!source.zeroOrphans && source.findings.length === 0 && source.physicalOwnership.zeroOwnershipConflicts) {
    throw new Error("S15 not-ready claim contradicts empty inventory/physical ownership");
  }

  const cutovers = [];
  const structuralFindings = [];
  for (const finding of source.findings) {
    const match = finding.match(CUTOVER);
    if (!match) {
      if (PREFIX.test(finding)) throw new Error("Malformed S15 capability cutover finding: " + finding);
      structuralFindings.push(finding);
      continue;
    }
    const [, lane, capabilityId, registryStatus] = match;
    if (!capabilityId.trim() || /\s/.test(capabilityId)) {
      throw new Error("Malformed S15 capability ID: " + finding);
    }
    cutovers.push({
      lane: lane.toLowerCase(),
      owner: OWNERS[lane],
      capabilityId,
      registryStatus,
      sourceFinding: finding,
      decision: "unreviewed",
      dispositionEvidence: null,
    });
  }
  cutovers.sort((a,b)=>a.owner.localeCompare(b.owner)||a.capabilityId.localeCompare(b.capabilityId));
  const publicCount=cutovers.filter(x=>x.lane==="public").length;
  const organizerCount=cutovers.filter(x=>x.lane==="organizer").length;
  return {
    schemaVersion: 1,
    candidateSha: expectedSha,
    sourceEvidence: "v3-release-evidence/s15-zero-orphan.json",
    sourceSchemaVersion: source.schemaVersion,
    sourceZeroOrphans: source.zeroOrphans,
    physicalOwnershipConflictFree: source.physicalOwnership.zeroOwnershipConflicts,
    inventoryFindingCount: source.findings.length,
    cutoverCount: cutovers.length,
    publicCutoverCount: publicCount,
    organizerCutoverCount: organizerCount,
    structuralFindingCount: structuralFindings.length,
    structuralFindings,
    cutovers,
    reviewedCutovers: 0,
    certificationClaim: false,
    releaseCertified: false,
    allowsReleaseDeferral: false,
    allCutoversResolved: cutovers.length === 0,
  };
}

const mdSafe = value => String(value).replaceAll("|","/").replaceAll("\n"," ").replaceAll("\r"," ");
export function s15TriageMarkdown(report) {
  const lines=[
    "# S15 exact-SHA cutover triage (diagnostic, NOT release certification)",
    "",
    "Candidate: `"+report.candidateSha+"`",
    "",
    "- S15 source zero-orphans: **"+report.sourceZeroOrphans+"** (authoritative; not overridden)",
    "- Outstanding Public cutovers: **"+report.publicCutoverCount+"** (Chat 2 / Public)",
    "- Outstanding Organizer cutovers: **"+report.organizerCutoverCount+"** (Chat 3 / Organizer)",
    "- Structural findings: **"+report.structuralFindingCount+"**; physical ownership conflict-free: **"+report.physicalOwnershipConflictFree+"**",
    "- Every unresolved cutover remains **unreviewed**. No disposition or deferral is authorized by this report.",
    "- Final S15 zero-orphan and S16 certification gates remain mandatory.",
    "",
    "## Per-capability owner review queue",
    "",
    "| Owner lane | Capability ID | Registry status | Owner decision |",
    "| --- | --- | --- | --- |",
  ];
  for (const row of report.cutovers) {
    lines.push("| "+[row.owner,row.capabilityId,row.registryStatus,row.decision].map(mdSafe).join(" | ")+" |");
  }
  if (!report.cutovers.length) lines.push("| None | None | None | None |");
  lines.push("","## Other structural/unowned findings","",
    ...(report.structuralFindings.length?report.structuralFindings.map(x=>"- `"+x.replaceAll("`","'")+"`"):["- None"]),
    "","**This file is a read-only owner handoff, not proof of migration parity or a release waiver.**","");
  return lines.join("\n");
}

export function runCli(args=process.argv.slice(2)) {
  if (args.length !== 6 || args[0] !== "--input" || args[2] !== "--sha" || args[4] !== "--output-dir") {
    throw new Error("Usage: node scripts/v3-s15-cutover-triage.mjs --input <s15.json> --sha <sha> --output-dir <dir>");
  }
  const source=JSON.parse(readFileSync(resolve(args[1]),"utf8"));
  const report=buildS15CutoverTriage(source,args[3]);
  const dir=resolve(args[5]); mkdirSync(dir,{recursive:true});
  writeFileSync(resolve(dir,"s15-cutover-triage.json"),JSON.stringify(report,null,2)+"\n");
  writeFileSync(resolve(dir,"s15-cutover-triage.md"),s15TriageMarkdown(report));
  return report;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const r=runCli();
    process.stdout.write("S15 triage retained: "+r.cutoverCount+" unresolved cutovers, "+r.structuralFindingCount+" structural findings. No release certification.\n");
  } catch(error) { process.stderr.write("S15 triage error: "+String(error.message)+"\n"); process.exitCode=1; }
}
