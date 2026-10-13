# V3 release stabilization — 13 October 2026

These changes continue the repository-side implementation from the V3 status audit.
It does not certify V3 or establish the current production operating mode.

## Repository changes

- Port PR #537's representative PR/main Browser Audit selection onto current
  main, preserving local Supabase isolation, Organizer preflight, explicit
  exhaustive certification and the release-branch exceptions. Published history
  remains unchanged. This shipped through merged PR #537.
- Authenticate the push dispatcher, then read the canonical platform-mode
  singleton with the service role before VAPID setup, Organizer reconciliation,
  enqueue, queue leasing or delivery. Read-only and maintenance return HTTP 200
  with `skipped: true` and `reason: platform_writes_suspended`. Missing, unknown
  or unreadable state returns HTTP 503. Normal and degraded retain the existing
  pipeline. Database write guards still enforce any mode change after the read.
- Exercise the real dispatcher handler and Playwright configuration with mocked
  runtime dependencies, including suspended modes, missing state, authentication,
  normal/degraded dispatch, mode-change write rejection and hosted-URL rejection.

## Production synchronization remains an operator prerequisite

Automated tests, previews, browser audits and migration rehearsals must use only
an isolated local Supabase stack. Do not run them against production. The audit's
production observations are a dated baseline, not a fresh inspection.

An authorized operator should perform these bounded read-only inspections in
the production SQL editor before deciding what to apply:

```sql
begin transaction read only;

select version
from supabase_migrations.schema_migrations
order by version desc
limit 8;

select key, enabled, admins_only
from public.studio2_feature_flags
where key like 'solaris_app_v3%'
order by key
limit 32;

select mode, version, affected_services, reason, incident_reference, changed_at
from public.studio2_platform_operational_state
where singleton = true;

commit;
```

If the migration head still matches the audit's `20261013123000` baseline,
review and apply the existing migrations in timestamp order:

1. `20261013130000_v3_delegation_cutover.sql`
2. `20261013140000_v3_search_cutover.sql`
3. `20261013150000_v3_rules_guidance_cutover.sql`

These migrations create disabled rollout records and preserve existing flag
values. Do not insert replacement rows manually, replay applied migrations,
enable the new flags, or edit migration history to claim synchronization.
If production has diverged, stop and reconcile the complete migration history.
Deploy the matching `solaris-push-dispatch` function separately; a frontend
deployment does not deploy Edge Functions. Verify the next scheduled invocation
reports a skip while writes remain suspended, with no enqueue/claim attempts.

## Protected operating-mode recovery

Inspect the incident and reason before recovering. Use the existing authenticated
System Operations workflow, not a direct update of the singleton:

- Maintenance recovers to read-only through the protected preflight.
- Read-only recovers to degraded through `runPlatformExitPreflight`, which checks
  database, confirmation sync, voting runtime and Storage, and records a receipt.
- Require a ready, unexpired receipt bound to the current platform version and
  the existing reauthentication/operation contract before applying the transition.
- Resolve critical failures through their established recovery operations. Move
  from degraded to normal only when the existing transition preview permits it.

Do not enable Notifications until dispatch, transport, preferences, deduplication
and spoiler protection have been verified after recovery. A successful skip is
evidence that suspension is respected, not that delivery works.

## Security-advisor classification

Review effective permissions and intended entry points before changing grants.
These metadata-only queries support classification; they are not an automated
authorization certification or a request to grant/revoke anything:

```sql
begin transaction read only;

select extension.extname, namespace.nspname
from pg_extension extension
join pg_namespace namespace on namespace.oid = extension.extnamespace
where extension.extname = 'pg_net';

select proc.oid::regprocedure::text as signature,
       has_function_privilege('anon', proc.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', proc.oid, 'EXECUTE') as authenticated_execute,
       proc.proconfig
from pg_proc proc
join pg_namespace namespace on namespace.oid = proc.pronamespace
where namespace.nspname = 'public' and proc.prosecdef
order by signature;

select relation.relname,
       has_table_privilege('anon', relation.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', relation.oid, 'SELECT') as authenticated_select,
       has_table_privilege('authenticated', relation.oid, 'INSERT,UPDATE,DELETE') as authenticated_write
from pg_class relation
join pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relkind in ('r', 'p') and relation.relrowsecurity
  and not exists (select 1 from pg_policy policy where policy.polrelid = relation.oid)
order by relation.relname;

commit;
```

For each SECURITY DEFINER RPC, inspect actor authentication, capability and scope
checks, publication boundaries, search path and explicit grants. For each table
without policies, determine whether denial to clients plus an authorized RPC or
service-role path is intentional. Cross-check the existing permission inventory.
Inspect leaked-password protection in Supabase Auth settings; SQL policy metadata
cannot establish that setting. Review `pg_net` consumers before any relocation.

## Follow-up implementation and deployment

- Media recovery (#540) reuses the same upload authorization across ambiguous
  Storage/finalization responses and coalesces mounted-form retries. Deploy the
  updated `solaris-upload-finalize` Edge Function separately. This does not yet
  provide reload, cross-device, or lost-prepare-response recovery.
- Results (#541) integrates the production `/results` route with canonical ranks,
  publication-controlled splits and shared spoiler preferences. Apply
  `20261013200000_v3_results_cutover.sql` in migration order; it creates a disabled
  `solaris_app_v3_results` flag and preserves existing flag values. Keep it disabled
  until the intended edition/user cohort and production deployment are reviewed.
- Televote (#542) only confirms a ballot after a successful server response with
  a submission ID. Duplicate identity/device/network errors remain errors, and a
  missing server acceptance timestamp remains null. Exact-ballot reconciliation
  after a lost response remains unfinished.
- The V3 shell consumes canonical route hierarchy and search context for active
  tabs. Explicit surface-owned active-area overrides remain supported.

The operator reported applying the earlier Delegation, Search and Rules migrations;
that report does not establish the newer Results migration or Edge deployments.
Use the bounded inspection above to verify the actual production migration head.

## Remaining production cutovers

Entry still needs immutable submitted versions, exact review binding,
revision-safe drafts and receipt/idempotency/reconciliation through the existing
server authority. Media recovery is a partial implementation of that workflow.
Jury, the complete Televote recovery protocol, Me, Organizer and Live remain
separate production cutovers. Complete protected operating-mode recovery and
exact-head CI for each cutover. Do not merge stale stacked projection PRs or retire
legacy routes before parity and exhaustive V3 certification.
