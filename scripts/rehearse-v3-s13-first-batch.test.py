#!/usr/bin/env python3
"""Real PG17.11 tests on the established observed S13 dependency SUBSET, not private backup."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
from unittest import mock
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('rehearsal',ROOT/'scripts/rehearse-v3-s13-first-batch.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CronGuardTests(unittest.TestCase):
    """No Docker or production access: prove the protected GUC read's role boundary."""
    def test_cron_guard_reads_as_local_bootstrap_admin(self):
        class GuardReached(Exception): pass
        observed=[]
        def probe(container,database,source,actor='postgres'):
            observed.append((source,actor))
            if "server_version_num" in source:
                self.assertEqual(actor,'postgres')
                return '170011'
            if "cron.launch_active_jobs" in source:
                self.assertEqual(actor,'supabase_admin')
                raise GuardReached
            self.fail('Unrelated SQL executed before the cron guard')
        with mock.patch.object(module,'validate_container'), \
             mock.patch.object(module,'validate_package',return_value={}), \
             mock.patch.object(module,'sql',side_effect=probe):
            with self.assertRaises(GuardReached):
                module.rehearse('isolated-container','postgres',Path('/not-read'),'/not-written','observed-subset')
        self.assertEqual(len(observed),2)

    def test_cron_guard_still_fails_closed_when_enabled(self):
        def probe(container,database,source,actor='postgres'):
            if "server_version_num" in source: return '170011'
            if "cron.launch_active_jobs" in source:
                self.assertEqual(actor,'supabase_admin')
                return 'on'
            self.fail('Cron-enabled baseline should never reach subsequent SQL')
        with mock.patch.object(module,'validate_container'), \
             mock.patch.object(module,'validate_package',return_value={}), \
             mock.patch.object(module,'sql',side_effect=probe):
            with self.assertRaisesRegex(module.RehearsalFailure,'Local restored cron must be disabled'):
                module.rehearse('isolated-container','postgres',Path('/not-read'),'/not-written','observed-subset')



class PrivateCloneIsolationTests(unittest.TestCase):
    """No hosted/backup access: prove maintenance-DB cloning and busy-source refusal."""
    def test_clone_is_issued_from_template1_not_restored_source(self):
        class CloneReached(Exception): pass
        operations=[]
        def probe(container,database,source,actor='postgres'):
            operations.append((database,source,actor))
            if "server_version_num" in source: return '170011'
            if "cron.launch_active_jobs" in source: return 'off'
            if "pg_stat_activity" in source: return '0'
            if source.startswith('CREATE DATABASE '): return ''
            if source.startswith('DROP DATABASE '): return ''
            self.fail('Unexpected SQL issued in mock clone check')
        def catalog(container,database):
            if database.startswith('solaris_s13_batch_'): raise CloneReached
            return 'source-fingerprint'
        with mock.patch.object(module,'validate_container'), \
             mock.patch.object(module,'validate_package',return_value={}), \
             mock.patch.object(module,'sql',side_effect=probe), \
             mock.patch.object(module,'tables',return_value=['public.fixture']), \
             mock.patch.object(module,'data_digest',return_value='source-data'), \
             mock.patch.object(module,'catalog_digest',side_effect=catalog):
            with self.assertRaises(CloneReached):
                module.rehearse('network-none-container','postgres',Path('/not-used'),'/not-written','observed-subset')
        creates=[op for op in operations if op[1].startswith('CREATE DATABASE ')]
        drops=[op for op in operations if op[1].startswith('DROP DATABASE ')]
        self.assertEqual(len(creates),1)
        self.assertEqual(len(drops),1)
        self.assertEqual(creates[0][0],'template1')
        self.assertEqual(drops[0][0],'template1')
        self.assertEqual(creates[0][2],'supabase_admin')

    def test_busy_source_never_cloned_or_terminated(self):
        operations=[]
        def probe(container,database,source,actor='postgres'):
            operations.append((database,source))
            if "server_version_num" in source:return '170011'
            if "cron.launch_active_jobs" in source:return 'off'
            if "pg_stat_activity" in source:return '2'
            self.fail('No mutation permitted when the source remains busy')
        with mock.patch.object(module,'validate_container'), \
             mock.patch.object(module,'validate_package',return_value={}), \
             mock.patch.object(module,'sql',side_effect=probe), \
             mock.patch.object(module,'tables',return_value=['public.fixture']), \
             mock.patch.object(module,'data_digest',return_value='source-data'), \
             mock.patch.object(module,'catalog_digest',return_value='source-catalog'), \
             mock.patch.object(module.time,'sleep'):
            with self.assertRaisesRegex(module.RehearsalFailure,'active sessions'):
                module.rehearse('network-none-container','postgres',Path('/not-used'),'/not-written','observed-subset')
        self.assertEqual(sum('pg_stat_activity' in sql for _,sql in operations),3)
        self.assertFalse(any(sql.startswith('CREATE DATABASE ') or sql.startswith('DROP DATABASE ') for _,sql in operations))


