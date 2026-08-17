# Solaris Studio unified merge status

The unified product is implemented on `merge/confirmations` and remains isolated from `main` until the final Cloudflare runtime smoke checks are complete.

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
- Solaris Studio production build, TypeScript, unit tests, lint and route-tree checks pass on the unified implementation.
- The unified implementation builds successfully for Cloudflare Workers.
- The integration branch has been reconciled with the current `main` history and PR #12 is merge-clean.
- Privileged Televoting access is now Cloudflare-native. Solaris Studio connects directly to the Televoting Supabase backend from server-only code instead of proxying admin requests through a Lovable/Vote Hub runtime.
- The Televoting service-role credential is read only from the Cloudflare Worker secret `TELEVOTING_SUPABASE_SERVICE_ROLE_KEY`; it is not stored in `wrangler.jsonc`, `.env`, browser code or any committed source.
- `wrangler.jsonc` declares `TELEVOTING_SUPABASE_SERVICE_ROLE_KEY` as a required Cloudflare secret, so a Wrangler deployment cannot silently proceed without the privileged backend credential.
- Televoting admin readiness is checked directly from the Cloudflare server runtime after Solaris organizer authentication.
- Public Televoting views remain on the browser-safe publishable key and are kept separate from the privileged server client.

## Legacy standalone Vote Hub

The standalone `solarissongcontest/ssc-tele` application is no longer part of the Solaris Studio production request path. Its previous `/api/solaris-admin-proxy` bridge may be retained temporarily as rollback/reference code, but Solaris Studio does not require Lovable or a published Vote Hub runtime to operate.

Any standalone Vote Hub TypeScript/package-lock debt can therefore be maintained separately and does not block the Solaris Studio unification.

## Data still requiring organizer input

Historical HOD identities and assignments are intentionally not inferred as fact. The registry can be populated through `/admin/hod-history`; username evidence only produces reviewable suggestions.

## Final Cloudflare cutover checks

Before PR #12 leaves draft status and is merged to `main`:

1. Confirm the Cloudflare Worker `solarisstudio` has a Secret variable named `TELEVOTING_SUPABASE_SERVICE_ROLE_KEY` containing the Televoting Supabase service-role/secret key.
2. Deploy or preview the current `merge/confirmations` build on Cloudflare.
3. Sign in with a real Solaris organizer account and confirm Televoting admin readiness reports healthy.
4. Exercise at least one privileged Televoting admin read and one safe write path, including a write that may legitimately return an empty successful PostgREST response.
5. Re-run the unified public/admin smoke checks, then mark PR #12 ready for merge.

The service-role key must remain a Cloudflare Secret. It must never be committed to GitHub, added to Wrangler `vars`, exposed through a `VITE_` variable, or returned to browser code.

## Deliberately retained rollback data

Unused legacy/copied tables are not being destructively dropped during the merge. They are inert rollback insurance until the unified deployment has been exercised in production and can be removed later through a separately reviewed data-retirement migration.
