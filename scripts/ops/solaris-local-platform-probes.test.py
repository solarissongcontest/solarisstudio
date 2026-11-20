#!/usr/bin/env python3
"""HTTP contract/negative tests only. This fake service is NOT Supabase recovery evidence."""
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import subprocess

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('probes',ROOT/'solaris-local-platform-probes.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
PAYLOAD=b'synthetic recovery canary'

class Handler(BaseHTTPRequestHandler):
    mode='safe'
    def log_message(self,*args): pass
    def do_GET(self):
        token=self.headers.get('Authorization','')
        status,body=403,b'{}'
        if self.path=='/auth/v1/user':
            if token in ('Bearer owner','Bearer other'):
                status,body=200,json.dumps({'id':token.removeprefix('Bearer ')}).encode()
            else: status=401
        elif self.path.startswith('/storage/v1/object/authenticated/'):
            if token=='Bearer owner': status,body=200,PAYLOAD
            elif self.mode=='leak': status,body=200,PAYLOAD
            elif self.mode=='error_leak': status,body=403,PAYLOAD
        if self.mode=='redirect': status=302
        self.send_response(status); self.end_headers(); self.wfile.write(body)

class Tests(unittest.TestCase):
    def config(self,port=54321):
        return dict(base_url=f'http://127.0.0.1:{port}',synthetic_fixture=True,egress_isolated=True,
                    anon_key='local-anon',owner_token='owner',other_token='other',expired_token='expired',
                    owner_id='owner',other_id='other',bucket='private-canary',object_key='owner/canary',
                    sha256=hashlib.sha256(PAYLOAD).hexdigest())

    def test_targets_fail_closed(self):
        for target in ('https://prod.supabase.co','http://localhost:54321','http://127.0.0.2:54321',
                       'http://127.0.0.1:54321/redirect','http://127.0.0.1:54321?url=hosted','http://user:secret@127.0.0.1:54321',
                       'http://127.0.0.1'):
            with self.subTest(target=target):
                config=self.config(); config['base_url']=target
                with self.assertRaises(module.ProbeFailure): module.validate_config(config)
        config=self.config(); config['egress_isolated']=False
        with self.assertRaises(module.ProbeFailure): module.validate_config(config)

    def test_private_config_and_symlinks(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'config'; p.write_text(json.dumps(self.config())); p.chmod(0o600)
            self.assertEqual(module.load_config(p)['owner_id'],'owner')
            p.chmod(0o644)
            with self.assertRaises(module.ProbeFailure): module.load_config(p)
            (Path(d)/'link').symlink_to(p)
            with self.assertRaises(OSError): module.load_config(Path(d)/'link')

    def test_runtime_verifies_gateway_internal_network_and_pg_version(self):
        config=self.config()
        ids=[x*64 for x in 'abcd']; network='e'*64
        config.update(runtime_containers=ids,gateway_container=ids[0],database_container=ids[1])
        observed=[{'Id':identity,'State':{'Running':True},'HostConfig':{'NetworkMode':'internal','Privileged':False},
                   'NetworkSettings':{'Networks':{'internal':{'NetworkID':network}},'Ports':{'8000/tcp':[{'HostIp':'127.0.0.1','HostPort':'54321'}]} if i==0 else {}},'Mounts':[]}
                   for i,identity in enumerate(ids)]
        def responses(internal=True,version=b'170011\n'):
            return [subprocess.CompletedProcess([],0,json.dumps(observed).encode()),
                    subprocess.CompletedProcess([],0,json.dumps([{'Id':network,'Internal':internal}]).encode()),
                    subprocess.CompletedProcess([],0,version)]
        with patch.object(module.subprocess,'run',side_effect=responses()) as call:
            module.verify_runtime(config)
            self.assertIn('/var/run/postgresql',call.call_args.args[0])
        for internal,version in [(False,b'170011'),(True,b'170006')]:
            with patch.object(module.subprocess,'run',side_effect=responses(internal,version)):
                with self.assertRaises(module.ProbeFailure): module.verify_runtime(config)
        observed[0]['NetworkSettings']['Ports']['8000/tcp'][0]['HostIp']='0.0.0.0'
        with patch.object(module.subprocess,'run',side_effect=responses()):
            with self.assertRaises(module.ProbeFailure): module.verify_runtime(config)
        with self.assertRaises(module.ProbeFailure): module.verify_runtime(self.config())

    def test_http_contract_and_negative_authority(self):
        server=HTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
        try:
            config=self.config(server.server_port)
            Handler.mode='safe'
            result=module.run(config)
            self.assertEqual(len(result['checks']),11)
            self.assertFalse(result['full_auth_storage_vault_recovery_certified'])
            for mode in ('leak','error_leak','redirect'):
                with self.subTest(mode=mode):
                    Handler.mode=mode
                    with self.assertRaises(module.ProbeFailure): module.run(config)
        finally:
            server.shutdown(); server.server_close(); thread.join()

if __name__=='__main__': unittest.main()
