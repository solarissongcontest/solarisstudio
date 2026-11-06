import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildS15CutoverTriage, s15TriageMarkdown, runCli } from "./v3-s15-cutover-triage.mjs";

const sha="a".repeat(40);
const fixture=(findings=[],zeroOrphans=findings.length===0,conflictFree=true)=>({
  candidateSha:sha, schemaVersion:4, zeroOrphans, findings,
  inventory:{publicCapabilities:45,organizerCapabilities:80},
  physicalOwnership:{zeroOwnershipConflicts:conflictFree,schemaVersion:1},
});

test("retains every Public and Organizer cutover with owner and no implied waiver",()=>{
  const findings=[
    "ORGANIZER_CUTOVER_UNRESOLVED current-edition-voting:building",
    "PUBLIC_CUTOVER_UNRESOLVED entry:building",
    "PUBLIC_CUTOVER_UNRESOLVED results:parity",
  ];
  const r=buildS15CutoverTriage(fixture(findings),sha);
  assert.equal(r.cutoverCount,3);
  assert.equal(r.publicCutoverCount,2);
  assert.equal(r.organizerCutoverCount,1);
  assert.equal(r.inventoryFindingCount,3);
  assert.ok(r.cutovers.every(x=>x.decision==="unreviewed" && x.dispositionEvidence===null));
  assert.equal(r.allCutoversResolved,false);
  assert.equal(r.sourceZeroOrphans,false);
  assert.equal(r.certificationClaim,false);
  assert.equal(r.releaseCertified,false);
  assert.equal(r.allowsReleaseDeferral,false);
  const md=s15TriageMarkdown(r);
  for(const finding of ["entry","results","current-edition-voting"])assert.ok(md.includes(finding));
  assert.ok(md.includes("NOT release certification"));
});

test("never silently discards structural ownership findings",()=>{
  const r=buildS15CutoverTriage(fixture([
    "PUBLIC_CUTOVER_UNRESOLVED jury:building",
    "SYSTEM_COMMAND_ORPHAN z",
    "PHYSICAL_OWNERSHIP_CONFLICT missing table",
  ]),sha);
  assert.equal(r.cutoverCount,1);
  assert.equal(r.structuralFindingCount,2);
  assert.equal(r.structuralFindings[0],"SYSTEM_COMMAND_ORPHAN z");
  assert.ok(s15TriageMarkdown(r).includes("PHYSICAL_OWNERSHIP_CONFLICT"));
});

test("empty exact-SHA source remains diagnostic, not S16 certified",()=>{
  const r=buildS15CutoverTriage(fixture(),sha);
  assert.equal(r.cutoverCount,0);
  assert.equal(r.sourceZeroOrphans,true);
  assert.equal(r.releaseCertified,false);
  assert.equal(r.certificationClaim,false);
});

test("rejects stale/malformed/conflicting or falsely green inventories",()=>{
  for(const bad of [
    {...fixture(),candidateSha:"b".repeat(40)},
    {...fixture(),schemaVersion:3},
    {...fixture(),findings:["PUBLIC_CUTOVER_UNRESOLVED entry:building"]},
    {...fixture(["PUBLIC_CUTOVER_UNRESOLVED entry:building"]),findings:["PUBLIC_CUTOVER_UNRESOLVED entry:building","PUBLIC_CUTOVER_UNRESOLVED entry:building"]},
    fixture(["PUBLIC_CUTOVER_UNRESOLVED"]),
    fixture(["PUBLIC_CUTOVER_UNRESOLVED invalid-without-status"]),
    {...fixture(),physicalOwnership:null},
    {...fixture(),inventory:null},
    {...fixture(),findings:[null]},
  ]) {
    assert.throws(()=>buildS15CutoverTriage(bad,sha));
  }
  assert.throws(()=>buildS15CutoverTriage(fixture(),"short"));
});

test("retains real physical ownership conflicts as blockers, without inventing green S15",()=>{
  const r=buildS15CutoverTriage(fixture(["PUBLIC_CUTOVER_UNRESOLVED entry:building"],false,false),sha);
  assert.equal(r.sourceZeroOrphans,false);
  assert.equal(r.physicalOwnershipConflictFree,false);
  assert.equal(r.releaseCertified,false);
  assert.equal(r.cutoverCount,1);
});

test("retained JSON and Markdown bind to identical raw S15 source bytes",()=>{
  const dir=mkdtempSync(join(tmpdir(),"v3-s15-owner-triage-"));
  try {
    const input=join(dir,"s15.json");
    const output=join(dir,"reports");
    const raw=JSON.stringify(fixture(["PUBLIC_CUTOVER_UNRESOLVED entry:building"]),null,2)+"\\n";
    writeFileSync(input,raw,"utf8");
    const report=runCli(["--input",input,"--sha",sha,"--output-dir",output]);
    const expected=createHash("sha256").update(raw,"utf8").digest("hex");
    const retained=JSON.parse(readFileSync(join(output,"s15-cutover-triage.json"),"utf8"));
    const md=readFileSync(join(output,"s15-cutover-triage.md"),"utf8");
    assert.equal(report.sourceSha256,expected);
    assert.equal(retained.sourceSha256,expected);
    assert.equal(retained.candidateSha,sha);
    assert.equal(retained.cutoverCount,1);
    assert.equal(retained.releaseCertified,false);
    assert.ok(md.includes(expected));
    assert.ok(md.includes("entry"));
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
});

test("workflow uploads separate triage artifacts without weakening zero-orphan dispatch",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/v3-s15-zero-orphan-certification.yml",import.meta.url),"utf8");
  assert.ok(workflow.includes("scripts/build-v3-s15-zero-orphan-evidence.ts --require-zero"));
  assert.ok(workflow.includes('github.event_name == \'workflow_dispatch\''));
  assert.ok(workflow.includes("scripts/v3-s15-cutover-triage.mjs"));
  assert.ok(workflow.includes("scripts/v3-s15-cutover-triage.contract.mjs"));
  assert.ok(workflow.includes("s15-cutover-triage.json"));
  assert.ok(workflow.includes("s15-cutover-triage.md"));
  assert.ok(workflow.includes("if: always()"));
  assert.ok(!workflow.includes("continue-on-error: true"));
});
