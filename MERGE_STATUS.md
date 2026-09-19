# Solaris Studio unified production status

Solaris Studio, Confirmations and Televoting are now unified on the canonical `main` branch. PR #12 was merged after the unified branch passed the full quality pipeline. `main` is the production source of truth and must not be replaced with an older pre-integration branch.

## Production baseline

- Solaris Studio remains the canonical contest application and database.
- Confirmations is integrated under `/confirmations` with its existing backend and recovery flows preserved.
- Televoting is integrated under `/televoting` with the merged voting booth, results tooling and unified Solaris organizer authentication.
- `/participate` is the shared public participation entry point.
- Results, Combined Results, analytics, Integrity and Friend Voting are inside the unified Control Room.
- Historical HOD identity/tenure modelling and HOD-aware Friend Voting remain part of the unified build.
- Generated TanStack route trees are not committed; production builds regenerate and verify them.
- The canonical `main` build passes production build, route generation, TypeScript, unit tests and lint.
- The application builds for Cloudflare Workers.

## Public beta readiness

The public beta polish is included in `main`:

- Public empty states no longer expose organizer instructions or migration/backend jargon.
- Stale `Solaris Labs`, implementation-phase and TODO copy has been removed from the checked public surfaces.
- Result Lab, Taste DNA, Broadcast Intelligence and Solaris Pulse use visitor-facing unavailable/empty states.
- The sitemap derives its absolute origin from the incoming Cloudflare request instead of a blank production placeholder.
- The beta form numbering and tool naming have been cleaned up.
- Regression tests guard selected public surfaces against implementation-language leaks.
- The beta feedback table accepts anonymous write-only submissions while keeping responses unreadable to anonymous visitors.
- Beta screenshots use the private `beta-feedback` bucket with an 8 MB limit and image-only MIME restrictions.

## Database runtime repaired for beta

Production migration drift affecting public engagement tools was repaired and recorded back into Git migration history.

- Publication-layer RLS now respects participant, result and detailed-voting publication switches.
- Prediction Arena policies and submission/consensus/share RPCs are restored.
- Solaris Pulse follows, read state, notification preferences, event automation and prediction movement are restored.
- Taste DNA private ballot validation and RLS are restored.
- Trigger-only security-definer functions restored for these features are not exposed as direct anonymous/authenticated RPCs.

## Televoting Cloudflare runtime

Privileged Televoting access is Cloudflare-native, but it no longer relies on a Televoting service-role secret. Solaris Studio connects to the Televoting schema from server functions using the signed-in user's Solaris bearer token plus the browser-safe Solaris publishable key.

- Organizer identity is resolved from active global Permission Engine v2 role assignments.
- Televoting server requests run under the authenticated user's JWT, so database RLS and capability checks remain authoritative.
- Public Televoting continues to use the browser-safe publishable client.
- `TELEVOTING_SUPABASE_SERVICE_ROLE_KEY` is not a current Solaris Studio runtime dependency and must not be added to client-visible configuration.
- `wrangler.jsonc` therefore does not declare a service-role credential.

Runtime readiness is checked by making an authenticated Televoting query through the same user-token path used by Organizer tools. The current `main` tree is the intended Cloudflare deployment target.

## Legacy standalone Vote Hub

The standalone `solarissongcontest/ssc-tele` application is not part of the Solaris Studio production request path. Its old proxy code may remain as rollback/reference material, but it is not a deployment dependency for unified Solaris Studio.

## Data intentionally retained

Historical HOD identities and assignments are not inferred as fact; they remain organizer-managed through `/admin/hod-history`.

Unused legacy/copied tables are not being destructively dropped during the beta. They remain inert rollback insurance until the unified deployment has been exercised and can be retired through a separately reviewed migration.


## Core completion baseline — 19 September 2026

The Studio 2 core implementation sweep is complete. The remaining roadmap flags are future product work, not unfinished infrastructure.

### Permission and runtime authorization

- Permission Engine v2 is globally authoritative.
- All 3 live Organizers have active global v2 Organizer/Superadmin assignments.
- Application RLS has 0 direct legacy `has_role` predicates.
- Live authorization functions have 0 direct `public.has_role` fallbacks.
- `user_roles` has no browser-write policies and 0 orphan rows; it is retained only as rollback/history data.
- Browser, server, Confirmations and unified admin gates resolve Organizer access from active v2 assignments.
- Server capability loading uses `studio2_role_assignments`, `studio2_role_capabilities` and `studio2_capability_grants`.
- The production `admin-country-password` Edge Function is deployed with the v2 Organizer boundary and no `user_roles` authorization dependency.

### Database and performance hygiene

Production includes:

- `20260919085854_final_rls_schema_hygiene`
- `20260919092023_security_definer_internal_helper_hardening`

The hygiene pass removed the empty `migration_staging` schema, added a durable primary key to the private notice-deletion audit table, eliminated overlapping permissive browser read policies and added covering indexes for the currently material high-volume foreign keys.

Current advisor items are intentionally interpreted rather than chased as vanity metrics:

- 43 RLS-without-policy INFO findings are fail-closed internal/RPC tables.
- 38 anonymous `SECURITY DEFINER` warnings are reviewed public/RLS APIs and are constrained by an explicit migration-rehearsal allowlist.
- 218 authenticated `SECURITY DEFINER` warnings remain because authenticated RPC execution is intentional for many product APIs; trigger-only and nested privileged helpers were separately hardened.
- 106 unindexed-FK INFO findings are on currently small/empty relationships and remain workload-driven.
- 106 unused-index INFO findings are not sufficient evidence for destructive index removal on a young production workload.

### Country/Wiki and voting intelligence

- Country/Wiki Design v2 is migrated for 24/24 production country themes while retaining the compatibility data needed for rollback.
- Friend Voting uses the prepared advanced relationship engine, shared canonical voting data, jury/televote separation, historical context and explainable evidence signals. Automated signals remain review evidence, not findings of wrongdoing.

### Remaining external platform setting

Supabase Auth still reports **Leaked Password Protection Disabled**. This is a hosted project Auth setting, not a database migration. The connected project tooling does not expose an Auth-settings mutation, so this must be enabled in Supabase Auth settings (or through an authorized Supabase Management API credential).

The Organizer-managed country-password flow independently checks new passwords against the Pwned Passwords API, but that does not replace enabling the project-wide Supabase Auth control.

### Planned products

The following remain intentional future product work and are not core-completion blockers:

- Country Voting DNA
- Prediction League
- Fantasy SSC
- Public Encyclopedia
- Time Machine
- Solaris Command Assistant
