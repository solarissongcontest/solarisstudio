# Results operation engine and reviewed-input recovery

This extends the existing ordered recovery, without another calculator or
migration-history repair. Apply after the seven core recovery stages and the
existing Jury/Combined restrictions: operation engine → current canonical CAS →
owner-only operation-table writes. The existing networkless PG17.11 driver
generates checksummed artifacts, injects post-DDL failures, checks unchanged full
schema/data dumps, retries, refuses duplicates and verifies synthetic restoration.

The engine checks the observed exact routine bodies, ownership, search paths,
ACLs and two operation-table column/RLS/ACL fingerprints before changing anything.
It reuses the canonical November 3 recalculation/reconciliation definitions.
CAS is generated from the unchanged current implementation, with qualified
post-engine prerequisite fingerprints. It does not replay historical migrations.

The standard `auth.jwt()` reader was missing from the reconstructed fixture.
Owner-authorized read-only inspection on November 14 confirmed its exact hash,
Supabase Auth ownership and privileges. Its local fixture is bootstrap-only and
refuses hosted database names. No Auth change is proposed for production.

The initial legacy recalculation routine has two reviewed prior versions: the
fresh observed hosted definition and the immutable historical source definition.
The CI fixture uses the latter, explicitly **source-only**; neither prior body is
executed before replacement. A separate local probe used the freshly observed
hosted body and sanction matcher, then passed the actual main CAS SQL regression
in the same recovered PG17.11 database. Raw hosted function bodies are not
published in evidence. This distinction remains a limit on reproducible hosted
equivalence; it is not full recovered-contest certification.

The forward-only operation-table cutover removes API DML, column grants,
TRUNCATE and object-administration grants, including service_role. Existing
SELECT/RLS and owner-executed canonical commands remain. Actual API-role probes
must reject 24 write attempts; the same database must retain the canonical CAS
regression, snapshot history and prior recovery security protections.

No hosted writes, deployment or activation occur. Full recovered 66-country
acceptance, complete S16 qualification, real production backup/restoration proof
and exact-operation owner approval remain mandatory before live adoption.