class Tests(unittest.TestCase):
    @classmethod
    def command(cls,*args,input=None):return subprocess.run(args,input=input,capture_output=True,check=True).stdout
    @classmethod
    def sql(cls,source,database='postgres',user='postgres'):
        prefix='' if user=='supabase_admin' else 'SET SESSION AUTHORIZATION '+user+';\n'
        return cls.command('docker','exec','-i',cls.container,'psql','-X','-qAt','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',input=(prefix+source).encode()).decode().strip()
    @classmethod
    def setUpClass(cls):
        if os.environ.get('SOLARIS_RUN_LOCAL_DB_REHEARSAL')!='YES':raise RuntimeError('Explicit isolated opt-in required')
        cls.tmp=tempfile.TemporaryDirectory();cls.package=Path(cls.tmp.name)/'package'
        subprocess.run(['node','scripts/package-v3-s13-first-batch.mjs',str(cls.package)],cwd=ROOT,capture_output=True,check=True)
        cls.container=cls.command('docker','run','-d','--rm','--network','none','--memory','1g',
            '--tmpfs','/var/lib/postgresql/data:rw,size=512m','-e','POSTGRES_USER=supabase_admin',
            '-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.11','-c','listen_addresses=').decode().strip()
        try:
            for _ in range(100):
                if subprocess.run(['docker','exec',cls.container,'sh','-c','test "$(cat /proc/1/comm)" = postgres && pg_isready -U supabase_admin'],capture_output=True).returncode==0:break
                time.sleep(.2)
            else:raise RuntimeError('Isolated PG startup failed; no hosted fallback')
            cls.sql('CREATE ROLE postgres NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT CREATE ON DATABASE postgres TO postgres;',user='supabase_admin')
            fixture=(ROOT/'docs/v3/recovery-candidates/fixtures/s13-production-dependency-subset-20261107.sql').read_text()
            cls.sql(fixture)
            cls.sql('REVOKE CREATE ON DATABASE postgres FROM postgres',user='supabase_admin')
            cls.sql('''CREATE TABLE public.s13_prior_results(id integer PRIMARY KEY, published_points integer);
                INSERT INTO public.s13_prior_results SELECT id,id*12 FROM generate_series(1,66) id;
                CREATE TABLE public.s13_prior_votes(id integer PRIMARY KEY, private_value text);
                INSERT INTO public.s13_prior_votes VALUES(1,'synthetic-private-ballot');
                ALTER TABLE public.s13_prior_votes ENABLE ROW LEVEL SECURITY;
                GRANT SELECT ON public.s13_prior_votes TO authenticated;
                CREATE POLICY preserve_filter ON public.s13_prior_votes FOR SELECT TO authenticated USING(false);
                CREATE FUNCTION private.s13_preserve_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'preserve synthetic guard'; END$$;
                CREATE TRIGGER preserve_guard BEFORE UPDATE OR DELETE ON public.s13_prior_results FOR EACH ROW EXECUTE FUNCTION private.s13_preserve_guard();
                CREATE SCHEMA supabase_migrations AUTHORIZATION postgres;
                CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text);
                INSERT INTO supabase_migrations.schema_migrations VALUES('20261101181812','synthetic-ledger-preservation-marker');''',user='supabase_admin')
        except BaseException:
            cls.command('docker','rm','-f',cls.container);cls.tmp.cleanup();raise
    @classmethod
    def tearDownClass(cls):
        cls.command('docker','rm','-f',cls.container);cls.tmp.cleanup()
    def clone(self):
        import uuid
        name='s13_test_'+uuid.uuid4().hex[:12]
        self.sql('CREATE DATABASE '+name+' OWNER postgres TEMPLATE postgres',user='supabase_admin')
        self.addCleanup(lambda:self.sql('DROP DATABASE '+name,user='supabase_admin'))
        return name
    def test_01_complete_dark_batch_clone_rehearsal(self):
        proof=Path(self.tmp.name)/'proof.json'
        result=module.rehearse(self.container,'postgres',self.package,str(proof),'observed-subset')
        self.assertTrue(result['batchAcceptancePassed']);self.assertFalse(result['privateBackupOriginIndependentlyVerified'])
        self.assertFalse(result['apiWritersEnabled']);self.assertFalse(result['productionAuthorized'])
        self.assertEqual(proof.stat().st_mode&0o777,0o600)
    def test_02_original_candidate_bug_and_object_scoped_correction(self):
        old=self.clone();new=self.clone()
        for database in (old,new):
            self.sql('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private GRANT ALL ON TABLES TO service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;',database)
        original=(ROOT/'docs/v3/recovery-candidates/forward-only-s13-foundation.sql').read_text()
        self.sql(original,old)
        self.assertEqual(self.sql("SELECT has_table_privilege('service_role','private.v3_migration_contracts','TRUNCATE')",old),'t','Regression must reproduce the original default-ACL gap')
        before=module.catalog_digest(self.container,new)
        self.sql((self.package/'install.sql').read_text(),new)
        self.sql((self.package/'postcheck.sql').read_text(),new)
        self.assertEqual(module.catalog_digest(self.container,new),before,'Unrelated defaults/objects must be preserved')
        self.assertEqual(self.sql("SELECT has_table_privilege('service_role','private.v3_migration_contracts','TRUNCATE')",new),'f')
    def test_03_partial_helper_drift_and_event_handler_are_rejected(self):
        cases=[('CREATE TABLE private.v3_schema_compatibility(x int)','target already exists'),
               ("CREATE OR REPLACE FUNCTION private.studio2_request_is_service_role() RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$SELECT true$$",'current hosted helper fingerprint differs')]
        for modification,reason in cases:
            with self.subTest(reason=reason):
                db=self.clone();self.sql(modification,db);before=module.catalog_digest(self.container,db)
                with self.assertRaises(subprocess.CalledProcessError) as caught:self.sql((self.package/'install.sql').read_text(),db)
                self.assertIn(reason.encode(),caught.exception.stderr)
                self.assertEqual(module.catalog_digest(self.container,db),before)
        db=self.clone()
        self.sql('CREATE FUNCTION private.s13_unreviewed_event() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN RETURN; END$$; CREATE EVENT TRIGGER s13_unreviewed ON ddl_command_end EXECUTE FUNCTION private.s13_unreviewed_event();',db,user='supabase_admin')
        before=module.catalog_digest(self.container,db)
        with self.assertRaises(subprocess.CalledProcessError) as caught:self.sql((self.package/'install.sql').read_text(),db)
        self.assertIn(b'S13 batch unqualified DDL event handler',caught.exception.stderr)
        self.assertEqual(module.catalog_digest(self.container,db),before)
    def test_04_package_tampering_and_false_private_origin_refused(self):
        copy=Path(self.tmp.name)/'tampered';shutil.copytree(self.package,copy)
        manifest=json.loads((copy/'manifest.json').read_text());manifest['inputs']=[]
        (copy/'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaises(module.RehearsalFailure):module.validate_package(copy)
        with self.assertRaises(module.RehearsalFailure):
            module.rehearse(self.container,'postgres',self.package,str(Path(self.tmp.name)/'false-private.json'),'recovered-private')
    def test_05_real_column_rpc_and_owner_negative_postchecks(self):
        db=self.clone();self.sql((self.package/'install.sql').read_text(),db)
        before=module.catalog_digest(self.container,db)
        for sql in ["GRANT UPDATE(schema_version) ON private.v3_migration_contracts TO service_role",
                    "GRANT EXECUTE ON FUNCTION public.v3_register_migration_contract(text,integer,text,boolean,text,text) TO authenticated"]:
            with self.subTest(sql=sql):
                # Transaction rollback restores the sanctioned baseline after failed postconditions.
                with self.assertRaises(subprocess.CalledProcessError) as caught:self.sql('BEGIN; '+sql+'; '+(ROOT/'docs/v3/recovery-candidates/s13-first-batch-postconditions.sql').read_text(),db)
                self.assertIn(b'42501',caught.exception.stderr)
                self.assertEqual(module.catalog_digest(self.container,db),before)
    def test_07_qualified_postgrest_ddl_watcher_is_preserved(self):
        # Observed hosted Supabase PostgreSQL 17.11 watcher, definition pinned
        # read-only on 20 November. The handler only NOTIFYs schema reload;
        # any different/mutating handler must still be rejected by preflight.
        db=self.clone()
        self.sql('CREATE SCHEMA extensions AUTHORIZATION supabase_admin',db,user='supabase_admin')
        self.sql(r"""CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $function$;""",db,user='supabase_admin')
        self.sql("CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end EXECUTE FUNCTION extensions.pgrst_ddl_watch()",db,user='supabase_admin')
        definition=self.sql("SELECT md5(pg_get_functiondef('extensions.pgrst_ddl_watch()'::regprocedure))",db,user='supabase_admin')
        self.assertEqual(definition,'afaad7193dcf8f81e728d2bedb85e43e',
                         'The test must reproduce the exact hosted definition')
        before=module.catalog_digest(self.container,db)
        self.sql((self.package/'preflight.sql').read_text(),db)
        self.sql((self.package/'install.sql').read_text(),db)
        self.sql((self.package/'postcheck.sql').read_text(),db)
        self.assertEqual(module.catalog_digest(self.container,db),before,
                         'Provider-owned PostgREST watcher and previous catalog must be unchanged')
        self.assertEqual(self.sql("SELECT evtenabled FROM pg_event_trigger WHERE evtname='pgrst_ddl_watch'",db),
                         'O','Provider watcher must never be disabled')

        # Changing its exact function body or ownership must refuse future
        # batches. Never permit arbitrary event handlers through a name match.
        different=self.clone()
        self.sql('CREATE SCHEMA extensions AUTHORIZATION supabase_admin',different,user='supabase_admin')
        self.sql("""CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
                     LANGUAGE plpgsql AS 'BEGIN NULL; END';""",different,user='supabase_admin')
        self.sql("CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end EXECUTE FUNCTION extensions.pgrst_ddl_watch()",different,user='supabase_admin')
        initial=module.catalog_digest(self.container,different)
        with self.assertRaises(subprocess.CalledProcessError) as caught:
            self.sql((self.package/'install.sql').read_text(),different)
        self.assertIn(b'S13 batch unqualified DDL event handler',caught.exception.stderr)
        self.assertEqual(module.catalog_digest(self.container,different),initial)

    def test_06_no_source_database_or_clone_left_over(self):
        self.assertEqual(self.sql("SELECT count(*) FROM pg_database WHERE datname LIKE 'solaris_s13_batch_%'"),'0')
        self.assertEqual(self.sql('SELECT count(*) FROM public.s13_prior_results',user='supabase_admin'),'66')
        self.assertEqual(self.sql("SELECT count(*) FROM pg_class WHERE oid=to_regclass('private.v3_migration_contracts')"),'0')
if __name__=='__main__':unittest.main()
