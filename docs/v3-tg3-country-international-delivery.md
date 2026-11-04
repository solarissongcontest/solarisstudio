# TG3 Country International: public World slice

## Dependency and scope

Built from the exact TG1/TG2 foundation PR #1888 head
`01580c97e0a1397baffaac4aa4e176b51625fc75`.
Current main at selection: `7eda678c98a63caf49e59b3507cf2130e8d3200b`.
Main has moved since selection; this PR intentionally keeps its original #1888 dependency base rather than prematurely restacking onto main.

This PR deliberately does **not** duplicate concurrent TG3 organization discovery
PR #1934. That PR owns `/world`, `/world/organizations`, organization
details and `terra-world-public`. This branch owns only country-level
International routes and readers.

## Delivered

- `/world/countries` is a searchable, bounded 24-row country index with
  canonical existing country flags (3:2), names, region and abbreviation.
- `/world/countries/:code` is a country-specific International read view.
- Current and former institutional memberships are separated, each with
  independent 12-row server-side paging, exact count, retry and empty states.
  Memberships show their actual TG2 admission and, when applicable,
  termination dates in UTC. Pagination now orders by a unique ID tie-breaker
  and recovers automatically when concurrent changes empty a requested page.
- Membership source is TG2 `world_organization_memberships` with country
  predicate and public-organization RLS. A second lookup of only the visible
  organization IDs into `world_organizations` is required; rows without
  a verified public organization are not rendered.
- No direct browser writes, role/office assumptions, unofficial appointment
  labels, imagined institution memberships or global country-control
  duplicates. Historical affiliations are never labelled current.
- Both country routes are gated by the authoritative `terra_world_public`
  rollout RPC before readers mount. Missing/unknown/error state is fail-closed,
  matching the sibling #1934 public World gate's query cache and rollout key.
- Failed revalidation never retains previous visible membership rows or
  directory entries. Joined/ended edition IDs are not fetched or cached in the
  public browser since those records need separate publication authority.
- React Query caching, debounced directory search, bounded requests, no
  polling, limited retry and scoped reads protect backend egress.
- Every public Supabase read is now isolated in a narrow transport adapter:
  24-country and 12-membership row bounds, a maximum page index of 1,000,
  exact-count consistency checks and deterministic ordering. Public
  institution-name reads are capped at 24 IDs for the two displayed pages.
  No unscoped membership scan or private controller/representative query is
  performed, and query-level tests enforce the call contracts.
- Responsive content hierarchy, accessible search/controls, recovery states,
  and a link back to the existing SSC country profile.
- Focused Vitest contract tests verify malformed data and pagination-count
  failure, private institution rejection, exact country isolation, state
  separation, and search-filter sanitization.

## Owned files (all new)

- `src/lib/world-country-international.ts`
- `src/lib/world-country-international.test.ts`
- `src/lib/world-country-international-queries.ts`
- `src/lib/world-country-international-queries.test.ts`
- `src/components/world/WorldCountryRolloutGate.test.tsx`
- `src/components/world/WorldCountryInternational.tsx`
- `src/routes/world/countries/index.tsx`
- `src/routes/world/countries/$code.tsx`
- `docs/v3-tg3-country-international-delivery.md`

## Integration

This PR must remain stacked on #1888 until its TG2 migration is merged
and verified with isolated Supabase. It may be integrated alongside #1934
without file overlap. The current active Explore/navigation cutover owner
must add discoverability from the V3 Explore/World landing and an
International link from existing country profiles after both PRs land.

No shared route tree, app shell, country-profile, Explore, navigation,
registry, stylesheet, workflow, migration, Results or integration files
were edited.

## Continuation verification and detail hardening

- Added strict URL-to-canonical-country identity checks. A mismatched
  returned country code fails closed; invalid country codes never query.
- Removed duplicate top-level heading and an early link into unmerged
  sibling organization routes. No new broken deep link is exposed.
- Expanded focused pure-model regression coverage from 7 to **10 tests**,
  plus **3 additional SSR React rollout-gate tests** committed for CI.
- Retrieved the exact committed adapter and model test-file blobs through
  connected GitHub, stripped TypeScript type-only syntax in memory, and
  executed all **10 original pure-model test callbacks** with the relevant
  assertion matchers in an isolated JavaScript compatibility runner.
  Result: **10 tests / 71 assertions passed** after leap-year and invalid-calendar regression additions.
- Ten additional query-contract test cases are committed with a fake
  PostgREST/Supabase client. In the isolated source-compatible runner, 9 test
  callbacks passed (75 assertions); the tenth hit a missing matcher in the
  harness, then the same committed function was checked separately with
  5 passing assertions for empty, duplicate, oversized and malformed
  institution scopes. These are not official Vitest results.
- The React server-rendering gate tests are authored but **not executed**
  in this connector workspace. They must run under real Vitest/React Query
  in exact-head CI.
- This is transparent **behavioral harness evidence, not an official
  Vitest run, typecheck, ESLint run, app build, or responsive browser
  inspection**. Those remain mandatory after migration/base integration.
- No production/hosted Supabase access or mutation occurred.

## Honest limitations

- This is a country-level institutional affiliation view, not a domestic
  political system or a complete governance module.
- Displaying a former membership uses its current organization name, not a
  fabricated historical organization identity. Historical snapshots and
  SSC-edition date labels require a future canonical historical projection.
- No world membership applications, resolutions, sessions, constitutional
  actions, document publication, Court workflow or Organizer controls are
  implemented here.
- The public membership source intentionally hides private organizations,
  so absence from this list is not proof the country has no private affiliation.
- Exact-head build, typecheck, lint, local database migration rehearsal and
  mobile/desktop browser testing remain required before release sign-off.
  No hosted production Supabase test traffic is permitted.

## Read-contract continuation (2026-11-04)

All public Country International reads are extracted from React and can be
reviewed or tested without mounting the app or connecting to hosted Supabase.
The country directory, exact identity lookup, current/former membership
queries, public institution publication check and rollout decision share one
purpose-built transport module. Tests include row selection, filter grammar,
country scoping, date semantics, error handling, paging and private-row
suppression. The public membership model also refuses impossible calendar
dates such as February 30.

**Unverified release gates** remain: official Vitest/React test execution,
TypeScript, lint/build, local TG2 migration rehearsal, mobile/desktop browser
smoke tests, and integration with the upstream #1888 and sibling #1934.
The branch should not be merged or published before these pass.
