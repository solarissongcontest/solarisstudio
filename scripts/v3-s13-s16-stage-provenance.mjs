// Solaris Studio S13–S16: classify the exact networkless, synthetic recovery artifact.
// Rehash all 29 stages. Does not access production or emit deployable SQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

export function classifyStages(root, proof, expectedSha) {
  assert.match(proof.sourceSha, /^[a-f0-9]{40}$/);
  if(expectedSha) assert.equal(proof.sourceSha,expectedSha,'Source SHA drift');
  if(proof.observedProductionProject!==undefined) assert.equal(proof.observedProductionProject,'dkxmnvekiopyesuzggeu');
  assert.equal(proof.postgresVersion,'17.11');
  assert.equal(proof.network,'none');
  assert.equal(proof.portsPublished,false);
  for(const flag of ['productionMutation','productionAuthorized','hostedEquivalenceCertified',
    'productionBackupVerified','s16FullCriticalWriterCertified',
    'fullRecovered66CountryContestVerified','mediaStorageServiceVerified',
    'confirmationPositiveLifecycleVerified','resultsCalculateReviewEventRehearsal']) {
    assert.equal(proof[flag],false,'Do not classify unproven production recovery as complete: '+flag);
  }
  assert.equal(proof.orderedStages.length,29);
  const dir=fs.realpathSync(root);
  const stages=proof.orderedStages.map((entry,i)=>{
    assert.equal(entry.order,i+1);
    assert.match(entry.sha256,/^[a-f0-9]{64}$/);
    assert.match(entry.artifactPath,/^ordered-recovery-sql\/[0-9]{2}-[a-zA-Z0-9_.-]+$/);
    const p=path.resolve(dir,entry.artifactPath);
    assert.ok(p.startsWith(dir+path.sep),'Archive path traversal');
    const real=fs.realpathSync(p);
    assert.ok(real.startsWith(dir+path.sep),'Stage content escapes isolated artifact root');
    assert.equal(fs.lstatSync(p).isFile(),true,'Stage must be an ordinary file');
    const bytes=fs.readFileSync(p);
    const sha=crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha,entry.sha256,'Stage SHA-256 mismatch: '+entry.path);
    let classification;
    if(entry.path.startsWith('scripts/')&&entry.path.endsWith('.mjs'))
      classification='local_generator_not_sql';
    else if(entry.path.startsWith('/tmp/')&&entry.path.endsWith('.sql'))
      classification='local_emitted_candidate_unqualified';
    else if(entry.path.startsWith('docs/v3/recovery-candidates/')&&entry.path.endsWith('.sql'))
      classification='explicit_local_recovery_candidate';
    else if(entry.path.startsWith('supabase/migrations/')&&entry.path.endsWith('.sql'))
      classification='historical_source_requires_live_effect_review';
    else throw Error('Unreviewed stage source: '+entry.path);
    return {order:i+1,sourcePath:entry.path,archivePath:entry.artifactPath,sha256:sha,
      byteLength:bytes.length,classification,productionExecutable:false};
  });
  const counts=Object.fromEntries([...new Set(stages.map(x=>x.classification))].sort()
    .map(k=>[k,stages.filter(x=>x.classification===k).length]));
  assert.deepEqual(counts,{
    explicit_local_recovery_candidate:4,historical_source_requires_live_effect_review:13,
    local_emitted_candidate_unqualified:10,local_generator_not_sql:2
  },'Stage categories shifted; review actual proof instead of widening release');
  return {schemaVersion:1,sourceSha:proof.sourceSha,
    observedProductionProject:proof.observedProductionProject,postgresVersion:proof.postgresVersion,
    networkMode:proof.network,portsPublished:proof.portsPublished,
    artifactScope:'Synthetic networkless PostgreSQL 17.11 observed-owner recovery; NOT restored 15-Nov real backup',
    stages,counts,stageCount:29,verifiedStageHashes:29,productionExecutableStageCount:0,
    backupRestorationCertified:false,hostedEquivalenceCertified:false,
    productionMigrationAuthorized:false,productionMutation:false};
}

if(process.argv[1]?.endsWith('/v3-s13-s16-stage-provenance.mjs')){
  const root=path.resolve(process.argv[2]||'.');
  const proof=JSON.parse(fs.readFileSync(path.join(root,'observed-owner-recovery-proof.json'),'utf8'));
  assert.equal(proof.observedProductionProject,'dkxmnvekiopyesuzggeu','Real recovery proof must name production source');
  const result=classifyStages(root,proof,process.env.EXACT_SHA);
  const output=path.join(root,'s13-s16-stage-provenance-classification.json');
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({PASS:true,checkedStages:result.verifiedStageHashes,
    categoryCounts:result.counts,productionExecutableStageCount:0,output},null,2));
}
