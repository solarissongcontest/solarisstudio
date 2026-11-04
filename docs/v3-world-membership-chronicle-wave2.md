# TG3 public institutional membership history (Wave 2)

## Scope and independent ownership

This PR introduces **one additional read-only TG3 discovery experience**:
- /world/membership-history/
- src/components/world/TerraWorldMembershipChronicle.tsx
- src/lib/terra-world-membership-chronicle*
- src/integrations/v3/terra-world-membership-chronicle.server.ts

The feature is not another /world landing, organization directory/profile,
country International page, or membership command. It lets public readers
search and paginate terms *across* institutions and countries, including
concluded relationships rather than only current institution members.

No files owned by concurrent public World workers #1934/#1936/#1938, country
International #1941, TG5 membership intake #1937, Organizer documents #1940,
TG4 docs #1890, or the existing visual/nav/Results owners are touched.

## Canonical source and constraints

Requires System TG1/TG2 foundation #1888 (starting exact SHA
01580c97e0a1397baffaac4aa4e176b51625fc75). Main at run start was
7eda678c98a63caf49e59b3507cf2130e8d3200b.

TG2 world_organization_memberships remains the only membership truth.
RLS returns only publicly visible organization memberships. Published
world_organizations is independently required for names and links. A
membership from an unpublished institution is suppressed even if upstream
read behavior were to change.

- 16 rows per page, exact database count proof.
- Current versus concluded term filter uses canonical ended_at, with
  suspended memberships remaining current if ended_at is null.
- Exact country-code and organization-slug filtering, no PostgREST
  free-form expression interpolation.
- Public country identities fetched only for returned country IDs.
- Country names and 3:2 flags are **current** identities. No claim to have
  historical identity snapshots for membership timestamps.
- No inferred admission vote, expulsion decision or auto-membership.
- No service-role read, browser mutation, duplicated state, polling,
  background retry loops or production testing.
- Query caching, controlled retry and loading/empty/error/retry states.
- Keyboard-accessible form, responsive chronology and reduced-motion
  loading state.

## Integration

1. Merge and certify #1888. Do not enable this route against old schema.
2. Restack this PR onto the merged main and run exact-SHA checks and
   anonymous RLS/browser validation using isolated local Supabase.
3. Integrate exactly one selected World organization directory/profile PR
   (#1934, #1936, #1938). Outbound Institution links depend on that route.
4. Navigation owner may then connect /world/membership-history into
   World/Explore and organization member/history context. No active shared
   navigation files were edited here.
5. Keep full V3 maintenance gating unchanged until certification.

## Remaining

This is not a full World governance timeline. Direct current/public status
is all TG2 can prove here. Historical country identity resolution, immutable
decision/event provenance, full archive narratives, jurisdictional votes
and official acts depend on later authorized World System projections.
