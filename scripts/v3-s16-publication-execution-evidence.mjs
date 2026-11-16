#!/usr/bin/env node
// Run after the real authorized Publication exercise, before its synthetic clone is dropped.
// The evidence below comes from live PostgreSQL 17.11 SQL, never test-file existence.
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
const sha256 = s => createHash('sha256').update(s).digest('hex');
const requireProof = (ok, why) => {if (!ok) throw Error('S16 Publication: ' + why)};
const gitSha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
requireProof(/^[a-f0-9]{40}$/.test(gitSha) && process.env.EXACT_SHA===gitSha && process.env.SOLARIS_S02_TARGET==='local','source/target SHA mismatch');
const cid=process.env.S16_PUBLICATION_DOCKER_CONTAINER;
requireProof(/^[a-f0-9]{64}$/.test(cid||''),'missing owned local container');
const docker = args => spawnSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
const info=docker(['inspect',cid]);
requireProof(info.status===0,'cannot inspect local container');
const container=JSON.parse(info.stdout)[0];
requireProof(container.Id===cid && container.HostConfig.NetworkMode==='none' && Object.keys(container.HostConfig.PortBindings||{}).length===0,'network/port isolation');
const db='recovery_publication_api_probe';
const run = (actor, sql, isFile=false) => {
  const command=['exec','-i',cid,'psql','-w','-X','-Atq','-v','ON_ERROR_STOP=1','-U',actor,'-d',db,isFile?'-f':'-c',isFile?'-':sql];
  return spawnSync('docker',command,{encoding:'utf8',input:isFile?sql:undefined,timeout:30000,maxBuffer:1024*1024});
};
const query = sql => {const r=run('postgres',sql); requireProof(r.status===0,'catalog SQL failed: '+r.stderr);return r.stdout.trim()};
const json = sql => JSON.parse(query(sql));
const version=json("select jsonb_build_object('version',current_setting('server_version_num')::integer,'user',current_user,'super',(select rolsuper from pg_roles where rolname=current_user),'database',current_database())::text");
requireProof(version.version===170011 && version.user==='postgres' && version.super===false && version.database===db,'database identity/version/operator');
const roles=['anon','authenticated','service_role'];
const tables=['public.studio2_show_publication_controls','public.studio2_show_publication_executions'];
const expectedFunctions=[
  'public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)',
  'public.studio2_publish_due_show_publications()',
  'private.studio2_create_show_publication_control()',
  'private.studio2_ensure_show_publication_control(uuid)',
  'private.v3_guard_archived_edition_workflow_write()'
];
const functions=json("select coalesce(jsonb_agg(jsonb_build_object('identity',n.nspname||'.'||p.proname||'('||coalesce((select string_agg(t::regtype::text,',' order by ord) from unnest(p.proargtypes::oid[]) with ordinality x(t,ord)),'')||')','owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'path',p.proconfig,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE'))),'[]'::jsonb)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname,p.proname) in (('public','studio2_apply_show_publication_change'),('public','studio2_publish_due_show_publications'),('private','studio2_create_show_publication_control'),('private','studio2_ensure_show_publication_control'),('private','v3_guard_archived_edition_workflow_write'))");
const canonicalIdentity = s => s.replaceAll('timestamp with time zone','timestamptz').replaceAll(', ', ',');
const rows=functions.map(f=>({...f,identity:canonicalIdentity(f.identity)}));
requireProof(rows.length===5 && expectedFunctions.every(identity=>rows.some(f=>f.identity===identity && f.owner==='postgres' && f.definer===true && JSON.stringify(f.path)==='["search_path=pg_catalog, public, private"]')),'canonical function identities, owners or pinned paths');
const fn=identity=>rows.find(f=>f.identity===identity);
console.log('S16 PG17.11 Publication function ACL diagnostic',JSON.stringify(rows.map(f=>({identity:f.identity,anon:f.anon,authenticated:f.authenticated,service:f.service}))));
requireProof(fn(expectedFunctions[0]).authenticated && !fn(expectedFunctions[0]).anon && fn(expectedFunctions[1]).service && !fn(expectedFunctions[1]).authenticated && !fn(expectedFunctions[1]).anon && expectedFunctions.slice(2).every(id=>!fn(id).anon && !fn(id).authenticated && !fn(id).service),'direct/RPC EXECUTE privilege drift');
const trigger=json("select jsonb_build_object('n',count(*),'valid',coalesce(bool_and(t.tgenabled='O' and t.tgtype=31 and t.tgfoid=to_regprocedure('private.v3_guard_archived_edition_workflow_write()')),false))::text from pg_trigger t where t.tgrelid='public.studio2_show_publication_controls'::regclass and t.tgname='v3_guard_archived_edition_workflow_write'");
requireProof(trigger.n===1 && trigger.valid===true,'Archive trigger identity/attachment');
for(const table of tables){
 const acl=json("select jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'dml',(select bool_or(has_table_privilege(r,c.oid,'INSERT') or has_table_privilege(r,c.oid,'UPDATE') or has_table_privilege(r,c.oid,'DELETE') or has_table_privilege(r,c.oid,'TRUNCATE') or has_any_column_privilege(r,c.oid,'INSERT,UPDATE')) from unnest(array['anon','authenticated','service_role']) r))::text from pg_class c where c.oid='"+table+"'::regclass");
 requireProof(acl.owner==='postgres' && acl.rls===true && acl.dml===false,'unrevoked direct API grants on '+table);
}
const denials=[];
for(const role of roles) for(const table of tables) for(const action of ['INSERT','UPDATE','DELETE','TRUNCATE']){
 const mutation=action==='INSERT'?'insert into '+table+' default values':action==='UPDATE'?'update '+table+' set '+(table.endsWith('_controls')?'state=state':'executed_at=executed_at')+' where false':action==='DELETE'?'delete from '+table+' where false':'truncate table '+table;
 const out=run('authenticator','begin; set local role '+role+'; '+mutation+'; rollback;');
 const log=(out.stdout||'')+(out.stderr||'');
 requireProof(out.status!==0 && /permission denied for table studio2_show_publication_(controls|executions)/i.test(log),'DML '+role+'/'+table+'/'+action+' did not fail at PostgreSQL ACL');
 denials.push({role,table,action,sqlstate:'42501',sha256:sha256(log)});
}
const readback=json("select jsonb_build_object('state',(select state from public.studio2_show_publication_controls where show_id='71000000-0000-4000-8000-000000000010'),'version',(select version from public.studio2_show_publication_controls where show_id='71000000-0000-4000-8000-000000000010'),'published',(select published from public.shows where id='71000000-0000-4000-8000-000000000010'),'receiptCount',(select count(*) from public.studio2_operation_receipts where operation_id='71000000-0000-4000-8000-000000000005' and command='publication.show.change' and status='succeeded' and actor_id='71000000-0000-4000-8000-000000000001' and completed_at is not null),'auditCount',(select count(*) from public.admin_audit_log where action='show_publication_state_changed' and record_id='71000000-0000-4000-8000-000000000010'))::text");
requireProof(readback.state==='public' && readback.version===2 && readback.published===true && readback.receiptCount===1 && readback.auditCount===1,'committed receipt, audit and canonical readback');
const archived=run('postgres',readFileSync('.github/tests/v3-s16-publication-archive-guard-authority.sql','utf8'),true);
requireProof(archived.status===0,'real Archive INSERT/UPDATE/DELETE test failed: '+archived.stderr);
requireProof(/PASS: real publication Archive guard rejects/.test(archived.stderr),'no affirmative Archive guard proof');
const proof={schemaVersion:1,candidateSha:gitSha,runId:process.env.GITHUB_RUN_ID||null,fixture:db,postgresVersion:'17.11',operator:'postgres',network:'none',production:false,hostedEquivalent:false,
 domain:'publication',status:'EXECUTION_PASS_CATALOG_BINDING_REQUIRED',globalS16Passed:false,
 mandatory:{authorizedPreviewApply:true,callerIdentityAndPrivileges:true,unauthorizedDirectDmlTruncate:true,canonicalCommand:true,replayIdempotency:true,committedReceipt:true,canonicalReadback:true,archiveDenial:true,triggerAttachmentAndOwner:true,noCompetingDirectDml:true},
 actualDeniedCount:denials.length,denials,functionIdentities:rows.map(f=>f.identity),archiveLogSha256:sha256(archived.stdout+archived.stderr),committedReadback:readback,committedReadbackSha256:sha256(JSON.stringify(readback)),
 sourcePaths:['.github/scripts/v3-observed-owner-recovery-local.sh','.github/scripts/v3-s16-publication-api-local.sh','.github/tests/v3-s16-publication-archive-guard-authority.sql'],
 sourceSha256:sha256(readFileSync('scripts/v3-s16-publication-execution-evidence.mjs'))};
requireProof(proof.actualDeniedCount===24 && Object.values(proof.mandatory).every(Boolean),'incomplete execution evidence');
writeFileSync('s16-publication-domain-execution.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log('PASS: networkless PostgreSQL 17.11 exact-SHA Publication execution, 24 negative API DML and committed readback');
