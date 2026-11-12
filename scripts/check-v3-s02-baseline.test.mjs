import test from 'node:test';
import assert from 'node:assert/strict';
import {PROFILE,dependencyGraph,validateFreshSource,qualifySourceBeta} from './check-v3-s02-baseline.mjs';
const sha='1'.repeat(40),fingerprint='a'.repeat(64);
function catalog(){
 return {formatVersion:1,serverVersionNum:170011,trackFunctions:'all',networkIsolation:{internal:true,loopbackOnly:true,identity:'s02-test'},databaseImage:'sha256:'+fingerprint,databaseIdentity:'postgres:one-start',migrationVersions:['1'],seedCounts:{users:0,ballots:0},
 nodes:PROFILE.roots.map((name,i)=>({id:'f:'+i,identity:name+'()',name,kind:'function',schema:name.split('.')[0],
 owner:'postgres',settingsMd5:'b'.repeat(32),aclMd5:'c'.repeat(32),definitionSha256:fingerprint,language:'plpgsql',securityDefiner:true,privileges:{anon:false,authenticated:false,service_role:false}})),edges:[],schemas:[]};
}
function input(){
 return {candidateSha:sha,before:catalog(),after:catalog(),second:catalog(),migrationVersions:['1'],sourceHashes:{source:fingerprint},
 stages:Object.fromEntries(PROFILE.requiredStages.map(k=>[k,'success'])),
 lifecycle:{candidateSha:sha,passed:true,partial:false,runtimeFailure:false,
 completedStages:['stage-1-setup','stage-2-delegation-onboarding','stage-3-confirmations','stage-4-entries','stage-5-running-orders','stage-6-jury','stage-7-public-voting','stage-8-results','stage-9-publication','stage-10-archive'],
 completedContestExtensions:['grand-final-qualifier-bridge','grand-final-voting','grand-final-results','grand-final-publication'],pendingStages:[],pendingContestExtensions:[],blockedContestExtensions:[],
 implementedInvariants:['confirmation-no-effective-duplicates','entry-valid-revision','media-accepted-revision','jury-single-final-ballot','televote-canonical-ballot','result-reproducible','publication-final-version','tasks-canonical','notifications-reconcilable'],
 implementedFailureInjections:['network-after-commit','db-timeout-before-commit','duplicate-request','worker-crash','realtime-disconnect','stale-client','two-organizers','supabase-outage'],
 seed:{editionCount:1,delegationCount:66,showCount:3},lifecycle:{finalState:'archived'},runIdentity:{candidateSha:sha,databaseFingerprint:'postgres:one-start'}}};
}
test('source qualification never becomes hosted equivalence or deployment permission',()=>{
 const proof=qualifySourceBeta(input());
 assert.equal(proof.betaSourcePrerequisiteSatisfied,true);
 for(const key of ['originalHostedS02Satisfied','hostedEquivalent','productionRecoveryEligible','liveBetaDeploymentAuthorized','overallBetaReleaseApproved','fullHostedEquivalenceCertified'])assert.equal(proof[key],false,key);
});
test('every required executable stage, including cleanup and second replay, is mandatory',()=>{
 for(const stage of PROFILE.requiredStages){const v=input();v.stages[stage]='not_executed';assert.throws(()=>qualifySourceBeta(v),/Incomplete stage/);}
});
test('wrong version, unknown history and pre-existing ballots/users fail closed',()=>{
 for(const patch of [{serverVersionNum:160011},{migrationVersions:['2']},{seedCounts:{users:1,ballots:0}},{seedCounts:{users:0,ballots:1}}])
 assert.throws(()=>validateFreshSource({...catalog(),...patch},['1']));
});
test('lifecycle evidence cannot be stale, partial, another database or missing safety scenarios',()=>{
 for(const patch of [{candidateSha:'2'.repeat(40)},{partial:true},{pendingStages:['stage-10-archive']},{implementedFailureInjections:[]},{implementedInvariants:[]},{runIdentity:{candidateSha:sha,databaseFingerprint:'other'}}]){
 const v=input();Object.assign(v.lifecycle,patch);assert.throws(()=>qualifySourceBeta(v));}
});
test('source definition drift after recovery or clean replay is rejected',()=>{
 for(const phase of ['after','second']){const v=input();v[phase].nodes[0].definitionSha256='b'.repeat(64);assert.throws(()=>qualifySourceBeta(v),/Protected source definition changed/);}
});
test('missing roots, duplicate objects, unknown edges and unknown effective privileges refuse',()=>{
 const c=catalog();c.nodes.pop();assert.throws(()=>dependencyGraph(c),/Missing required root/);
 const d=catalog();d.nodes.push(d.nodes[0]);assert.throws(()=>dependencyGraph(d),/duplicate/);
 const e=catalog();e.edges.push({source:'f:0',target:'missing'});assert.throws(()=>dependencyGraph(e),/Unknown dependency edge/);
 const p=catalog();delete p.nodes[0].privileges.anon;assert.throws(()=>dependencyGraph(p),/Unknown function/);
});
test('call, trigger and observed runtime edges extend the actual required closure',()=>{
 const c=catalog(),other={...c.nodes[0],id:'f:guard',name:'private.guard',identity:'private.guard()',runtimeCalls:1,dynamicSql:true};
 c.nodes.push({id:'r:public.vote',identity:'public.vote',schema:'public',kind:'relation',privileges:{'anon:UPDATE':false}},
 {id:'t:vote.guard',identity:'public.vote.guard',schema:'public',kind:'trigger'},other,
 {...other,id:'f:unused',name:'private.unused',identity:'private.unused()',runtimeCalls:0,dynamicSql:false});
 c.edges.push({source:'f:0',target:'r:public.vote'},{source:'r:public.vote',target:'t:vote.guard'},{source:'t:vote.guard',target:'f:guard'});
 const g=dependencyGraph(c,[]);
 assert.ok(g.nodes.find(n=>n.id==='t:vote.guard').reachable);
 assert.ok(g.dynamicSql.includes('private.guard()'));
 assert.equal(g.nodes.find(n=>n.id==='f:unused').hostedClassification,'unnecessary-for-observed-operation');
 assert.equal(g.permissions.find(p=>p.identity==='public.vote:anon:UPDATE').hostedClassification,'unknown');
});
test('equal hashes require equal security and grants; mismatches do not imply semantic drift',()=>{
 const c=catalog(),n=c.nodes[0],old={id:n.identity,sha256:fingerprint,language:n.language,securityDefiner:true,exec:{...n.privileges},ownerMetadata:{owner_name:n.owner,settings_md5:n.settingsMd5,acl_md5:n.aclMd5}};
 assert.equal(dependencyGraph(c,[old]).nodes[0].hostedClassification,'verified-equivalent');
 c.nodes[0].privileges.anon=true;
 assert.equal(dependencyGraph(c,[old]).nodes[0].hostedClassification,'verified-different');
 assert.match(dependencyGraph(c,[old]).nodes[0].evidence,/NOT proof of semantic drift/);
});

