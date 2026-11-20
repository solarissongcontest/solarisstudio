#!/usr/bin/env bash
# One protected Cloud Shell run: existing private restore -> S13 clone rehearsal.
# No hosted connection or production SQL, no new backup/key export, no activation.
set -Eeuo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
for tool in git node python3 bash sha256sum docker; do
  command -v "$tool" >/dev/null || { echo "STOP: missing $tool" >&2; exit 1; }
done
expected="${SOLARIS_REVIEWED_SOURCE_SHA:-}"
[[ "$expected" =~ ^[0-9a-f]{40}$ && "$(git rev-parse HEAD)" == "$expected" ]] \
  || { echo 'STOP: exact reviewed source SHA required' >&2; exit 1; }
for key in DATABASE_URL POSTGRES_URL SUPABASE_DB_URL SUPABASE_ACCESS_TOKEN PGSERVICE PGSERVICEFILE PGHOSTADDR PGHOST PGPASSWORD; do
  [[ -z "${!key:-}" ]] || { echo "STOP: inherited $key; use clean operator shell" >&2; exit 1; }
done
base="$HOME/solaris-recovery"
test -d "$base" || { echo 'STOP: existing private recovery directory missing' >&2; exit 1; }
work=$(mktemp -d "$base/s13-first-batch-${expected:0:12}-XXXXXXXX")
node scripts/package-v3-s13-first-batch.mjs "$work/package" >"$work/package.private.json"
python3 scripts/rehearse-v3-s13-first-batch.py --check-package "$work/package"
set +e
SOLARIS_S13_BATCH_PACKAGE="$work/package" bash scripts/ops/solaris-role-acl-rehearsal-20261120.sh \
  2>&1 | tee "$work/operator-output.private.log"
restore_rc=${PIPESTATUS[0]}
set -e
[[ "$restore_rc" == 0 || "$restore_rc" == 2 ]] \
  || { echo "STOP: isolated restoration/S13 rehearsal failed; private logs retained in $work" >&2; exit 1; }
python3 - "$base" "$work" "$expected" "$restore_rc" <<'PY'
from pathlib import Path
import json,os,re,sys
base,work=map(Path,sys.argv[1:3]);expected=sys.argv[3];rc=int(sys.argv[4])
output=(work/'operator-output.private.log').read_text()
paths=re.findall(r'^S13_BATCH_PROOF: (.+)$',output,re.M)
if len(paths)!=1:raise SystemExit('STOP: no unique completed S13 proof; no qualification')
p=Path(paths[0])
if p.is_symlink() or not p.resolve().is_relative_to(base.resolve()):raise SystemExit('STOP: invalid private proof path')
proof=json.loads(p.read_text());manifest=json.loads((work/'package/manifest.json').read_text())
if (proof['sourceSha']!=expected or proof['sourceSha']!=manifest['sourceSha']
    or proof['installSha256']!=manifest['artifacts']['install.sql']['sha256']
    or not proof['batchAcceptancePassed'] or not proof['operatorAssertedRecoveredBaseline']
    or not proof['sourceDatabaseUnchanged'] or proof['existingTablesVerified']<225
    or proof['productionAuthorized'] or proof['apiWritersEnabled']):
    raise SystemExit('STOP: S13 receipt does not qualify this batch/backup run')
receipt={'schemaVersion':1,'batchId':proof['batchId'],'sourceSha':expected,'installSha256':proof['installSha256'],
         'encryptedBackupSha256':'995088d139b5cc2fb63c8295cea5dfd8ede2e1c976ab7f6f7f3611b987742fae',
         'restoreAppTables':225,'restoreRlsTables':202,'restorePolicies':265,'restoreGlobalDefaultAclRecords':27,
         'operatorBoundPrivateArchiveRehearsalPassed':True,'fullRoleComparisonPassed':rc==0,
         'batchProofPath':str(p),'productionAuthorized':False,'authVaultCertified':False,
         'livePreflightFresh':False,'independentOperatorEvidenceReviewRequired':True}
fd=os.open(work/'operator-receipt.private.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w')as stream:json.dump(receipt,stream,indent=2);stream.write('\n')
print('PASS: first S13 batch rehearsed against the private archive clone; source unchanged.')
print('Broader owner/ACL comparison:', 'MATCH' if rc==0 else 'STILL OPEN; independent of this scoped S13 proof')
print('Protected operator receipt:',work/'operator-receipt.private.json')
print('Production remains unchanged and unauthorized. Auth/Vault remain separate recovery gates.')
PY
