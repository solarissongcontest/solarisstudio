import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessS15ReleaseRisk, runCli } from "./v3-s15-release-risk-review.mjs";

const SHA = "a".repeat(40);
const SOURCE_RAW = JSON.stringify({
  candidateSha:SHA,
  findings:[
    "PUBLIC_CUTOVER_UNRESOLVED entry:building",
    "PUBLIC_CUTOVER_UNRESOLVED results:building",
    "ORGANIZER_CUTOVER_UNRESOLVED media:building",
  ],
  physicalOwnership:{zeroOwnershipConflicts:true},
})+"\n";
const SOURCE_DIGEST = createHash("sha256").update(SOURCE_RAW).digest("hex");
const row = (id, lane = "public") => ({
  lane, owner: lane === "public" ? "Chat 2 / Public" : "Chat 3 / Organizer",
  capabilityId:id, registryStatus:"building",
  sourceFinding:(lane === "public" ? "PUBLIC" : "ORGANIZER")+"_CUTOVER_UNRESOLVED "+id+":building",
  decision:"unreviewed", dispositionEvidence:null,
});
const triage = (cutovers = [row("entry"), row("results"), row("media", "organizer")]) => ({
  schemaVersion:1, candidateSha:SHA, sourceSha256:SOURCE_DIGEST,
  cutoverCount:cutovers.length, cutovers, structuralFindings:[],
  physicalOwnershipConflictFree:true, certificationClaim:false, releaseCertified:false,
});
const decision = (r, releaseRisk) => ({
  lane:r.lane, capabilityId:r.capabilityId, owner:r.owner,
  sourceFinding:r.sourceFinding, releaseRisk,
  reviewer:"named-owner", reason:"Detailed actual release scope assessment with supporting technical evidence.",
  evidenceUrls:["https://github.com/solarissongcontest/solarisstudio/issues/2203"],
});
const review = (decisions) => ({ schemaVersion:1, candidateSha:SHA, sourceS15Sha256:SOURCE_DIGEST, decisions });

test("S15 findings remain unreviewed unless owner decisions explicitly exist", () => {
  const r = assessS15ReleaseRisk(triage(),SHA,null,SOURCE_RAW);
  assert.equal(r.cutoverCount,3);
  assert.deepEqual(r.counts,{
    hardBlockers:0,conditionalBlockers:0,requiredConditionalBlockers:0,
    trackedV3Debt:0,obsoleteReplaced:0,unreviewed:3,
  });
  assert.equal(r.certificationClaim,false);
  assert.equal(r.releaseCertified,false);
  assert.equal(r.releaseDecision,"not_assessed");
});

test("records evidence-backed, typed release risks without clearing S15 cutovers", () => {
  const t = triage([row("a"),row("b"),row("c"),row("d")]);
  const decisions = [
    decision(t.cutovers[0],"hard_blocker"),
    {...decision(t.cutovers[1],"conditional_blocker"),
      releaseScope:"SSC23",requiredForRelease:false,featureDisabledOrUnreachable:true,
      cannotCorruptCanonicalState:true,exclusionEvidence:"Server flag disabled and route unreachable"},
    {...decision(t.cutovers[2],"tracked_v3_debt"),
      reviewBy:"2027-02-01",launchExclusionRationale:"Historical optional analytics only"},
    {...decision(t.cutovers[3],"obsolete_replaced"),
      replacementOrRetirement:"Replaced by canonical Results route"},
  ];
  const r=assessS15ReleaseRisk(t,SHA,review(decisions));
  assert.equal(r.counts.hardBlockers,1);
  assert.equal(r.counts.conditionalBlockers,1);
  assert.equal(r.counts.trackedV3Debt,1);
  assert.equal(r.counts.obsoleteReplaced,1);
  assert.equal(r.counts.unreviewed,0);
  assert.equal(r.cutoverCount,4);
  assert.equal(r.releaseCertified,false);
});

test("refuses unknown, duplicated, stale, owner-conflicting and weak reviewer claims", () => {
  const t=triage(), d=decision(t.cutovers[0],"hard_blocker");
  for (const bad of [
    review([{...d,capabilityId:"unknown"}]),
    review([d,d]),
    review([{...d,owner:"different"}]),
    review([{...d,releaseRisk:"waived"}]),
    review([{...d,reason:"ok"}]),
    review([{...d,evidenceUrls:[]}]),
    {...review([d]),candidateSha:"b".repeat(40)},
    {...review([d]),sourceS15Sha256:"b".repeat(64)},
  ]) assert.throws(()=>assessS15ReleaseRisk(t,SHA,bad,SOURCE_RAW));
});

test("conditional exclusions, debt and retirement cannot be silently waived", () => {
  const t=triage();
  assert.throws(()=>assessS15ReleaseRisk(t,SHA,review([
    {...decision(t.cutovers[0],"conditional_blocker"),requiredForRelease:false,releaseScope:"SSC23"}
  ]),SOURCE_RAW));
  assert.throws(()=>assessS15ReleaseRisk(t,SHA,review([
    decision(t.cutovers[0],"tracked_v3_debt")
  ]),SOURCE_RAW));
  assert.throws(()=>assessS15ReleaseRisk(t,SHA,review([
    decision(t.cutovers[0],"obsolete_replaced")
  ]),SOURCE_RAW));
});

test("rejects source evidence digests and preserves independent structural findings", () => {
  assert.throws(()=>assessS15ReleaseRisk(triage(),SHA,null,"changed source bytes"));
  const t={...triage(),structuralFindings:["CANONICAL_OWNER_MISSING critical"]};
  assert.equal(assessS15ReleaseRisk(t,SHA).structuralFindings.length,1);
  assert.throws(()=>assessS15ReleaseRisk({...t,releaseCertified:true},SHA));
});

test("forged derived S15 rows cannot change canonical lane, owner, capability or status", () => {
  const t=triage();
  for (const tampered of [
    {...t.cutovers[0], owner:"Unknown lane"},
    {...t.cutovers[0], lane:"organizer", owner:"Chat 3 / Organizer"},
    {...t.cutovers[0], capabilityId:"wrong"},
    {...t.cutovers[0], registryStatus:"verified"},
  ]) {
    const altered={...t,cutovers:[tampered,...t.cutovers.slice(1)]};
    assert.throws(()=>assessS15ReleaseRisk(altered,SHA,null,SOURCE_RAW),
      /cutover metadata contradicts canonical lane, owner or finding/);
  }
});

test("source-bound triage cannot omit findings while retaining a valid original digest", () => {
  const t=triage();
  t.cutovers=t.cutovers.slice(1);
  t.cutoverCount=2;
  assert.throws(()=>assessS15ReleaseRisk(t,SHA,null,SOURCE_RAW),
    /does not reproduce every canonical finding/);
});

test("CLI emits real read-only JSON and Markdown without owner decisions or Supabase", () => {
  const root=mkdtempSync(join(tmpdir(),"v3-s15-release-risk-"));
  try {
    writeFileSync(join(root,"triage.json"),JSON.stringify(triage())+"\n");
    writeFileSync(join(root,"s15.json"),SOURCE_RAW);
    const r=runCli(["--triage",join(root,"triage.json"),"--s15",join(root,"s15.json"),
      "--sha",SHA,"--output-dir",root]);
    assert.equal(r.counts.unreviewed,3);
    assert.equal(JSON.parse(readFileSync(join(root,"s15-release-risk-review.json"),"utf8")).releaseCertified,false);
    assert.match(readFileSync(join(root,"s15-release-risk-review.md"),"utf8"),/NOT release certification/);
  } finally {rmSync(root,{recursive:true,force:true})}
});
