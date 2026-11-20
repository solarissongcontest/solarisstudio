#!/usr/bin/env python3
"""Clone-only S13 batch rehearsal. Unix-socket Docker/network-none only; no hosted connector.

All commands and private dump bytes stay in the operator environment. The source
DB is never migrated, dropped or terminated. Auth/Vault are not read by this tool.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import time
import subprocess
import sys
import uuid

ROOT=Path(__file__).resolve().parent.parent
TABLES=['v3_migration_contracts','v3_schema_compatibility','v3_schema_compatibility_history','v3_backfill_jobs','v3_migration_parity_runs']
FUNCTIONS=['v3_schema_compatibility','v3_register_migration_contract','v3_claim_backfill','v3_checkpoint_backfill','v3_fail_backfill','v3_record_migration_parity','v3_set_schema_compatibility']
class RehearsalFailure(Exception):pass

def command(*args,input=None):
    return subprocess.run(args,input=input,capture_output=True,check=True,timeout=180).stdout

def validate_container(container):
    if not re.fullmatch('[a-f0-9]{64}',container):raise RehearsalFailure('Full isolated container ID required')
    metadata=json.loads(command('docker','inspect','--type','container',container))[0]
    if (metadata['Id']!=container or not metadata['State']['Running'] or metadata['HostConfig']['NetworkMode']!='none'
        or metadata['HostConfig'].get('Privileged') or metadata['HostConfig'].get('PidMode')=='host'
        or any(m.get('Type')!='tmpfs' for m in metadata.get('Mounts',[]))
        or any(metadata['NetworkSettings'].get('Ports',{}).values())):
        raise RehearsalFailure('Require running network-none, unprivileged container without published ports')

def exec_args(container,*args):
    return ['docker','exec','-i',container,'env','-u','PGHOSTADDR','-u','PGSERVICE','-u','PGSERVICEFILE',
            '-u','PGOPTIONS','-u','PGPASSWORD','-u','PGDATABASE','PGPASSFILE=/dev/null',*args]
def exec_pg(container,*args,input=None):
    return command(*exec_args(container,*args),input=input)

def sql(container,database,source,actor='postgres'):
    if actor not in ('postgres','supabase_admin','anon','authenticated','service_role'):raise RehearsalFailure('Unreviewed SQL actor')
    prefix='' if actor=='supabase_admin' else 'SET SESSION AUTHORIZATION '+actor+';\n'
    return exec_pg(container,'psql','-X','-qAt','-h','/var/run/postgresql','-p','5432',
                   '-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',input=(prefix+source).encode()).decode().strip()

def tables(container,database):
    return json.loads(sql(container,database,"SELECT coalesce(json_agg(format('%I.%I',n.nspname,c.relname) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname!~'^pg_' AND n.nspname<>'information_schema';"))

def data_digest(container,database,identities):
    if not identities:raise RehearsalFailure('Empty original-table preservation scope')
    args=['docker','exec',container,'env','-u','PGHOSTADDR','-u','PGSERVICE','-u','PGSERVICEFILE','-u','PGOPTIONS','-u','PGPASSWORD',
          '-u','PGDATABASE','PGPASSFILE=/dev/null','pg_dump','-h','/var/run/postgresql','-p','5432','-U','supabase_admin','-d',database,
          '--restrict-key=S13BatchLocalPreservationOnly','--no-comments','--lock-wait-timeout=5s']
    for identity in identities:args.extend(['--table',identity])
    # Stream into a digest, not stdout/files/memory/private logs. Dump errors are never echoed.
    with subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL) as process:
        digest=hashlib.sha256()
        while chunk:=process.stdout.read(65536):digest.update(chunk)
        if process.wait(timeout=180)!=0:raise RehearsalFailure('Original table dump could not be verified')
        return digest.hexdigest()

def catalog_digest(container,database):
    # Reuse the existing S13 preservation-fingerprint approach, exclude ONLY the
    # newly created S13 objects. No raw definitions, ACLs or rows leave PostgreSQL.
    t=','.join("'"+x+"'" for x in TABLES); f=','.join("'"+x+"'" for x in FUNCTIONS)
    source=f"""BEGIN READ ONLY; SET LOCAL search_path=pg_catalog;
    WITH ns AS (SELECT * FROM pg_namespace WHERE nspname!~'^pg_' AND nspname<>'information_schema'),
    new_tables AS (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname IN ({t})),
    old_relations AS (SELECT c.* FROM pg_class c JOIN ns n ON n.oid=c.relnamespace
       WHERE c.oid NOT IN (SELECT oid FROM new_tables)
       AND NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indexrelid=c.oid AND i.indrelid IN (SELECT oid FROM new_tables))
       AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.refobjid IN (SELECT oid FROM new_tables) AND c.relkind='S')),
    records(value) AS (
      SELECT 'schema|'||nspname||'|'||nspowner||'|'||coalesce(nspacl::text,'') FROM ns
      UNION ALL SELECT 'relation|'||c.oid||'|'||c.relname||'|'||c.relkind::text||'|'||c.relowner||'|'||coalesce(c.relacl::text,'')||'|'||c.relrowsecurity||'|'||c.relforcerowsecurity||'|'||coalesce(c.reloptions::text,'') FROM old_relations c
      UNION ALL SELECT 'column|'||a.attrelid||'|'||a.attnum||'|'||a.attname||'|'||a.atttypid||'|'||a.atttypmod||'|'||a.attnotnull||'|'||coalesce(a.attacl::text,'')||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),'') FROM pg_attribute a JOIN old_relations c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped
      UNION ALL SELECT 'function|'||p.oid||'|'||p.proowner||'|'||coalesce(p.proacl::text,'')||'|'||pg_get_functiondef(p.oid) FROM pg_proc p JOIN ns n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p') AND NOT(n.nspname='public' AND p.proname IN ({f}))
      UNION ALL SELECT 'trigger|'||t.oid||'|'||t.tgenabled::text||'|'||pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN old_relations c ON c.oid=t.tgrelid
      UNION ALL SELECT 'policy|'||p.oid||'|'||to_jsonb(p)::text FROM pg_policy p JOIN old_relations c ON c.oid=p.polrelid
      UNION ALL SELECT 'constraint|'||k.oid||'|'||pg_get_constraintdef(k.oid) FROM pg_constraint k JOIN old_relations c ON c.oid=k.conrelid
      UNION ALL SELECT 'index|'||i.indexrelid||'|'||pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN old_relations c ON c.oid=i.indrelid
      UNION ALL SELECT 'default-acl|'||to_jsonb(d)::text FROM pg_default_acl d
      UNION ALL SELECT 'extension|'||to_jsonb(e)::text FROM pg_extension e
      UNION ALL SELECT 'event-trigger|'||to_jsonb(e)::text FROM pg_event_trigger e
      UNION ALL SELECT 'role|'||rolname||'|'||rolsuper||'|'||rolinherit||'|'||rolcreaterole||'|'||rolcreatedb||'|'||rolcanlogin||'|'||rolreplication||'|'||rolbypassrls||'|'||rolconnlimit||'|'||coalesce(rolvaliduntil::text,'') FROM pg_roles
      UNION ALL SELECT 'membership|'||to_jsonb(m)::text FROM pg_auth_members m
    ) SELECT encode(sha256(convert_to(coalesce(string_agg(value,chr(10) ORDER BY value),''),'UTF8')),'hex') FROM records;
    COMMIT;"""
    return sql(container,database,source,actor='supabase_admin')

def validate_package(directory):
    manifest=json.loads((directory/'manifest.json').read_text())
    if manifest.get('batchId')!='S13-FOUNDATION-DARK-1' or manifest.get('productionAuthorized') is not False:
        raise RehearsalFailure('Unsupported batch manifest')
    if manifest['sourceSha']!=command('git','-C',str(ROOT),'rev-parse','HEAD').decode().strip():
        raise RehearsalFailure('Package/source commit mismatch')
    if manifest['order']!=['preflight.sql','install.sql','postcheck.sql'] or set(manifest['artifacts'])!=set(manifest['order']):
        raise RehearsalFailure('Unknown or missing batch operations')
    required=['docs/v3/recovery-candidates/forward-only-s13-foundation.sql']+[
        'docs/v3/recovery-candidates/s13-first-batch-'+part+'.sql' for part in ('preconditions','dark-acl','postconditions')]+[
        'scripts/package-v3-s13-first-batch.mjs','scripts/rehearse-v3-s13-first-batch.py',
        'supabase/migrations/20261019111000_v3_s13_migration_hardening.sql',
        'supabase/migrations/20261019113300_v3_s13_strict_registration_restore.sql',
        'docs/v3/recovery-candidates/evidence/s13-current-hosted-preflight-2026-11-19.json',
        'docs/v3/recovery-candidates/evidence/s13-s16-current-hosted-catalog-2026-11-20.json',
        'docs/v3/recovery-candidates/evidence/s13-first-batch-postgrest-watch-2026-11-20.json',
        'scripts/ops/solaris-role-acl-rehearsal-20261120.sh','scripts/ops/solaris-s13-first-batch-operator.sh']
    if sorted(e['path'] for e in manifest['inputs'])!=sorted(required):
        raise RehearsalFailure('Missing or unknown exact-source input')
    if manifest.get('target')!={'projectRef':'dkxmnvekiopyesuzggeu','database':'postgres','postgresVersionNum':170011,'actor':'postgres'}:
        raise RehearsalFailure('Wrong manifest target identity')
    for name,record in manifest['artifacts'].items():
        file=directory/name
        if file.is_symlink() or hashlib.sha256(file.read_bytes()).hexdigest()!=record['sha256']:
            raise RehearsalFailure('Batch artifact bytes changed')
    for entry in manifest['inputs']:
        file=ROOT/entry['path']
        if file.is_symlink() or not file.resolve().is_relative_to(ROOT) or hashlib.sha256(file.read_bytes()).hexdigest()!=entry['sha256'] or hashlib.sha256(command('git','-C',str(ROOT),'show',manifest['sourceSha']+':'+entry['path'])).hexdigest()!=entry['sha256']:
            raise RehearsalFailure('Batch source input mismatch')
    expected=json.loads(subprocess.run(['node','--input-type=module','-e',
        "import {renderBatch} from './scripts/package-v3-s13-first-batch.mjs'; process.stdout.write(JSON.stringify(renderBatch()));"],
        cwd=ROOT,capture_output=True,check=True,timeout=15).stdout)
    if any((directory/name).read_bytes()!=content.encode() for name,content in expected.items()):
        raise RehearsalFailure('Packaged SQL is not the deterministic source rendering')
    return manifest

def expect_denial(container,database,statement,role):
    try:sql(container,database,'BEGIN; '+statement+'; ROLLBACK;',actor=role)
    except subprocess.CalledProcessError as error:
        if b'42501' not in error.stderr:raise RehearsalFailure('Denial was not an authorization failure') from None
    else:raise RehearsalFailure('Unexpected API mutation permission')

def interrupt_owned_session(container,database,install):
    application='s13_batch_interrupt_'+uuid.uuid4().hex
    fault=install.rsplit('\ncommit;',1)[0]+"\nDO $stop$ BEGIN RAISE NOTICE 'S13_BATCH_INTERRUPTION_REACHED pid=%',pg_backend_pid(); PERFORM pg_sleep(25); RAISE EXCEPTION 'S13_INTERRUPT_CONTROL_DID_NOT_TERMINATE'; END $stop$;\ncommit;\n"
    text="SET SESSION AUTHORIZATION postgres; SET application_name='"+application+"';\n"+fault
    args=exec_args(container,'psql','-X','-qAt','-h','/var/run/postgresql','-p','5432','-U','supabase_admin',
                   '-d',database,'-v','ON_ERROR_STOP=1')
    process=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    selected=selectors.DefaultSelector();selected.register(process.stderr,selectors.EVENT_READ)
    reached=False;terminated=False;stderr=[]
    try:
        process.stdin.write(text.encode());process.stdin.close();process.stdin=None
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            if not selected.select(timeout=.2):
                if process.poll() is not None:break
                continue
            line=process.stderr.readline()
            if not line:break
            stderr.append(line)
            match=re.search(rb'S13_BATCH_INTERRUPTION_REACHED pid=(\d+)',line)
            if match:
                reached=True;pid=int(match[1])
                try:sql(container,database,install)
                except subprocess.CalledProcessError as concurrent:
                    if b'55P03' not in concurrent.stderr or b'another installation is active' not in concurrent.stderr:
                        raise RehearsalFailure('Concurrent install failed for unrelated reason') from None
                else:raise RehearsalFailure('Concurrent installation bypassed batch lock')
                result=sql(container,'postgres',f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid={pid} AND datname='{database}' AND application_name='{application}'",actor='supabase_admin')
                terminated=result=='t'
                break
        _,tail=process.communicate(timeout=15);stderr.append(tail)
        if not reached or not terminated or process.returncode==0 or b'terminating connection' not in b''.join(stderr):
            raise RehearsalFailure('Controlled session interruption did not reach/terminate intended backend')
    finally:
        selected.close()
        if process.poll() is None:
            # Terminate only this program-owned nonce/clone session, never other sessions.
            sql(container,'postgres',f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{database}' AND application_name='{application}'",actor='supabase_admin')
            process.communicate(timeout=15)

def rehearse(container,source_db,package,output,baseline_kind):
    validate_container(container); manifest=validate_package(package)
    if not re.fullmatch('[a-z_][a-z_0-9]{0,62}',source_db):raise RehearsalFailure('Unreviewed source database identifier')
    if sql(container,source_db,"SELECT current_setting('server_version_num')")!='170011':raise RehearsalFailure('Actual PostgreSQL17.11 required')
    # pg_cron marks this GUC superuser-only. Read it with the isolated bootstrap
    # admin after container validation; never grant the restricted owner broader rights.
    cron=sql(container,source_db,"SELECT coalesce(current_setting('cron.launch_active_jobs',true),'not_installed')",actor='supabase_admin')
    if cron not in ('off','not_installed'):raise RehearsalFailure('Local restored cron must be disabled')
    baseline=tables(container,source_db)
    if baseline_kind=='recovered-private':
        count=sql(container,source_db,"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('auth','private','public','storage','televoting')")
        if count!='225':raise RehearsalFailure('Expected owner-observed225-table restored scope; synthetic substitute refused')
    before_data=data_digest(container,source_db,baseline);before_catalog=catalog_digest(container,source_db)
    clone='solaris_s13_batch_'+uuid.uuid4().hex[:16];created=False
    try:
        # PostgreSQL copies template databases only when they have no other sessions.
        # Use a different, disposable-cluster maintenance database for CREATE; never
        # keep the connection issuing CREATE inside the database being copied.
        # A restored cluster is network-none, but internal sessions can still race.
        for attempt in range(3):
            attached=sql(container,'template1',
                "SELECT count(*) FROM pg_stat_activity WHERE datname='"+source_db+"'",
                actor='supabase_admin')
            if attached!='0':
                if attempt<2: time.sleep(1)
                continue
            try:
                sql(container,'template1',f'CREATE DATABASE {clone} OWNER postgres TEMPLATE {source_db}',actor='supabase_admin')
            except subprocess.CalledProcessError as error:
                if b'55006' not in (error.stderr or b''):raise
                if attempt<2:time.sleep(1)
                continue
            created=True
            break
        if not created:
            raise RehearsalFailure('Isolated restored database still has active sessions; clone refused safely (55006)')
        clone_before_data=data_digest(container,clone,baseline);clone_before_catalog=catalog_digest(container,clone)
        if clone_before_data!=before_data or clone_before_catalog!=before_catalog:
            raise RehearsalFailure('Cloned baseline differs before installation')
        sql(container,clone,(package/'preflight.sql').read_text())
        install=(package/'install.sql').read_text()
        # Inject only into a temporary in-memory copy; immutable artifact is unchanged.
        interrupt_owned_session(container,clone,install)
        if tables(container,clone)!=baseline or data_digest(container,clone,baseline)!=before_data or catalog_digest(container,clone)!=before_catalog:
            raise RehearsalFailure('Interrupted transaction did not preserve baseline')
        sql(container,clone,install)
        sql(container,clone,(package/'postcheck.sql').read_text())
        for role in ('anon','authenticated','service_role'):
            state=json.loads(sql(container,clone,'SELECT public.v3_schema_compatibility(1);',actor=role))
            if state['status']!='compatible':raise RehearsalFailure('Compatibility read failed')
            for table in TABLES:
                expect_denial(container,clone,'TRUNCATE private.'+table,role)
                expect_denial(container,clone,'SELECT * FROM private.'+table,role)
            expect_denial(container,clone,"SELECT public.v3_register_migration_contract('v3.test.batch',1,'forward_fix_only',false,null,'Denied')",role)
            for call in ["v3_claim_backfill('v3.test.batch',1,1,'worker',30,0)","v3_checkpoint_backfill('v3.test.batch','worker','{}',0,0,null,false)","v3_fail_backfill('v3.test.batch','worker','TEST')","v3_record_migration_parity('v3.test.batch',null,0,0,0,0,0,'{}')","v3_set_schema_compatibility(1,1,1,'expand','v3.test.batch','Denied')"]:
                expect_denial(container,clone,'SELECT public.'+call,role)
        # Owner positive/replay check is rolled back, leaving exactly the canonical two seeds.
        owner=sql(container,clone,"BEGIN; SELECT public.v3_register_migration_contract('v3.test.batch',1,'forward_fix_only',false,null,'Owner test'); SELECT public.v3_register_migration_contract('v3.test.batch',1,'forward_fix_only',false,null,'Owner test'); ROLLBACK;")
        if '"replayed": false' not in owner or '"replayed": true' not in owner:raise RehearsalFailure('Owner/replay contract failed')
        try:sql(container,clone,install)
        except subprocess.CalledProcessError as error:
            if b'S13 recovery blocked: target already exists' not in error.stderr:raise RehearsalFailure('Duplicate rejected for unrelated reason') from None
        else:raise RehearsalFailure('Duplicate batch accepted')
        sql(container,clone,(package/'postcheck.sql').read_text())
        if data_digest(container,clone,baseline)!=before_data or catalog_digest(container,clone)!=before_catalog:
            raise RehearsalFailure('Original data or catalog/permissions changed')
        if data_digest(container,source_db,baseline)!=before_data or catalog_digest(container,source_db)!=before_catalog:
            raise RehearsalFailure('Original restored source database changed')
        result={'schemaVersion':1,'batchId':manifest['batchId'],'sourceSha':manifest['sourceSha'],
                'installSha256':manifest['artifacts']['install.sql']['sha256'],'postgresVersionNum':170011,'network':'none',
                'baselineKind':baseline_kind,'privateBackupOriginIndependentlyVerified':False,
                'operatorAssertedRecoveredBaseline':baseline_kind=='recovered-private',
                'batchAcceptancePassed':True,'existingTablesVerified':len(baseline),'existingDataPreserved':True,
                'existingCatalogPermissionsPreserved':True,'cloneOwnerMappedToObservedPostgres':True,'sourceDatabaseUnchanged':True,'transactionInterruptionRollback':True,
                'identicalRetryPassed':True,'concurrentInstallationDenied':True,'duplicateInstallationRefused':True,'apiWritersEnabled':False,
                'productionAuthorized':False,'authVaultRestorationCertified':False,
                'dataSha256':before_data,'catalogSha256':before_catalog}
        fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w')as out:json.dump(result,out,indent=2);out.write('\n')
        return result
    finally:
        if created:
            try:
                # DROP from a separate database, never from the object being dropped.
                sql(container,'template1','DROP DATABASE '+clone,actor='supabase_admin')
            except subprocess.CalledProcessError as cleanup_error:
                if sys.exc_info()[0] is not None:
                    # Do not mask the original failure. The enclosing operator always
                    # destroys the entire network-none temporary container.
                    print('STOP: disposable clone cleanup also failed; original error retained',file=sys.stderr)
                else:
                    raise RehearsalFailure('Disposable test-clone cleanup failed; source database unchanged') from None

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container');parser.add_argument('--source-database',default='postgres')
    parser.add_argument('--check-package',type=Path)
    parser.add_argument('--package',type=Path);parser.add_argument('--proof')
    parser.add_argument('--baseline-kind',choices=['observed-subset','recovered-private'])
    args=parser.parse_args()
    try:
        if args.check_package:
            validate_package(args.check_package)
            print('VALID: exact-source S13 dark package; no SQL executed')
            return 0
        if not all((args.container,args.package,args.proof,args.baseline_kind)):
            raise RehearsalFailure('Container, package, proof and baseline kind required')
        if os.environ.get('SOLARIS_RUN_LOCAL_DB_REHEARSAL')!='YES':raise RehearsalFailure('Local opt-in missing')
        result=rehearse(args.container,args.source_database,args.package,args.proof,args.baseline_kind)
        print(json.dumps({k:result[k]for k in ('batchId','sourceSha','batchAcceptancePassed','baselineKind','privateBackupOriginIndependentlyVerified','productionAuthorized')}))
        return 0
    except (RehearsalFailure,subprocess.SubprocessError,ValueError,KeyError,OSError) as error:
        try:
            fd=os.open((args.proof or 's13-batch')+'.failure.private.log',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'wb') as log:
                log.write(error.stderr if isinstance(error,subprocess.CalledProcessError) and error.stderr else str(error).encode())
        except OSError:pass
        print('STOP: S13 batch prerequisite/rehearsal failed; no qualification (private details not printed)',file=sys.stderr)
        return 1
if __name__=='__main__':sys.exit(main())
