// No Supabase or network connections. Verify hashes and classify LOCAL recovery artifacts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

export function classifyStages(root, proof, expectedSha) {
  assert.match(proof.sourceSha, /^[a-f0-9]{40}$/);
  if (expectedSha) assert.equal(proof.sourceSha, expectedSha, 'Source SHA drift');
  for (const [key, value] of Object.entries({
    postgresVersion:'17.11',network:'none',portsPublished:false,
    productionMutation:false,productionAuthorized:false,
    productionBackupVerified:false,hostedEquivalenceCertified:false,
    s16FullCriticalWriterCertified:false,
    fullRecovered66CountryContestVerified:false,
    mediaStorageServiceVerified:false,
    confirmationPositiveLifecycleVerified:false,
    resultsCalculateReviewEventRehearsal:false
  })) assert.deepEqual(proof[key], value, 'Unqualified recovery claim: '+key);
  assert.equal(proof.orderedStages.length, 29);
  const stages = proof.orderedStages.map((stage, i) => {
    assert.equal(stage.order, i+1);
    assert.match(stage.sha256,/^[a-f0-9]{64}$/);
    assert.ok(stage.artifactPath.startsWith('ordered-recovery-sql/'));
    const f=path.resolve(root,stage.artifactPath);
    assert.ok(f.startsWith(path.resolve(root)+path.sep), 'Artifact path traversal');
    const bytes=fs.readFileSync(f);
    const digest=crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest,stage.sha256, 'Stage SHA-256 mismatch: '+stage.path);
    let category;
    if(stage.path.startsWith('scripts/')&&stage.path.endsWith('.mjs')) category='local_generator_not_sql';
    else if(stage.path.startsWith('/tmp/')&&stage.path.endsWith('.sql')) category='locally_emitted_sql_unqualified';
    else if(stage.path.startsWith('docs/v3/recovery-candidates/')&&stage.path.endsWith('.sql')) category='explicit_local_only_candidate';
    else if(stage.path.startsWith('supabase/migrations/')&&stage.path.endsWith('.sql')) category='historical_source_requires_live_effect_review';
    else throw Error('Unclassified file: '+stage.path);
    return {order:stage.order,sourcePath:stage.path,artifactPath:stage.artifactPath,sha256:digest,bytes:bytes.length,category,productionExecutable:false};
  });
  const categories=Object.fromEntries([...new Set(stages.map(s=>s.category))].sort().map(k=>[k,stages.filter(s=>s.category===k).length]));
  assert.deepEqual(categories,{
    explicit_local_only_candidate:4,
    historical_source_requires_live_effect_review:13,
    local_generator_not_sql:2,
    locally_emitted_sql_unqualified:10
  });
  return {schemaVersion:1,sourceSha:proof.sourceSha,observedProductionProject:proof.observedProductionProject,
    postgresVersion:proof.postgresVersion,network:proof.network,hashesVerified:true,stageCount:stages.length,
    categories,stages,hostedEquivalenceCertified:false,realBackupRestoreCertified:false,
    productionReplayAllowed:false};
}
if(process.argv[1]?.endsWith('/v3-s13-s16-stage-provenance.mjs')) {
  const root=process.argv[2]||'.';
  const proof=JSON.parse(fs.readFileSync(path.join(root,'observed-owner-recovery-proof.json'),'utf8'));
  const evidence=classifyStages(root,proof,process.env.REVIEWED_SHA||process.env.EXACT_SHA);
  fs.writeFileSync(path.join(root,'s13-s16-stage-provenance-classification.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  console.log('PASS: 29 immutable local stages classified; zero production-authorized stages');
}