test('inherited hosted/libpq/remote Docker targets refuse before invoking any tool',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'s02-refusal-')),marker=join(dir,'tool-invoked');
 try{
  for(const tool of ['git','supabase','docker'])writeFileSync(join(dir,tool),'#!/bin/sh\n: > "$S02_MARKER"\nexit 90\n',{mode:0o755});
  for(const [key,value] of [['DATABASE_URL','postgresql://hosted.invalid/db'],['PGHOSTADDR','192.0.2.1'],['PGOPTIONS','-c role=postgres'],['DOCKER_HOST','tcp://remote.invalid:2375']]){
   const r=spawnSync('bash',[resolve('scripts/rehearse-v3-s02-source-baseline.sh')],{encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,S02_MARKER:marker,SOLARIS_RUN_LOCAL_DB_REHEARSAL:'YES',SOLARIS_VERIFICATION_TARGET:'local',[key]:value}});
   assert.notEqual(r.status,0);assert.match(r.stderr,/Refusing inherited connection authority/);
   assert.throws(()=>readFileSync(marker),{code:'ENOENT'});
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('security owner, ACL/configuration and effective EXECUTE cannot drift behind equal body hashes',()=>{
 for(const [key,value] of [['owner','attacker'],['aclMd5','d'.repeat(32)],['settingsMd5','e'.repeat(32)]]){
  const v=input();v.after.nodes[0][key]=value;assert.throws(()=>qualifySourceBeta(v),/Protected security changed/);
 }
 const v=input();v.second.nodes[0].privileges.authenticated=true;assert.throws(()=>qualifySourceBeta(v),/Protected EXECUTE changed/);
});
