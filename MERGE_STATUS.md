# Solaris Studio unified merge status

The unified product is implemented on `merge/confirmations` and remains isolated from `main` until the final Televoting runtime cutover checks are complete.

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
- Generated TanStack route trees are no longer committed in Solaris Studio; production builds regenerate and verify them.
- Solaris Studio production build, TypeScript, unit tests, lint and route-tree checks all pass on the current merge implementation.
- The current merge implementation also builds successfully in Cloudflare Workers preview.
- The Solaris Televoting bridge client now preserves legitimate empty successful PostgREST responses such as `204 No Content`, HEAD and count-style requests instead of incorrectly requiring JSON for every success.
- The guarded Vote Hub bridge source is implemented in `solarissongcontest/ssc-tele` as `/api/solaris-admin-proxy`.
- Vote Hub CI now verifies a production build, verifies that TanStack generates `/api/solaris-admin-proxy`, and performs bridge-specific TypeScript validation. Those bridge checks pass.
- Solaris Studio is already prewired to the intended bridge endpoint `https://ssc-tele.lovable.app/api/solaris-admin-proxy` in `wrangler.jsonc`; no privileged Vote Hub secret is stored in Solaris Studio.

## Known standalone Vote Hub debt that does not block the bridge

The legacy standalone Vote Hub currently has two unrelated full-repository TypeScript errors: one historical Friend Voting group type mismatch and one `round_entries` query inference cast in the rounds admin screen. They pre-date the Solaris bridge and do not prevent the production build or bridge route validation. They should be cleaned separately rather than mixed into the unification cutover.

The standalone repository's checked-in package lockfiles are also stale relative to its current `package.json`; bridge CI resolves the current dependency graph so it can validate the deployable source instead of failing before compilation.

## Data still requiring organizer input

Historical HOD identities and assignments are intentionally not inferred as fact. The registry can be populated through `/admin/hod-history`; username evidence only produces reviewable suggestions.

## Remaining external cutover blocker

The bridge source is implemented and validated in GitHub, but it is not yet present in the actual Lovable Solaris Vote Hub runtime. The Lovable project is still on its older internal project state and is currently unpublished. Publishing that stale state as-is would therefore deploy a build without `/api/solaris-admin-proxy`.

Before this PR can leave draft status:

1. Sync the guarded `/api/solaris-admin-proxy` route from the current `ssc-tele` source into the real Lovable Solaris Vote Hub project.
2. Publish the Vote Hub runtime with its existing server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configuration.
3. Confirm the published route is reachable at the endpoint already configured in Solaris Studio. Only change `TELEVOTING_ADMIN_BRIDGE_URL` if Lovable publishes under a different slug/domain.
4. Validate the bridge health request with a real Solaris organizer session.
5. Exercise at least one privileged Televoting admin read and one safe write path through Solaris Studio, including a write that may legitimately return an empty success response.
6. Re-run the unified smoke checks, then mark PR #12 ready for merge.

No Vote Hub service-role key may be moved into Solaris Studio, committed to GitHub, exposed to browser code, or copied into a public configuration value.

## Deliberately retained rollback data

Unused legacy/copied tables are not being destructively dropped during the merge. They are inert rollback insurance until the unified deployment has been exercised in production and can be removed later through a separately reviewed data-retirement migration.
