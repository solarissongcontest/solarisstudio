#!/usr/bin/env python3
"""Compare private catalog snapshots; never infer authorization or generate repair SQL."""
import argparse
import hashlib
import json
import os
import sys
from collections import Counter

SCOPE = ['auth', 'private', 'public', 'storage', 'televoting']
SAFE_CONFIG = {'search_path','statement_timeout','lock_timeout','idle_in_transaction_session_timeout',
               'row_security','default_transaction_read_only','default_transaction_isolation','session_replication_role',
               'app.settings.jwt_exp','pgrst.db_max_rows','pgrst.db_pre_request','pgrst.db_schemas','session_preload_libraries','log_statement'}
SECTIONS = ('relations', 'schemas', 'columns', 'policies', 'default_acls', 'roles', 'memberships', 'role_config')

def canonical(value):
    if isinstance(value, dict):
        return {k: canonical(v) for k, v in sorted(value.items()) if k != 'raw_acl'}
    if isinstance(value, list):
        return sorted((canonical(v) for v in value), key=lambda v: json.dumps(v, sort_keys=True))
    return value

def validate(data):
    if data.get('schema_version') != 1 or data.get('scope') != SCOPE or data.get('complete') is not True or data.get('read_only') is not True:
        raise ValueError('Incomplete, writable or unsupported catalog snapshot')
    if not 170000 <= data.get('server_version_num', 0) < 180000:
        raise ValueError('PostgreSQL 17 snapshot required')
    if not data.get('observed_at') or not data.get('database'):
        raise ValueError('Missing observation provenance')
    sections = data.get('sections', {})
    if set(sections) != set(SECTIONS):
        raise ValueError('Missing or unknown catalog section')
    if len(sections['schemas']) != 5 or {x.get('identity') for x in sections['schemas']} != set(SCOPE):
        raise ValueError('Incomplete schema scope')
    for name in SECTIONS:
        rows = sections[name]
        if not isinstance(rows, list) or len(rows) > 20000:
            raise ValueError('Invalid catalog section')
        ids = [x.get('identity') for x in rows]
        if any(not isinstance(x, str) or not x for x in ids) or len(set(ids)) != len(ids):
            raise ValueError('Missing or duplicated object identity')
        for row in rows:
            if name in ('relations', 'schemas', 'columns', 'default_acls'):
                if not isinstance(row.get('grants'), list):
                    raise ValueError('Missing ACL evidence')
                for grant in row['grants']:
                    if set(grant) != {'grantor','grantee','privilege','grantable'} or not isinstance(grant['grantable'], bool):
                        raise ValueError('Incomplete ACL evidence')
            required = {
                'relations': {'kind','owner','rls','force_rls','raw_acl'},
                'schemas': {'owner'}, 'columns': {'type','not_null'},
                'policies': {'command','permissive','roles','using_md5','check_md5'},
                'roles': {'superuser','inherit','create_role','create_db','login','replication','bypass_rls','connection_limit','valid_until'},
                'memberships': {'admin','inherit','set'}, 'role_config': {'name','value','captured'},
            }.get(name, set())
            if not required.issubset(row):
                raise ValueError('Missing catalog property')
            bool_fields = {'relations':('rls','force_rls'),'columns':('not_null',),
                           'policies':('permissive',),'roles':('superuser','inherit','create_role','create_db','login','replication','bypass_rls'),
                           'memberships':('admin','inherit','set'),'role_config':('captured',)}.get(name,())
            if any(type(row[field]) is not bool for field in bool_fields):
                raise ValueError('Invalid authority flag type')
            if name == 'role_config':
                if row['captured']:
                    if row['name'] not in SAFE_CONFIG or not isinstance(row['value'],str):
                        raise ValueError('Unapproved or incomplete configuration value')
                elif row['value'] is not None:
                    raise ValueError('Uncaptured configuration must not include a value')
    if not sections['roles'] or not sections['relations']:
        raise ValueError('Empty authority evidence')
    return data

def compare(left, right):
    validate(left); validate(right)
    changes, representation, unknown = [], [], []
    for section in SECTIONS:
        a = {x['identity']: x for x in left['sections'][section]}
        b = {x['identity']: x for x in right['sections'][section]}
        for identity in sorted(a.keys() | b.keys()):
            if identity not in a or identity not in b:
                changes.append({'section':section, 'identity':identity, 'change':'added' if identity in b else 'missing'})
                continue
            before, after = canonical(a[identity]), canonical(b[identity])
            fields = sorted(k for k in before.keys() | after.keys() if before.get(k) != after.get(k))
            if fields:
                changes.append({'section':section, 'identity':identity, 'change':'changed', 'fields':fields})
            elif a[identity].get('raw_acl') != b[identity].get('raw_acl'):
                representation.append({'section':section, 'identity':identity})
        if section == 'role_config':
            unknown.extend(sorted(x['identity'] for x in list(a.values()) + list(b.values()) if not x['captured']))
    return {'schema_version':1, 'status':'DIFFERENT' if changes else ('INCOMPLETE' if unknown else 'SCOPED_MATCH'),
            'changes':changes, 'representation_only':representation, 'uncaptured_config':sorted(set(unknown)),
            'counts_by_section':dict(sorted(Counter(x['section'] for x in changes).items())),
            'certifies_s16_or_platform_recovery':False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('expected', nargs='?'); parser.add_argument('restored', nargs='?')
    parser.add_argument('--report'); parser.add_argument('--validate')
    args = parser.parse_args()
    try:
        if args.validate:
            with open(args.validate) as snapshot:
                validate(json.load(snapshot))
            print('VALID: bounded read-only catalog snapshot; platform recovery NOT certified')
            return 0
        if not args.expected or not args.restored or not args.report:
            raise ValueError('Two snapshots and a private report path are required')
        blobs = [open(p, 'rb').read() for p in (args.expected, args.restored)]
        result = compare(*(json.loads(b) for b in blobs))
        result['input_sha256'] = [hashlib.sha256(b).hexdigest() for b in blobs]
        # Never follow an existing path/symlink or overwrite private evidence.
        fd = os.open(args.report, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as out:
            json.dump(result, out, indent=2); out.write('\n')
        print(json.dumps({k:result[k] for k in ('status','counts_by_section','certifies_s16_or_platform_recovery')}))
        return 0 if result['status'] == 'SCOPED_MATCH' else 2
    except (ValueError, OSError, TypeError, KeyError):
        print('STOP: invalid/incomplete evidence or unavailable private output; no certification', file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
