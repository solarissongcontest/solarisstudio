import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {classifyStages} from './v3-s13-s16-stage-provenance.mjs';
test('exact 29 stage provenance rejects drift and denies production replay',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'v3-stage-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'ordered-recovery-sql'));
 const sources=[
  ...Array.from({length:4},(_,i)=>'docs/v3/recovery-candidates/local-'+i+'.sql'),
  ...Array.from({length:13},(_,i)=>'supabase/migrations/202611190000'+String(i).padStart(2,'0')+'_sample.sql'),
  ...Array.from({length:10},(_,i)=>'/tmp/local-'+i+'.sql'),
  ...Array.from({length:2},(_,i)=>'scripts/local-only-'+i+'.mjs')
 ];
 const orderedStages=sources.map((file,i)=>{
   const artifactPath='ordered-recovery-sql/'+String(i+1).padStart(2,'0')+'-stage.sql';
   const bytes=Buffer.from('synthetic stage '+i);
   fs.writeFileSync(path.join(root,artifactPath),bytes);
   return {order:i+1,path:file,artifactPath,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 });
 const proof={sourceSha:'a'.repeat(40),postgresVersion:'17.11',network:'none',portsPublished:false,
  productionMutation:false,productionAuthorized:false,productionBackupVerified:false,
  hostedEquivalenceCertified:false,s16FullCriticalWriterCertified:false,
  fullRecovered66CountryContestVerified:false,mediaStorageServiceVerified:false,
  confirmationPositiveLifecycleVerified:false,resultsCalculateReviewEventRehearsal:false,orderedStages};
 const result=classifyStages(root,proof,proof.sourceSha);
 assert.equal(result.stageCount,29);
 assert.ok(result.stages.every(x=>!x.productionExecutable));
 assert.throws(()=>classifyStages(root,proof,'b'.repeat(40)),/Source SHA drift/);
 fs.writeFileSync(path.join(root,orderedStages[0].artifactPath),'corrupted');
 assert.throws(()=>classifyStages(root,proof,proof.sourceSha),/Stage SHA-256 mismatch/);
});
