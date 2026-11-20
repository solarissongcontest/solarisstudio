#!/usr/bin/env python3
"""Bounded, read-only Auth/Storage HTTP probes against an operator-owned isolated fixture.

Tokens and object identities come from a 0600 local configuration, never CLI arguments.
Passing probes certify only the supplied canaries, not provider/config/Vault restoration.
"""
import argparse
import hashlib
import http.client
import json
import os
import stat
import subprocess
import re
import sys
from urllib.parse import quote, urlsplit

LIMIT = 16 * 1024 * 1024

class ProbeFailure(Exception):
    pass

def load_config(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as stream:
        st = os.fstat(stream.fileno())
        if not stat.S_ISREG(st.st_mode) or st.st_mode & 0o077:
            raise ProbeFailure('Configuration must be a private regular file')
        config = json.load(stream)
    validate_config(config)
    return config

def validate_config(config):
    target = urlsplit(config.get('base_url',''))
    if (target.scheme != 'http' or target.hostname != '127.0.0.1' or target.username or target.password
        or target.path not in ('','/') or target.query or target.fragment or not target.port):
        raise ProbeFailure('Only explicit loopback HTTP ports are supported; no hosted/proxy target')
    if config.get('synthetic_fixture') is not True or config.get('egress_isolated') is not True:
        raise ProbeFailure('Explicit synthetic fixture and isolated-egress attestations required')
    required = ('anon_key','owner_token','other_token','expired_token','owner_id','other_id','bucket','object_key','sha256')
    if any(not isinstance(config.get(k),str) or not config[k] or '\n' in config[k] or '\r' in config[k] for k in required):
        raise ProbeFailure('Incomplete synthetic Auth/Storage fixture')
    if config['owner_id'] == config['other_id'] or len({config[k] for k in ('owner_token','other_token','expired_token')}) != 3:
        raise ProbeFailure('Independent users and expired token required')
    if len(config['sha256']) != 64 or any(x not in '0123456789abcdef' for x in config['sha256']):
        raise ProbeFailure('Expected synthetic payload SHA-256 required')
    for key in ('bucket','object_key'):
        if any(p in ('','.', '..') for p in config[key].split('/')) or '\\' in config[key]:
            raise ProbeFailure('Invalid fixture object path')
    return target

def verify_runtime(config):
    """Reject a loopback gateway backed by an externally connected Docker stack."""
    containers=config.get('runtime_containers',[])
    gateway=config.get('gateway_container','')
    database=config.get('database_container','')
    if (not isinstance(containers,list) or not 4 <= len(containers) <= 12 or len(set(containers)) != len(containers)
        or any(not isinstance(c,str) or not re.fullmatch(r'[a-f0-9]{64}',c) for c in containers)
        or gateway not in containers or database not in containers or gateway == database):
        raise ProbeFailure('Exact gateway/Auth/Storage/database container identities required')
    def docker_json(*args):
        result=subprocess.run(['docker',*args],capture_output=True,check=True,timeout=10)
        return json.loads(result.stdout)
    observed=docker_json('inspect','--type','container',*containers)
    if {c['Id'] for c in observed} != set(containers):
        raise ProbeFailure('Container identity mismatch')
    networks=set(); port_verified=False
    for container in observed:
        host=container['HostConfig']; net=container['NetworkSettings']
        if not container['State']['Running'] or host.get('Privileged') or host.get('NetworkMode') == 'host':
            raise ProbeFailure('Unsafe or stopped fixture container')
        if any(m.get('Source','').endswith('docker.sock') for m in container.get('Mounts',[])):
            raise ProbeFailure('Docker control socket forbidden in fixture')
        if not net.get('Networks'):
            raise ProbeFailure('Unverified fixture network')
        networks.update(n['NetworkID'] for n in net['Networks'].values())
        for bindings in (net.get('Ports') or {}).values():
            for binding in bindings or []:
                if binding['HostIp'] != '127.0.0.1':
                    raise ProbeFailure('Fixture exposes a nonloopback port')
                if container['Id'] == gateway and int(binding['HostPort']) == validate_config(config).port:
                    port_verified=True
    if not port_verified:
        raise ProbeFailure('Loopback port does not belong to the inspected gateway')
    if not networks or any(not re.fullmatch(r'[a-f0-9]{64}',n) for n in networks):
        raise ProbeFailure('Invalid network identity')
    observed_networks=docker_json('network','inspect',*sorted(networks))
    if {n['Id'] for n in observed_networks} != networks or any(n.get('Internal') is not True for n in observed_networks):
        raise ProbeFailure('Every fixture network must be Docker-internal; no hosted fallback')
    # Force a Unix socket, never inherited PGHOST or a remote database URL.
    version=subprocess.run(['docker','exec',database,'psql','-X','-qAt','-h','/var/run/postgresql',
                            '-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',
                            "BEGIN READ ONLY; SELECT current_setting('server_version_num'); COMMIT;"],
                           capture_output=True,check=True,timeout=10).stdout.decode().strip()
    if version != '170011':
        raise ProbeFailure('Actual isolated PostgreSQL 17.11 runtime required')

def request(config, path, token=None):
    target = validate_config(config)
    # HTTPConnection ignores proxy environment variables and does not follow redirects.
    connection = http.client.HTTPConnection('127.0.0.1', target.port, timeout=5)
    try:
        headers = {'apikey':config['anon_key']}
        if token: headers['Authorization'] = 'Bearer ' + token
        connection.request('GET',path,headers=headers)
        response = connection.getresponse()
        data = response.read(LIMIT+1)
        if len(data) > LIMIT or 300 <= response.status < 400:
            raise ProbeFailure('Oversized response or redirect refused')
        return response.status, data
    finally:
        connection.close()

def run(config):
    checks=[]
    for label,token,identity in [('owner',config['owner_token'],config['owner_id']),('other',config['other_token'],config['other_id'])]:
        status, body = request(config,'/auth/v1/user',token)
        if status != 200 or json.loads(body).get('id') != identity:
            raise ProbeFailure('Auth canary identity mismatch')
        checks.append('auth_'+label+'_identity')
    for label,token in [('anonymous',None),('expired',config['expired_token'])]:
        status, _ = request(config,'/auth/v1/user',token)
        if status not in (401,403):
            raise ProbeFailure('Auth missing/expired token was not denied')
        checks.append('auth_'+label+'_denied')
    for label,token in [('anonymous',None),('owner',config['owner_token'])]:
        status, _ = request(config,'/auth/v1/admin/users?page=1&per_page=1',token)
        if status not in (401,403):
            raise ProbeFailure('Auth admin API was not denied')
        checks.append('auth_admin_'+label+'_denied')
    suffix = quote(config['bucket'],safe='')+'/'+quote(config['object_key'],safe='/')
    status, body = request(config,'/storage/v1/object/authenticated/'+suffix,config['owner_token'])
    if status != 200 or hashlib.sha256(body).hexdigest() != config['sha256']:
        raise ProbeFailure('Authorized Supabase Storage object read failed')
    protected_payload=body
    if not protected_payload: raise ProbeFailure('Nonempty protected canary required')
    checks.append('storage_authorized_payload')
    for label,token in [('other',config['other_token']),('anonymous',None),('expired',config['expired_token'])]:
        status, body = request(config,'/storage/v1/object/authenticated/'+suffix,token)
        if status not in (400,401,403,404):
            raise ProbeFailure('Private Storage access was not denied')
        # Never accept an HTTP error carrying the protected canary bytes.
        if protected_payload in body:
            raise ProbeFailure('Protected bytes leaked in denial response')
        checks.append('storage_'+label+'_denied')
    status, body = request(config,'/storage/v1/object/public/'+suffix)
    if status not in (400,401,403,404) or protected_payload in body:
        raise ProbeFailure('Private bucket exposed through public object endpoint')
    checks.append('storage_public_bypass_denied')
    return {'schema_version':1,'status':'SCOPED_CANARIES_PASS','checks':checks,
            'client_target':'127.0.0.1','isolated_egress_operator_attested':True,'full_auth_storage_vault_recovery_certified':False}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',required=True); parser.add_argument('--report',required=True)
    args=parser.parse_args()
    try:
        if os.environ.get('SOLARIS_RUN_LOCAL_API_RECOVERY') != 'YES':
            raise ProbeFailure('Explicit local API opt-in required')
        config=load_config(args.config)
        verify_runtime(config)
        result=run(config)
        result['docker_internal_networks_verified']=True
        result['postgres_version_num']='170011'
        fd=os.open(args.report,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as out:
            json.dump(result,out,indent=2); out.write('\n')
        print('PASS: 11 scoped loopback Auth/Storage canaries; complete platform recovery NOT certified')
        return 0
    except (ProbeFailure,OSError,ValueError,TypeError,KeyError,http.client.HTTPException,subprocess.SubprocessError):
        print('STOP: isolated Auth/Storage prerequisite or authorization probe failed; no certification',file=sys.stderr)
        return 1

if __name__ == '__main__': sys.exit(main())
