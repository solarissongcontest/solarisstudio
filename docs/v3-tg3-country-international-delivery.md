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
- Membership source is TG2 `world_organization_memberships` with country
  predicate and public-organization RLS. A second lookup of only the visible
  organization IDs into `world_organizations` is required; rows without
  a verified public organization are not rendered.
- No direct browser writes, role/office assumptions, unofficial appointment
  labels, imagined institution memberships or global country-control
  duplicates. Historical affiliations are never labelled current.
- React Query caching, debounced directory search, bounded requests, no
  polling, limited retry and scoped reads protect backend egress.
- Responsive content hierarchy, accessible search/controls, recovery states,
  and a link back to the existing SSC country profile.
- Focused Vitest contract tests verify malformed data and pagination-count
  failure, private institution rejection, exact country isolation, state
  separation, and search-filter sanitization.

## Owned files (all new)

- `src/lib/world-country-international.ts`
- `src/lib/world-country-international.test.ts`
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
- Expanded focused regression coverage from 7 to **8 tests**.
- Retrieved the exact committed adapter and test-file blobs through the
  connected GitHub source, removed TypeScript type-only annotations in
  memory, and executed the **eight original test callback bodies** in an
  isolated JavaScript compatibility runner with the needed assertion
  matchers. Result: **8 tests / 37 assertions passed**.
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
