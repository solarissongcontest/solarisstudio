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
- Production build, TypeScript, unit tests and lint all pass on the current merge head.
- The current merge head also builds successfully in Cloudflare Workers preview.
- The guarded Vote Hub bridge source is implemented in `solarissongcontest/ssc-tele` at commit `e6760d4c2ddc31190dae679b7e4834c418957e3a` as `/api/solaris-admin-proxy`.

## Data still requiring organizer input

Historical HOD identities and assignments are intentionally not inferred as fact. The registry can be populated through `/admin/hod-history`; username evidence only produces reviewable suggestions.

## Remaining external cutover blocker

The bridge source exists, but it is not yet present in the actual Lovable Solaris Vote Hub runtime. That Lovable project is still on its older internal project commit and is currently unpublished, so publishing it as-is would deploy a build without `/api/solaris-admin-proxy`.

Before this PR can leave draft status:

1. Sync the guarded bridge route from the current `ssc-tele` source into the real Vote Hub runtime.
2. Publish the Vote Hub runtime with its existing server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configuration.
3. Set Solaris Studio's server-only `TELEVOTING_ADMIN_BRIDGE_URL` to the published bridge endpoint.
4. Validate the bridge health request with a real Solaris organizer session.
5. Exercise at least one privileged Televoting admin read and one safe write path through Solaris Studio.
6. Re-run the unified smoke checks, then mark PR #12 ready for merge.

No Vote Hub service-role key may be moved into Solaris Studio, committed to GitHub, exposed to browser code, or copied into a public configuration value.

## Deliberately retained rollback data

Unused legacy/copied tables are not being destructively dropped during the merge. They are inert rollback insurance until the unified deployment has been exercised in production and can be removed later through a separately reviewed data-retirement migration.
