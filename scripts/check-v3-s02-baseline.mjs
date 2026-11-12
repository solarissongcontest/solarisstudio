import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const PROFILE=JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/s02-baseline-profiles.json',import.meta.url)));
const frozen=JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/s02-hosted-727-routine-fingerprints-2026-11-09.json',import.meta.url)));
const frozenCatalog=JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json',import.meta.url)));
const check=(v,m)=>{if(!v)throw Error(m);};
const hash=b=>createHash('sha256').update(b).digest('hex');
export function ownedProjectIdentity({runId,attempt,jobId}){
 check(/^[0-9]+$/.test(runId||'')&&/^[0-9]+$/.test(attempt||'')&&/^[A-Za-z0-9_-]+$/.test(jobId||''),'Invalid CI project identity');
 const name='archive-v3-'+runId+'-'+attempt+'-'+jobId.replaceAll('_','-').toLowerCase();
 check(name.length<=40,'CLI project identity exceeds the 40-character compatibility boundary');
 return name;
}
export function dependencyGraph(c,expected=frozen.functions,roots=PROFILE.roots) {
 check(c.formatVersion===1 && Array.isArray(c.nodes) && Array.isArray(c.edges),'Invalid dependency catalog');
 const nodes=new Map(), adjacent=new Map();
 for(const n of c.nodes.filter(n=>n.kind==='function'))check(/^[a-f0-9]{64}$/.test(n.definitionSha256)&&['anon','authenticated','service_role'].every(r=>typeof n.privileges?.[r]==='boolean'),'Unknown function fingerprint/privilege');
 for(const n of c.nodes){check(n.id && n.identity && !nodes.has(n.id),'Missing/duplicate dependency');nodes.set(n.id,n);}
 for(const e of c.edges){check(nodes.has(e.source)&&nodes.has(e.target),'Unknown dependency edge');if(!adjacent.has(e.source))adjacent.set(e.source,[]);adjacent.get(e.source).push(e.target);}
 const queue=[];
 for(const name of roots){const matches=c.nodes.filter(n=>n.name===name);check(matches.length,'Missing required root: '+name);queue.push(...matches.map(n=>n.id));}
 queue.push(...c.nodes.filter(n=>n.runtimeCalls>0).map(n=>n.id));
 const reachable=new Set();
 while(queue.length){const id=queue.pop();if(reachable.has(id))continue;reachable.add(id);queue.push(...(adjacent.get(id)||[]));}
 const expectedById=new Map(expected.map(n=>[n.id,n]));
 const classified=c.nodes.map(n=>{
  const old=expectedById.get(n.identity);let status='unknown',evidence='No equivalent executable hosted witness';
  if(!reachable.has(n.id)){status='unnecessary-for-observed-operation';evidence='Outside conservative roots/observed calls; NOT a whole-platform exclusion';}
  else if(n.kind==='function'&&old){
   const attributes=frozenCatalog.routines.find(r=>r.signature===n.identity)||old.ownerMetadata;
   const same=attributes && n.owner===attributes.owner_name && n.settingsMd5===attributes.settings_md5 && n.aclMd5===attributes.acl_md5 && n.definitionSha256===old.sha256 && n.securityDefiner===old.securityDefiner && n.language===old.language &&
    Object.entries(old.exec).every(([r,v])=>n.privileges?.[r]===v);
   status=same?'verified-equivalent':(!attributes && n.definitionSha256===old.sha256?'unknown':'verified-different');
   evidence=status==='unknown'?'Missing frozen owner/configuration metadata':same?'Exact frozen definition/security/EXECUTE representation; tested behavior only':'Different catalog bytes, NOT proof of semantic drift';
  }
  else if(n.kind==='relation'&&reachable.has(n.id)){
   const local=c.fingerprints?.relations?.find(r=>r.schema_name+'.'+r.object_name===n.identity);
   const oldRelation=frozenCatalog.relations.find(r=>r.schema_name+'.'+r.object_name===n.identity);
   if(local&&oldRelation){
    const fields=['owner_name','object_kind','rls_enabled','rls_forced','columns_md5','constraints_md5','indexes_md5','triggers_md5','policies_md5','acl_md5'];
    status=fields.every(k=>local[k]===oldRelation[k])?'verified-equivalent':'verified-different';
    evidence='Relation structural/security fingerprints from existing S06 collector; not row-level behavior equivalence';
   }
  }
  else if(n.kind==='trigger'&&reachable.has(n.id)){
   const relation=n.identity.split('.').slice(0,2).join('.');
   const local=c.fingerprints?.relations?.find(r=>r.schema_name+'.'+r.object_name===relation);
   const oldRelation=frozenCatalog.relations.find(r=>r.schema_name+'.'+r.object_name===relation);
   if(local&&oldRelation&&local.triggers_md5===oldRelation.triggers_md5){
    status='verified-equivalent';evidence='Exact whole-relation frozen trigger-definition/enabled-state aggregate; function behavior classified separately';
   }
  }
  return {...n,reachable:reachable.has(n.id),hostedClassification:status,evidence};
 });
 const permissions=[];
 for(const n of classified.filter(n=>n.reachable))for(const [right,allowed] of Object.entries(n.privileges||{})){
  check(typeof allowed==='boolean','Unknown effective privilege');
  permissions.push({kind:'permission',identity:n.identity+':'+right,allowed,hostedClassification:n.kind==='function'?n.hostedClassification:'unknown',
   evidence:'Effective local role privilege; not a row-level authorization assertion'});
 }
 for(const n of classified.filter(n=>n.reachable))for(const [column,allowed] of Object.entries(n.columnUpdates||{})){
  check(typeof allowed==='boolean','Unknown column privilege');
  permissions.push({kind:'column-permission',identity:n.identity+':'+column+':UPDATE',allowed,hostedClassification:'unknown',evidence:'Effective local column UPDATE; historical role inheritance not certified'});
 }
 return {schemaVersion:1,databaseIdentity:c.databaseIdentity,serverVersionNum:c.serverVersionNum,
  analysis:'pg_depend, conservative qualified references, actual function statistics. Dynamic/unqualified/unexecuted branches are NOT claimed exhaustive.',
  nodes:classified,edges:c.edges.filter(e=>reachable.has(e.source)),permissions,
  schemas:(c.schemas||[]).filter(s=>classified.some(n=>n.reachable&&n.schema===s.identity)),roleMemberships:c.roleMemberships||[],
  dynamicSql:classified.filter(n=>n.reachable&&n.dynamicSql).map(n=>n.identity),
  hostedUnknowns:classified.filter(n=>n.reachable&&n.hostedClassification==='unknown').map(n=>n.identity),
  hostedDifferences:classified.filter(n=>n.reachable&&n.hostedClassification==='verified-different').map(n=>n.identity),
  fullHostedEquivalenceCertified:false};
}
export function validateFreshSource(c,versions){
 check(Math.floor(c.serverVersionNum/10000)===17,'PostgreSQL major 17 required');
 check(c.migrationVersions?.join(',')===versions.join(','),'Source migration history mismatch');
 check(c.seedCounts?.users===0&&c.seedCounts?.ballots===0,'Source baseline has pre-existing user/ballot state');
 check(c.databaseIdentity,'Missing local database identity');
 check(c.trackFunctions==='all','Function-call telemetry not enabled');
 check(c.networkIsolation?.externalEgressDenied===true&&c.networkIsolation?.hostProxyDenied===true&&c.networkIsolation?.loopbackOnly===true&&/^supabase_network_archive-v3-/.test(c.networkIsolation.identity),'Missing closed-network evidence');
 check(/^sha256:[a-f0-9]{64}$/.test(c.databaseImage||''),'Missing actual database image identity');
}
export function qualifySourceBeta({candidateSha,before,after,second,stages,lifecycle,migrationVersions,sourceHashes}){
 check(/^[a-f0-9]{40}$/.test(candidateSha),'Exact candidate SHA required');
 validateFreshSource(before,migrationVersions);validateFreshSource(second,migrationVersions);
 check(before.databaseIdentity===after.databaseIdentity,'Database changed during lifecycle/recovery');
 check(before.databaseImage===second.databaseImage,'Database image changed during repeat');
 for(const name of PROFILE.requiredStages)check(stages[name]==='success','Incomplete stage: '+name);
 const expectedStages=['stage-1-setup','stage-2-delegation-onboarding','stage-3-confirmations','stage-4-entries','stage-5-running-orders','stage-6-jury','stage-7-public-voting','stage-8-results','stage-9-publication','stage-10-archive'];
 const expectedExtensions=['grand-final-qualifier-bridge','grand-final-voting','grand-final-results','grand-final-publication'];
 check(lifecycle.candidateSha===candidateSha&&lifecycle.passed===true&&lifecycle.partial===false&&lifecycle.runtimeFailure===false,'Incomplete or stale contest evidence');
 check(JSON.stringify(lifecycle.completedStages)===JSON.stringify(expectedStages)&&lifecycle.pendingStages?.length===0,'Missing complete contest stage');
 check(JSON.stringify(lifecycle.completedContestExtensions)===JSON.stringify(expectedExtensions)&&lifecycle.pendingContestExtensions?.length===0&&lifecycle.blockedContestExtensions?.length===0,'Incomplete Grand Final');
 check(lifecycle.lifecycle?.finalState==='archived','Contest did not archive');
 const invariants=['confirmation-no-effective-duplicates','entry-valid-revision','media-accepted-revision','jury-single-final-ballot','televote-canonical-ballot','result-reproducible','publication-final-version','tasks-canonical','notifications-reconcilable'];
 const failures=['network-after-commit','db-timeout-before-commit','duplicate-request','worker-crash','realtime-disconnect','stale-client','two-organizers','supabase-outage'];
 check(invariants.every(v=>lifecycle.implementedInvariants?.includes(v))&&failures.every(v=>lifecycle.implementedFailureInjections?.includes(v)),'Missing lifecycle integrity/failure evidence');
 check(lifecycle.seed?.editionCount===1&&lifecycle.seed?.delegationCount===66&&lifecycle.seed?.showCount>=3,'Invalid full-contest fixture');
 check(lifecycle.runIdentity?.candidateSha===candidateSha&&lifecycle.runIdentity?.databaseFingerprint===before.databaseIdentity,'Contest used another database');
 const first=dependencyGraph(before), final=dependencyGraph(after), repeat=dependencyGraph(second);
 for(const n of first.nodes.filter(n=>n.kind==='function'&&n.reachable)){
  const a=final.nodes.find(x=>x.identity===n.identity),b=repeat.nodes.find(x=>x.identity===n.identity);
  check(a?.definitionSha256===n.definitionSha256&&b?.definitionSha256===n.definitionSha256,'Protected source definition changed: '+n.identity);
  for(const k of ['owner','securityDefiner','settingsMd5','aclMd5'])check(a[k]===n[k]&&b[k]===n[k],'Protected security changed: '+n.identity+' '+k);
  for(const r of ['anon','authenticated','service_role'])check(a.privileges?.[r]===n.privileges?.[r]&&b.privileges?.[r]===n.privileges?.[r],'Protected EXECUTE changed: '+n.identity);
 }
 check(Object.keys(sourceHashes||{}).length>0&&Object.values(sourceHashes).every(h=>/^[a-f0-9]{64}$/.test(h)),'Missing source provenance');
 return {task:'S02',contract:'S02-BETA-SOURCE',schemaVersion:1,candidateSha,
  status:'SOURCE_DEFINED_ISOLATED_BASELINE_QUALIFIED',evidenceLevel:'REPRODUCED_IN_ISOLATION',
  sourceHashes,migrationVersions,stages,databaseImage:before.databaseImage,networkIsolation:before.networkIsolation,serverVersionNum:before.serverVersionNum,...PROFILE.constraints,
  betaSourcePrerequisiteSatisfied:true,originalHostedS02Satisfied:false,fullHostedEquivalenceCertified:false,
  overallBetaReleaseApproved:false,dependencyReports:{before:first,after:final,second:repeat},
  limitation:'Qualified only for fresh isolated source-defined beta. Existing hosted upgrade, production S02/S06 and live beta authorization remain separate.'};
}
export function assertBaselineDependency(proof,{target,candidateSha}={}){
 check(target==='fresh-isolated-source-beta','Historical/hosted targets require original S02 evidence; source proof cannot substitute');
 check(proof?.contract==='S02-BETA-SOURCE'&&proof.status==='SOURCE_DEFINED_ISOLATED_BASELINE_QUALIFIED','Source baseline not qualified');
 check(/^[a-f0-9]{40}$/.test(candidateSha||'')&&proof.candidateSha===candidateSha,'Stale baseline prerequisite');
 check(proof.betaSourcePrerequisiteSatisfied===true&&proof.originalHostedS02Satisfied===false,'Invalid baseline scope');
 for(const [key,value] of Object.entries(PROFILE.constraints))check(proof[key]===value,'Changed qualification constraint: '+key);
 check(proof.fullHostedEquivalenceCertified===false&&proof.overallBetaReleaseApproved===false,'Qualification cannot approve a release');
 for(const stage of PROFILE.requiredStages)check(proof.stages?.[stage]==='success','Missing prerequisite stage: '+stage);
 return {baselinePrerequisiteSatisfied:true,target,candidateSha,historicalHostedAcceptance:false,productionRecoveryEligible:false,liveBetaDeploymentAuthorized:false};
}
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const catalog=(dir,name)=>({...json(dir+'/'+name+'.json'),fingerprints:json(dir+'/fingerprints-'+name+'.json')});
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [command,dir='s02-source-evidence',name='after']=process.argv.slice(2);
 const migrationVersions=readdirSync('supabase/migrations').filter(n=>/^\d+.*\.sql$/.test(n)).map(n=>n.split('_')[0]).sort();
 if(command==='fresh'){validateFreshSource(json(dir+'/before.json'),migrationVersions);console.log('PASS fresh source history and empty user/ballot state');}
 else if(command==='graph')writeFileSync(dir+'/dependency-graph.json',JSON.stringify(dependencyGraph(catalog(dir,name)),null,2)+'\n');
 else if(command==='dependency')console.log(JSON.stringify(assertBaselineDependency(json(dir+'/s02-source-beta-proof.json'),{target:process.env.S02_BASELINE_TARGET,candidateSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()})));
 else if(command==='qualify'){
  const candidateSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  execFileSync('git',['diff','--exit-code','--quiet','--','.',':!supabase/config.toml']);
  const files=execFileSync('git',['ls-files','supabase/migrations','.github/scripts','scripts','docs/v3/recovery-candidates/s02-baseline-profiles.json'],{encoding:'utf8'}).trim().split('\n');
  const sourceHashes=Object.fromEntries(files.map(p=>[p,hash(readFileSync(p))]));
  const proof=qualifySourceBeta({candidateSha,before:catalog(dir,'before'),after:catalog(dir,'after'),second:catalog(dir,'second'),stages:json(dir+'/stages.json'),lifecycle:json(dir+'/lifecycle.json'),migrationVersions,sourceHashes});
  writeFileSync(dir+'/s02-source-beta-proof.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
  console.log('PASS S02-BETA-SOURCE '+candidateSha+'; NOT hosted-equivalent or live beta/production authorization');
 }else throw Error('Use fresh, graph, qualify or dependency');
}
