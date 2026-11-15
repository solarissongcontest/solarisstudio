// LOCAL ONLY: reconstruct qualified hosted Confirmation prerequisites.
// Never apply these source-derived fixture effects to production.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EVIDENCE} from './stage-v3-confirmation-access-recovery.mjs';
const files={
 legacy:['20261002144948_canonical_confirmations_admin_runtime.sql','990caec62ae1c4086a373974bb0f8525b90096bf'],
 hotfix:['20261017143000_confirmation_maintenance_hotfix.sql','015943623df244727f4c747ac8f2918a3c761135'],
 dataGate:['20261017194000_confirmation_maintenance_readonly_gate.sql','4081ea5977a7d2e484bbed0625d7519276f147a6'],
 pathPatch:['20261017201000_confirmation_maintenance_postgrest_path_and_reads.sql','38c594b9d8fbaa0a5f9241b522659bfc14f1fd8a'],
 limitPatch:['20261101002000_country_auth_readonly_rate_limit_gate.sql','75020bd98731852f45cae23e60d2a0d109181e64'],
 operationGate:['20261017210000_confirmation_maintenance_operation_claim_gate.sql','08bafc5b291ceb0ba112eee0640799d242b29b69'],
 freshAuth:['20261016163000_v3_account_session_management.sql','3da796b40a1d3ee93217ceacd3474c20916f590b']
};
const configs=[
 ['public.admin_confirmation_create_edit_token(uuid,text,integer)','legacy','public.admin_confirmation_create_edit_token','authenticated,service_role'],
 ['public.admin_confirmation_revoke_edit_token(uuid)','legacy','public.admin_confirmation_revoke_edit_token','authenticated,service_role'],
 ['public.admin_confirmation_delete_response(uuid)','legacy','public.admin_confirmation_delete_response','authenticated,service_role'],
 ['public.admin_update_confirmation_controls(uuid,boolean,boolean,text)','hotfix','public.admin_update_confirmation_controls','authenticated,service_role'],
 ['private.studio2_data_api_operational_gate()','dataGate','private.studio2_data_api_operational_gate','anon,authenticated,service_role'],
 ['private.studio2_platform_mutation_allowed(text)','operationGate','private.studio2_platform_mutation_allowed','service_role'],
 ['private.studio2_require_fresh_auth(integer)','freshAuth','private.studio2_require_fresh_auth','']
];
function source(root,[name,sha]) {
 const sql=readFileSync(resolve(root,'supabase/migrations',name),'utf8');
 const blob=createHash('sha1').update('blob '+Buffer.byteLength(sql)+'\0').update(sql).digest('hex');
 if(blob!==sha)throw Error('Unreviewed Confirmation fixture source: '+name);
 return sql;
}
function extract(sql,identity){
 const pattern=new RegExp('create\\s+or\\s+replace\\s+function\\s+'+identity.replaceAll('.','\\.')+'\\s*\\(','gi');
 const found=[...sql.matchAll(pattern)];
 if(found.length!==1)throw Error('Ambiguous historical function: '+identity);
 const tail=sql.slice(found[0].index);
 const tag=/\bas\s+(\$[a-z0-9_]*\$)/i.exec(tail);
 if(!tag)throw Error('Missing function body delimiter: '+identity);
 const begin=tag.index+tag[0].length,end=tail.indexOf(tag[1]+';',begin);
 if(end<begin)throw Error('Unclosed function body: '+identity);
 return tail.slice(0,end+tag[1].length+1).replace(/^create\s+or\s+replace\s+function/i,'create function');
}
function firstPatch(sql){
 const match=/\bdo \$migration\$[\s\S]*?\$migration\$;/i.exec(sql);
 if(!match)throw Error('Missing reviewed gate amendment');
 return match[0];
}
export function stageConfirmationPrerequisitesLocal(root=process.cwd()){
 const e=JSON.parse(readFileSync(resolve(root,EVIDENCE),'utf8'));
 if(e.projectRef!=='dkxmnvekiopyesuzggeu'||e.existingFunctions?.length!==10)throw Error('Wrong prerequisite observation');
 const bodies=Object.fromEntries(Object.entries(files).map(([id,x])=>[id,source(root,x)]));
 const out=['\\set ON_ERROR_STOP on','-- LOCAL-only source reconstruction; never install in hosted Supabase.','begin;',
   "set local lock_timeout='5s';","set local statement_timeout='90s';","set local check_function_bodies=off;",
   "do $local$ begin if current_database()<>'recovery_operator_baseline' or current_user<>'postgres' or current_setting('server_version_num')<>'170011' then raise exception 'Not isolated Confirmation operator fixture';end if;end $local$;"];
 for(let i=0;i<configs.length;i++){
  const [signature,key,identity,grantees]=configs[i], definition=extract(bodies[key],identity);
  if(definition.includes('$fixture_'+i+'$'))throw Error('Unreviewed delimiter collision');
  out.push('do $create_'+i+'$ begin');
  out.push("if to_regprocedure('"+signature+"') is null then");
  out.push('execute $fixture_'+i+'$'+definition+'$fixture_'+i+'$;');
  out.push("execute 'revoke all on function "+signature+" from public,anon,authenticated,service_role';");
  if(grantees)out.push("execute 'grant execute on function "+signature+" to "+grantees+"';");
  out.push('end if;end $create_'+i+'$;');
 }
 out.push(firstPatch(bodies.pathPatch),firstPatch(bodies.limitPatch));
 out.push('do $check$ declare item jsonb; p pg_proc%rowtype; actual jsonb;begin');
 out.push("for item in select value from jsonb_array_elements('"+JSON.stringify(e.existingFunctions).replaceAll("'","''")+"'::jsonb)loop");
 out.push("select * into p from pg_proc where oid=to_regprocedure(item->>'identity');");
 out.push("if p.oid is null then raise exception 'Missing qualified Confirmation function: %',item->>'identity' using errcode='55000';end if;");
 out.push("actual:=jsonb_build_object('identity',item->>'identity','owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'definitionMd5',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text,'config',to_jsonb(p.proconfig));");
 out.push("if actual is distinct from item then raise exception 'Unqualified local Confirmation body/ACL: % (expected MD5 %, got %)',item->>'identity',item->>'definitionMd5',actual->>'definitionMd5' using errcode='55000';end if;");
 out.push('end loop;end $check$;commit;');
 return out.join('\n')+'\n';
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(stageConfirmationPrerequisitesLocal());
