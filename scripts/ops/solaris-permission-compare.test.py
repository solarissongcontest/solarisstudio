#!/usr/bin/env python3
"""Offline tests plus opt-in networkless PostgreSQL 17.11 execution; synthetic data only."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('comparison', ROOT / 'solaris-permission-compare.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ComparatorTests(unittest.TestCase):
    def fixture(self):
        return {'schema_version':1,'scope':module.SCOPE,'complete':True,'read_only':True,
                'observed_at':'2026-11-20T00:00:00Z','database':'postgres','server_version_num':170011,
                'sections':{'relations':[{'identity':'public.example','kind':'r','owner':'owner','rls':True,'force_rls':False,
                    'raw_acl':None,'grants':[],'view_security_options':[],'effective_api_grants':{r:[] for r in module.API_ROLES}}],
                'schemas':[{'identity':s,'owner':'owner','grants':[]} for s in module.SCOPE],
                'columns':[], 'policies':[], 'default_acls':[], 'roles':[{'identity':'owner','superuser':False,'inherit':True,
                    'create_role':False,'create_db':False,'login':False,'replication':False,'bypass_rls':False,
                    'connection_limit':-1,'valid_until':None}]+[{'identity':r,'superuser':False,'inherit':True,'create_role':False,'create_db':False,'login':False,'replication':False,'bypass_rls':False,'connection_limit':-1,'valid_until':None} for r in module.API_ROLES], 'memberships':[], 'role_config':[]}}

    def test_exact_and_array_order(self):
        a = self.fixture(); b = copy.deepcopy(a); b['sections']['schemas'].reverse()
        self.assertEqual(module.compare(a,b)['status'], 'SCOPED_MATCH')

    def test_representation_is_distinct_from_authority_change(self):
        a = self.fixture(); b = copy.deepcopy(a); b['sections']['relations'][0]['raw_acl'] = '{}'
        result = module.compare(a,b)
        self.assertEqual(result['status'], 'SCOPED_MATCH'); self.assertEqual(len(result['representation_only']), 1)
        b['sections']['relations'][0]['owner'] = 'different'
        self.assertEqual(module.compare(a,b)['changes'][0]['fields'], ['owner'])

    def test_missing_evidence_refused(self):
        for alter in [lambda a:a.update(complete=False), lambda a:a.update(read_only=False),
                      lambda a:a['sections'].pop('roles'), lambda a:a['sections']['schemas'].pop(),
                      lambda a:a['sections']['relations'][0].pop('rls'), lambda a:a['sections']['relations'][0].update(rls='false'),
                      lambda a:a['sections']['relations'][0].update(effective_api_grants={}), lambda a:a.update(server_version_num=170000-1),
                      lambda a:a['sections']['relations'].append(a['sections']['relations'][0])]:
            with self.subTest(alter=alter):
                a = self.fixture(); alter(a)
                with self.assertRaises(ValueError): module.compare(a,self.fixture())

    def test_uncaptured_role_config_cannot_pass(self):
        a = self.fixture()
        a['sections']['role_config'] = [{'identity':'owner:<all>:custom.key','name':'custom.key','value':None,'captured':False}]
        self.assertEqual(module.compare(a,a)['status'], 'INCOMPLETE')

    def test_summary_has_no_private_identities(self):
        result=module.summarize(self.fixture())
        self.assertNotIn('public.example',json.dumps(result))
        self.assertEqual(result['schemas']['public']['tables'],1)
        self.assertFalse(result['certifies_s16_or_platform_recovery'])

    def test_report_private_and_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory); data = json.dumps(self.fixture())
            (p/'a').write_text(data); (p/'b').write_text(data)
            args = ['python3', str(ROOT/'solaris-permission-compare.py'), str(p/'a'),str(p/'b'),'--report',str(p/'report')]
            self.assertEqual(subprocess.run(args, capture_output=True).returncode,0)
            self.assertEqual((p/'report').stat().st_mode & 0o777, 0o600)
            self.assertEqual(subprocess.run(args, capture_output=True).returncode,1)

@unittest.skipUnless(os.environ.get('SOLARIS_SYNTHETIC_PG') == '1', 'opt-in isolated PostgreSQL runtime')
class PostgresTests(unittest.TestCase):
    @classmethod
    def command(cls, *args, input=None):
        return subprocess.run(args, input=input, capture_output=True, check=True).stdout

    @classmethod
    def sql(cls, sql, database='postgres'):
        return cls.command('docker','exec','-i',cls.container,'psql','-X','-qAt','-U','postgres','-d',database,
                           '-v','ON_ERROR_STOP=1', input=sql.encode()).decode()

    @classmethod
    def snapshot(cls, database='source'):
        return json.loads(cls.sql((ROOT/'solaris-permission-snapshot.sql').read_text(),database))

    @classmethod
    def setUpClass(cls):
        cls.container = f'solaris-permission-synthetic-{os.getpid()}'
        cls.command('docker','image','inspect','postgres:17.11')  # Missing local image: fail, no fallback.
        cls.command('docker','run','-d','--rm','--name',cls.container,'--network','none','--memory','768m',
                    '--tmpfs','/var/lib/postgresql/data:rw,size=384m','-e','POSTGRES_HOST_AUTH_METHOD=trust',
                    'postgres:17.11','-c','listen_addresses=')
        try:
            for _ in range(60):
                if subprocess.run(['docker','exec',cls.container,'sh','-c',
                    'test "$(cat /proc/1/comm)" = postgres && pg_isready -U postgres'],capture_output=True).returncode == 0:
                    break
                time.sleep(0.25)
            else: raise RuntimeError('Isolated PostgreSQL unavailable; no hosted fallback')
            cls.sql('CREATE ROLE owner_role; CREATE ROLE visitor; CREATE ROLE staff; CREATE ROLE api_parent; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE DATABASE source; CREATE DATABASE restored;')
            cls.sql('''CREATE SCHEMA auth AUTHORIZATION owner_role; CREATE SCHEMA private AUTHORIZATION owner_role;
                CREATE SCHEMA storage AUTHORIZATION owner_role; CREATE SCHEMA televoting AUTHORIZATION owner_role;
                CREATE TABLE public.example(id int PRIMARY KEY, visible boolean); ALTER TABLE public.example OWNER TO owner_role;
                INSERT INTO public.example VALUES (1,true),(2,false);
                ALTER TABLE public.example ENABLE ROW LEVEL SECURITY;
                CREATE POLICY visible ON public.example TO visitor USING (visible);
                GRANT USAGE ON SCHEMA public TO visitor; GRANT SELECT ON public.example TO visitor;
                CREATE TABLE private.hidden(id int); ALTER TABLE private.hidden OWNER TO owner_role;
                ALTER DEFAULT PRIVILEGES FOR ROLE owner_role IN SCHEMA public GRANT SELECT ON TABLES TO staff;
                GRANT visitor TO staff WITH INHERIT FALSE, SET TRUE;
                ALTER ROLE visitor SET statement_timeout='3s';
                CREATE VIEW public.visible_view AS SELECT id FROM public.example;
                GRANT api_parent TO anon WITH INHERIT FALSE;''','source')
        except BaseException:
            cls.command('docker','rm','-f',cls.container)
            raise

    @classmethod
    def tearDownClass(cls):
        cls.command('docker','rm','-f',cls.container)

    def test_01_owner_acl_dump_restore_and_actual_rls(self):
        self.assertEqual(self.sql('SHOW server_version_num').strip(),'170011')
        inspection = json.loads(self.command('docker','inspect',self.container))[0]
        self.assertEqual(inspection['HostConfig']['NetworkMode'],'none')
        self.assertFalse(inspection['HostConfig']['PortBindings'])
        dump = self.command('docker','exec',self.container,'pg_dump','-U','postgres','-d','source','-Fc')
        self.command('docker','exec','-i',self.container,'pg_restore','-U','postgres','-d','restored',
                     '--exit-on-error','--single-transaction',input=dump)
        self.assertEqual(module.compare(self.snapshot(),self.snapshot('restored'))['status'],'SCOPED_MATCH')
        self.assertEqual(self.sql('SELECT id,visible FROM public.example ORDER BY id','restored'),self.sql('SELECT id,visible FROM public.example ORDER BY id','source'))
        self.assertEqual(self.sql('BEGIN READ ONLY; SET LOCAL ROLE visitor; SELECT count(*) FROM public.example; ROLLBACK;','restored').strip(),'1')
        for query in ['SELECT * FROM private.hidden','INSERT INTO public.example VALUES(3,true)','TRUNCATE public.example']:
            with self.assertRaises(subprocess.CalledProcessError):
                self.sql(f'BEGIN; SET LOCAL ROLE visitor; {query}; ROLLBACK;','restored')

    def test_02_real_acl_order_only_is_identified(self):
        self.sql('CREATE TABLE public.acl_order(id int); ALTER TABLE public.acl_order OWNER TO owner_role; GRANT SELECT ON public.acl_order TO visitor; GRANT SELECT ON public.acl_order TO staff;','source')
        before = self.snapshot()
        self.sql('REVOKE SELECT ON public.acl_order FROM visitor; GRANT SELECT ON public.acl_order TO visitor;','source')
        result = module.compare(before,self.snapshot())
        self.assertEqual(result['status'],'SCOPED_MATCH')
        self.assertEqual([x['identity'] for x in result['representation_only']],['public.acl_order'])

    def test_03_each_real_authority_change_is_detected(self):
        cases = [
            ('ALTER TABLE public.example OWNER TO staff','relations','owner'),
            ('GRANT SELECT ON public.example TO visitor WITH GRANT OPTION','relations','grants'),
            ('GRANT UPDATE(id) ON public.example TO visitor','columns','grants'),
            ('ALTER TABLE public.example DISABLE ROW LEVEL SECURITY','relations','rls'),
            ('ALTER POLICY visible ON public.example USING (true)','policies','using_md5'),
            ('GRANT USAGE ON SCHEMA private TO visitor','schemas','grants'),
            ('ALTER DEFAULT PRIVILEGES FOR ROLE owner_role IN SCHEMA public GRANT INSERT ON TABLES TO staff','default_acls','grants'),
            ('ALTER ROLE visitor BYPASSRLS','roles','bypass_rls'),
            ('ALTER VIEW public.visible_view SET(security_invoker=true)','relations','view_security_options'),
            ('GRANT visitor TO staff WITH INHERIT TRUE','memberships','inherit'),
            ("ALTER ROLE visitor SET statement_timeout='5s'",'role_config','value'),
        ]
        for statement,section,field in cases:
            with self.subTest(statement=statement):
                before = self.snapshot()
                # Snapshot and modification share a transaction, then rollback must fully preserve the baseline.
                sql = (ROOT/'solaris-permission-snapshot.sql').read_text()
                inner = sql[sql.index('SET LOCAL statement_timeout'):sql.rindex('COMMIT;')]
                changed = json.loads(self.sql('BEGIN; '+statement+'; SET TRANSACTION READ ONLY; '+inner+' ROLLBACK;','source'))
                result = module.compare(before,changed)
                self.assertTrue(any(x['section']==section and field in x.get('fields',[]) for x in result['changes']),result)
                self.assertEqual(module.compare(before,self.snapshot())['status'],'SCOPED_MATCH')

    def test_04_inherited_truncate_is_effective_and_rls_does_not_protect_it(self):
        self.sql('GRANT TRUNCATE ON public.example TO api_parent;','source')
        before=self.snapshot()
        self.sql('GRANT api_parent TO anon WITH INHERIT TRUE;','source')
        result=module.compare(before,self.snapshot())
        self.assertTrue(any('effective_api_grants' in x.get('fields',[]) for x in result['changes']))
        rows=self.sql('SELECT id,visible FROM public.example ORDER BY id','source')
        self.assertEqual(self.sql('BEGIN; SET LOCAL ROLE anon; TRUNCATE public.example; ROLLBACK;','source').strip(),'')
        self.assertEqual(self.sql('SELECT id,visible FROM public.example ORDER BY id','source'),rows)
        self.sql('GRANT api_parent TO anon WITH INHERIT FALSE; REVOKE TRUNCATE ON public.example FROM api_parent;','source')

    def test_05_secret_setting_is_not_exported(self):
        self.sql("ALTER ROLE visitor SET app.private_key='SYNTHETIC-DO-NOT-EXPORT';")
        result = self.snapshot()
        self.assertNotIn('SYNTHETIC-DO-NOT-EXPORT',json.dumps(result))
        self.assertEqual(module.compare(result,result)['status'],'INCOMPLETE')
        self.sql('ALTER ROLE visitor RESET app.private_key;')

if __name__ == '__main__':
    unittest.main()
