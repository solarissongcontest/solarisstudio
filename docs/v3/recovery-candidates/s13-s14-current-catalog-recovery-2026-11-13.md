# Current S13 → S14 catalog qualification and local recovery

Status: scoped engineering proof, **not full hosted equivalence or production approval**.
Starting main: `15341aa94f6235d45818f219f7ee833573467219`.

## Actual authorized observation

The owner authorized the bounded catalog inspection in the implementation prompt.
`get_project` independently confirmed `dkxmnvekiopyesuzggeu`, Solaris Studio,
ACTIVE_HEALTHY, PostgreSQL 17.11.0.002. One `execute_sql` call then executed the
checked-in generated `s13-s14-catalog-export-readonly.sql` at
**2026-11-13T16:13:37.633179Z**. Exact query SHA256:
`a827dfd7adae78f3b3968d3268e48a70a047788ef49fee7a44d63454c4d3e822`.
It used BEGIN READ ONLY, statement_timeout=10s, lock_timeout=2s and ROLLBACK.
No application rows, function invocations, raw function bodies, migration-history
queries or writes were performed. The previously owner-confirmed CSV is reused;
no repeat CSV is requested. The JSON contains catalog metadata only.

| Category | Current observation |
| --- | --- |
| S13 tables | All five absent |
| S13 registration RPCs | All seven exact signatures absent |
| S13 planned indexes | Both absent |
| Archive gate tables | Both absent |
| Four existing parent tables | Present, owner postgres, RLS enabled |
| Required columns | All 31 type/nullability prerequisites compatible |
| Existing routines in the 20-signature scope | Four present; 16 absent |
| Service-role authority helper | Definition MD5 `84d3f05e5f537908732a3875ba0178e6`, owner postgres, reviewed ACL MD5 `341a58cafc38a872c684592babc76f83`; matches an approved S13 prerequisite |
| Aggregate/prune task reconcilers | Present; owner-only EXECUTE; service_role denied |
| Legacy public transition v2 | Present; authenticated/service_role EXECUTE; anon denied |
| Two hosted direct-write guards | Present, enabled O, both call private.studio2_guard_direct_client_write() |
| Nine requested Archive/Task trigger names | Absent; each parent table confirmed present |

The JSON project_ref is the intended project label. It is not independent
connector authentication. Production provenance comes from the authorized tool
call and prior project confirmation. CI runs the same SQL only inside local
containers; its identical project label does not make local results production.

### Trigger digest representation

The new query fingerprints `pg_get_triggerdef(oid)` (default formatting):
admin_notifications `2ae8e682d3bd6c9c6ba5738014681357`, notification_deliveries
`9a98e162443857e540419ba2659d85f5`. The reconstructed identical triggers yield
`6beca6a7cf29d9a8dcb5aaa1ce1f83ec` and `3124d94d2dad63180eebd3a6ab2060d5`
when formatted with `pg_get_triggerdef(oid,true)`, matching the owner's supplied
values. The formatter differs; no trigger drift is inferred from those hashes.
No additional production query was needed to establish this representation.

## Actual local compatibility repairs

The existing fixture omitted two observed owner-only routine ACLs and eight
TRUNCATE privilege bits. A clearly local-only overlay now reproduces them before
qualification. Existing function bodies/owners, grants for SELECT/DML, RLS,
constraints and triggers are unchanged. TRUNCATE privilege is **not** a production
recommendation; its observed presence is retained faithfully. RLS does not govern
TRUNCATE, and table privileges alone do not establish a remotely callable API.
Direct-SQL role/transport risks need separate security review before adoption.

The runtime compares all **75 explicit catalog rows and their observed properties**
against the frozen fresh observation before installing anything. Missing, extra,
duplicated or changed rows fail closed. Dates differ on a local replay; timestamps
are recorded but not falsely required to equal the production capture time.

Existing candidates are reused unchanged: `forward-only-s13-foundation.sql` then
`forward-only-s14-archive-integrated-local.sql`. No historical migration is replayed,
rewritten or marked applied. Existing interruption/restart/duplicate-refusal,
strict-dual, shadow, expiry/revocation and scoped authorization tests remain active.

### Why nine absent trigger names are not nine required installations

The final canonical Archive stage explicitly drops the separate runtime insert,
update and delete guards and installs **one** BEFORE INSERT/UPDATE/DELETE trigger,
`v3_guard_archive_runtime_transition`. The delivery projection trigger is created
on `studio2_organizer_tasks`, not `notification_deliveries`. This candidate never
owns a delivery-table trigger of that name. Its absence is not promoted to a
missing canonical effect. Do not resurrect old guards to satisfy a name count.

The recovered scope has five canonical Archive/Task triggers plus both retained
hosted guards; three retired runtime names and the unowned delivery-table name
remain absent. Tests assert this source-defined cutover explicitly. Canonical
recovery intentionally removes authenticated EXECUTE from legacy v2 transition
while preserving its body, moving browser authority to v3. This is a planned
privilege change requiring review, not unexplained drift.

## Execution and approval boundary

Operator metadata export: open the checked-in read-only SQL in the **confirmed**
project SQL Editor, run the entire script, copy the single `catalog_export` JSON
value. Missing objects remain explicit. It produces one SELECT result, avoiding
SQL Editor's last-result-only behavior. No keys or user data are needed.

Offline checks:

```
node scripts/v3-s13-s14-catalog-export.mjs --validate observation.json
node scripts/v3-s13-s14-catalog-export.mjs --compare local-before.json observation.json
node scripts/v3-s13-s14-catalog-export.mjs --recovered local-before.json local-after.json
```

The existing Archive workflow performs these on networkless PostgreSQL 17.11 and
retains the before/after/postcondition artifacts at its exact source SHA. It never
uses the Supabase connector or queries production.

A production operation is **not yet qualified for approval**. The concrete
proposed order remains S13 foundation → strict registration/authority verification
→ Archive gates/transition/task/notification cutover → separately qualified
Televote source/projection/replay → Results/publication → individually qualified
newer effects. Two local candidate files remain explicitly nondeployable pending
full dependency/data/role qualification and review.

Before requesting execution approval, freeze exact source SHA and SQL hashes;
recheck required full preconditions (not only these 75 rows), semantic legacy
compatibility, lock/backfill budgets, function call closure and grants; obtain
backup/restoration evidence; enumerate all DDL/ACL changes and independent review.
Use their transaction boundaries and retained interruption/rollback proofs.
Stop on ANY unexpected object/owner/hash/grant/RLS/guard/column difference, partial
installation, invalid index, unverified Results/publication dependency or missing
backup. Verify installation using a separately approved bounded read-only query.
Do not modify old history, execute synthetic operations on production, or open
public voting. Explicit exact-SHA/exact-SQL owner approval is still required.

## Remaining boundary

This checks a source-derived prerequisite slice, not every reachable function,
policy, role membership, constraint, relevant data shape or all 36 history gaps.
No new live Televote/Results runtime evidence or production backup/restoration
proof is supplied. Full hosted equivalence, full S14 lifecycle certification and
release remain separate gates. Production launch remains **NO-GO**.
