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
