import concurrent.futures, json, subprocess, threading, os, sys
from urllib.parse import urlparse
from pathlib import Path
# Stateful regression: require the disposable local target explicitly. No hosted
# credentials, CLI discovery or production fallback are accepted.
database_url=os.environ.get('DB_URL','')
parsed=urlparse(database_url)
if sys.flags.optimize or os.environ.get('V3_VERIFICATION_TARGET')!='local' or parsed.scheme not in ('postgres','postgresql') or parsed.hostname not in ('127.0.0.1','localhost','::1') or not parsed.port:
 raise SystemExit('Jury concurrency proof requires V3_VERIFICATION_TARGET=local and an explicit loopback DB_URL')
def sql(body,check=True):
 r=subprocess.run(['psql',database_url,'-X','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input=body,text=True,capture_output=True,timeout=30)
 if check and r.returncode: raise RuntimeError(r.stderr)
 return r
# Each run starts after automated clean replay or current-main upgrade. Committed
# fixture history is retained until that disposable environment is reset; this
# script never disables a guard or repairs state to make a race pass.
fixture=(Path(__file__).resolve().parents[2]/'.github/tests/v3-jury-runtime-mechanisms.sql').read_text().replace('29234500','29234600').replace('@local.invalid','-concurrency@local.invalid').replace('JRV','KRV').replace('JRA','KRA').replace('JRB','KRB').replace('JRX','KRX').replace("'Jury voter'","'Concurrent Jury voter'").replace("'Jury recipient A'","'Concurrent Jury A'").replace("'Jury recipient B'","'Concurrent Jury B'").replace("'Not in this show'","'Concurrent unrelated'")
seed=fixture[fixture.index('insert into auth.users'):fixture.index('create function pg_temp.score')]
sql('begin;'+seed+'commit;')
actor='29234600-0000-4000-8000-000000000001'
claims=json.dumps({'role':'authenticated','sub':actor,'session_id':'29234600-0000-4000-8000-000000000011'})
def race(expressions):
 barrier=threading.Barrier(2)
 def invoke(expression):
  barrier.wait(timeout=10)
  return sql("begin; set local statement_timeout='15s'; set local lock_timeout='10s'; select set_config('request.jwt.claims','"+claims+"',true); set local role authenticated; select "+expression+"; select pg_sleep(0.35); commit;",False)
 with concurrent.futures.ThreadPoolExecutor(2) as executor:return list(executor.map(invoke,expressions))
def score(op,version,target='42'):
 return "public.studio2_apply_jury_vote_change('29234600-0000-4000-8000-000000000021','29234600-0000-4000-8000-000000000031','29234600-0000-4000-8000-000000000051','29234600-0000-4000-8000-000000000041',null,'29234600-0000-4000-8000-0000000000"+target+"',null,12,'assign','29234600-0000-4000-8000-"+str(op).zfill(12)+"','jury:concurrent:"+str(op)+"',"+str(version)+")"
results=race([score(101,0),score(102,0)])
assert sorted(r.returncode for r in results)==[0,3],[(r.returncode,r.stderr)for r in results]
assert 'PT409' in next(r.stderr for r in results if r.returncode)
proof=json.loads(sql("select json_build_object('version',(select version from public.studio2_jury_vote_versions where show_id='29234600-0000-4000-8000-000000000031'),'receipts',(select count(*) from public.studio2_operation_receipts where actor_id='"+actor+"' and command='jury.vote.assign'),'audits',(select count(*) from public.admin_audit_log where actor_id='"+actor+"' and action='jury_vote_assign'));").stdout)
assert proof==dict(version=1,receipts=1,audits=1),proof
results=race([score(201,1,'43'),score(201,1,'43')]);assert all(r.returncode==0 for r in results),[r.stderr for r in results]
assert sum('"replayed": true' in r.stdout for r in results)==1
assert sql("select version from public.studio2_jury_vote_versions where show_id='29234600-0000-4000-8000-000000000031';").stdout.strip()=='3'
# Seed a real complete participant preflight/ballot in one transaction.
a=fixture.index('insert into televoting.vote_preflight_checks(');b=fixture.index("select set_config('test.jury.vote'",a)
sql('begin;'+fixture[a:b]+'commit;')
def review(op,version,target='valid'):
 return "public.studio2_apply_jury_ballot_review('29234600-0000-4000-8000-000000000061','"+target+"','Concurrent adjudication','29234600-0000-4000-8000-"+str(op).zfill(12)+"','jury:concurrent-review:"+str(op)+"',"+str(version)+")"
results=race([review(301,1),review(302,1)]);assert sorted(r.returncode for r in results)==[0,3],[(r.returncode,r.stderr)for r in results]
assert 'PT409' in next(r.stderr for r in results if r.returncode)
results=race([review(401,2,'needs_review'),review(401,2,'needs_review')]);assert all(r.returncode==0 for r in results),[r.stderr for r in results]
assert sum('"replayed": true' in r.stdout for r in results)==1
proof=json.loads(sql("select json_build_object('reviewVersion',(select review_version from public.jury_ballot_submissions where id='29234600-0000-4000-8000-000000000061'),'reviewReceipts',(select count(*) from public.studio2_operation_receipts where actor_id='"+actor+"' and command like 'jury.ballot.review.%'),'reviewAudits',(select count(*) from public.admin_audit_log where actor_id='"+actor+"' and action='jury_ballot_review_transition'),'reviewEvents',(select count(*) from private.v3_domain_events where edition_id='29234600-0000-4000-8000-000000000021' and event_type='jury.ballot_changed'),'scoreReceipts',(select count(*) from public.studio2_operation_receipts where actor_id='"+actor+"' and command='jury.vote.assign'));").stdout)
assert proof==dict(reviewVersion=3,reviewReceipts=2,reviewAudits=2,reviewEvents=2,scoreReceipts=2),proof
print('PASS concurrent manual CAS, manual same-operation retry, review CAS and review same-operation retry: '+json.dumps(proof))
