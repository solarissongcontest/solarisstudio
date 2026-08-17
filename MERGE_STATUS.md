# Solaris Studio unified merge status

The unified product is implemented on `merge/confirmations` and remains isolated from `main` until runtime cutover checks are complete.

## Completed

- Solaris Studio remains the canonical contest application and database.
- Confirmations is integrated under `/confirmations` with canonical edition/country/entry projections.
- Televoting is integrated under `/televoting` with unified Solaris organizer authentication.
- Results, Combined Results, analytics, Integrity and Friend Voting are inside the unified Control Room.
- Jury + Televoting analytics use canonical Solaris history.
- Historical HOD identity/tenure modelling is implemented, including delegation defaults and jury/televote overrides.
- HOD-aware Friend Voting uses distinct controller editions as the independent historical sample.
- Configurable relationship thresholds, weights, risk bands and HOD coordination-group analysis are implemented.
- Friend-voting model changes are atomically recorded in `admin_audit_log` with before/after values.
- Sync Health separates technical synchronization from historical HOD-coverage debt.
- Generated TanStack route trees are no longer committed; production builds regenerate and verify them.
- Production build, TypeScript, tests and lint are blocking CI gates.

## Data still requiring organizer input

Historical HOD identities and assignments are intentionally not inferred as fact. The registry can be populated through `/admin/hod-history`; username evidence only produces reviewable suggestions.

## Remaining external cutover blocker

The legacy Solaris Vote Hub runtime is currently unpublished. Solaris Studio's privileged Televoting service client requires a public, organizer-authenticated server-to-server PostgREST bridge before the draft PR can be considered production-ready.

Required bridge behavior is tracked in GitHub and must be verified against the published runtime before this PR leaves draft status. No service-role key may be moved into Solaris Studio or client-side code.

## Deliberately retained rollback data

Unused legacy/copied tables are not being destructively dropped during the merge. They are inert rollback insurance until the unified deployment has been exercised in production and can be removed later through a separately reviewed data-retirement migration.
