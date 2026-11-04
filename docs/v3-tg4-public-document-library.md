# V3 Wave 2: TG4 Public institutional document library

## Ownership and stack

This PR owns only the read-only Public document browsing and reading UI plus its local read-model parser and tests.

- Starting main: 7eda678c98a63caf49e59b3507cf2130e8d3200b.
- Direct prerequisite: TG4 document authority PR #1890 at 1b440fc1939c5af6916c61da73708075856dcba6.
- Transitive prerequisite: TG1/TG2 institution foundation PR #1888.
- Do not merge to main before prerequisite migrations are adopted and verified.
- No second document table, Archive store, writer, capability engine, or route-level mutation.
- Avoids concurrent TG3 Public World branches, TG4 Organizer draft-workspace ownership, navigation/visual cutover, and frozen Results integration.

## Routes

- /world/documents: bounded institution document search and index.
- /world/documents/:organization/:document: published current Version reader.
- ?version=N: historical version of that canonical Work.

TG3 can link to this index from World and organization pages. The organization-local alias /world/organizations/:slug/documents is intentionally not claimed here because TG3 workers own that route hierarchy.

## Canonical data only

Index uses world_get_document_index_v1(p_organization_slug,p_query,p_limit) at 25, 50 or 100 rows per deliberate user request. Reader uses world_get_document_v1(p_organization_slug,p_document_slug,p_version_number).

Both are existing System-owned TG4 read contracts. No direct browser access to canonical document/version/provision tables or privileged service role.

Parser builds a narrow Public view model. It rejects invalid slugs, duplicate index identities, malformed published Versions, and route identity mismatch. It excludes:

- non-public documents even if the caller has additional institution permissions;
- draft-only Works with no published current Version;
- draft Versions and history, permission grants, allowedActions and provenance metadata.

This is defense-in-depth presentation filtering, not a substitute for TG4 server-side authorization and publication policy. All legal text is rendered as React text, not injected HTML. Exact source whitespace is preserved. Anchors are syntax-checked and deduplicated.

## Product behavior

- Responsive searchable library, institution filter, deliberate search submit and bounded expansion.
- Published current-Version reader with durable provision deep links, legal-text provisions, version history and older-version warning.
- On wide screens: document contents | legal text | version metadata; on phone/tablet: full contents via accessible bottom sheet.
- Contents navigation includes every section instead of silently cutting off after forty. Stable IDs derive from TG4 semantic keys rather than mutable display numbering; legacy version anchors remain usable.
- Cold deep links restore their section after the authorized RPC finishes, but only when the fragment belongs to that exact published Version.
- Local in-document phrase search without extra Supabase requests.
- Mobile contents disclosure and desktop contextual rail.
- Loading, empty, unavailable, not found, error and retry states.
- Accessible controls and existing application safe-area shell.
- No new bottom bar, feature-rollout mutation, or official-state write.

## Evidence and limitations

Focused code tests are in src/lib/world-public-documents.test.ts. They must run in a repository checkout. The current source includes cases for semantic provision renumbering, full contents after section 40, missing or stale fragments and preservation of existing version anchors.

On 2026-11-04, eleven runtime smoke checks of extracted type-erased pure source implementations passed in an isolated JavaScript environment. Those checks are useful functional evidence for the projection/fragment functions but are **not** the committed Vitest suite, TypeScript compilation or UI rendering tests:

npx vitest run src/lib/world-public-documents.test.ts

Then run npm run typecheck, npm run lint:ci, npm run build and a local-only browser review on the exact head. Stacked PR CI may not trigger because workflows currently target main. NEVER run hosted-production Supabase tests.

Remaining beyond this scope:

- TG3 Explore/World/organization navigation links and alias.
- Authorized member-only document library.
- PDF export, amendment comparison and related-provision relationships.
- Historical Archive index for Works with no current published Version.
- Mobile/desktop visual and accessibility certification on a seeded local TG4 stack.
- Any database migration or production deployment.
