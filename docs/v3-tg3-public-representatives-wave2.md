# V3 Wave 2: Terra Solaris public country representatives

## Authority and ownership

- Canonical World Systems master plan section 19: one active ordinary voting representative per country and organization; durable historical identity; optional auth linkage.
- Stacked on #1888 TG1/TG2, SHA 01580c97e0a1397baffaac4aa4e176b51625fc75.
- Current main at claim: 1be85190b542787d925443bf8a9241a3648f584b.
- Exclusive additions: TG3 public roster read projection, standalone route and screen, safe adapter, tests, dedicated capability map, and one additive canonical registry import.
- Avoids #1934 World landing/institution profile, #1944 relationship history, #1942 office history, #1941 Country International, #1950 sessions, #1890 documents and shared navigation. Prior #1938 duplicate has been closed unmerged.

## Functional vertical slice

Public route: /world/organizations/:slug/representatives.

- Search recorded public representatives by country, code and delegate display name, with native form submit.
- Current, former and all-term filters.
- Exactly 16 representatives per page, canonical total/next page proof, no N+1 read loops.
- Responsive institution/country roster with current 3:2 flags, country profile links, recorded voting authority and UTC start/end dates.
- Loading, invalid route, unknown/nonpublic institution, error/retry, empty states.
- Accessible native controls and keyboard navigation; no background polling or mutation.

## Privacy and correctness

New SQL RPC: public.world_public_representative_roster_v1(slug,status,search,offset,limit).

- Unknown and nonpublic institutions both return null; published organization scope is checked in SQL before reading terms.
- Canonical TG2 representation terms and durable delegation_people display names are reused; no inferred or duplicated representative authority.
- Returns published display names, roles, voting authority, current country identity and term dates, not login user identifiers, private proxy identities, grants or person IDs.
- Server validation limits status, slug length, search length, offset, and page limit; parameterized substring matching without dynamic SQL.
- Count and page read from one stable query snapshot and deterministic chronological order.
- No tables, trigger-induced writes, application service-role key or hosted production test traffic.
- Current country names and flags are not claimed to be historical versions.

## Verification

Added pure decoder tests, mocked RPC data tests and SQL/route/publication contract tests.
These tests are committed but have NOT been executed. A direct git clone attempt failed due unavailable DNS for github.com. The standard Quality workflow only runs pull requests targeting main, while this PR correctly targets the unmerged TG2 foundation. Exact-SHA TypeScript, Vitest, lint, build, isolated migration rehearsal and responsive browser checks remain mandatory.

## Integration dependencies

1. Certify/merge #1888 first, then restack this additive TG3 branch.
2. Independently review publication rules and RLS against canonical TG2.
3. Coordinate the Representatives link in #1934 institution detail via its owner after both are adopted, without overwriting existing World pages.
4. Reconcile the single additive capability aggregator change with concurrent registries.
5. Rehearse migration on isolated local Supabase and run exact final commit checks. Do not mutate hosted production to test.

Unimplemented: delegate assignment/reassignment, proxy approval, elections, officeholders, membership actions, historical identity snapshots, and full release certification.
