# TG3 Public Terra Solaris World: implementation and integration handoff

## Ownership

This PR owns only new public World paths:
- /world
- /world/organizations
- /world/organizations/:slug
- /world/organizations/:slug/leadership
- /world/organizations/:slug/members

It adds an isolated World query boundary, read-model parsing and route components.
No migration, Permission Engine, Task Engine, root app shell, top navigation,
existing country route, or TG4 document work is modified.

## Prerequisite

**Stacked on TG1/TG2 foundation PR #1888**, whose head at branch claim was
01580c97e0a1397baffaac4aa4e176b51625fc75.
Do not merge into main before #1888 is integrated, restacked and certified.
TG4 documents PR #1890 is independent and does not need to be merged first.

## Canonical source

Terra Solaris World Systems master plan, TG3, sections 117–123:
editorial World overview, searchable organizations, bounded organization
overview, dedicated leadership and membership screens.

The source is **TG2's existing world_organizations table and
world_organization_projection_v1 RPC**. GUARD and UNITY are seed records,
not hard-coded frontend truth. The absence of confirmed memberships, leaders
or representatives remains an explicit empty state.

## Boundary and production safety

- Public reads only: TG2 RLS gates directory rows, and TG2's public RPC
  gates organization detail. No browser-owned official mutations.
- Server functions use the existing public runtime client, not service_role.
- Directory projection is exact-count paginated to 12 records per request,
  with search submitted intentionally rather than on every keystroke.
- Query caching avoids repeated reads. No realtime subscriptions or polling.
- Country enrichment requests only IDs related to published membership or
  representation. Links and 3:2 flags use the existing country identity.
- TG2 projection still returns all organization memberships in one RPC; a
  future System-owned paginated read projection is needed for very large
  institutions. The UI bounds its initial lists and exposes more on demand.

## Existing launch and integration boundaries

This PR **does not enable global maintenance cutover** and does not modify
shared Explore navigation, which is actively owned by #1873 and #1874.
Once TG3 + TG2 are integrated, the navigation owner must add a discoverable
World/Institutions entry in Explore/Search and country International sections.
Do not silently replace the current Country or Search registry.

## Tests and follow-up

Focused unit tests exercise publication-safe parsing, unknown private
organizations, active versus former membership, image URL safety and filter
grammar. The dedicated pages offer skeleton/loading, empty, not-found,
unavailable and retry states. Integration commanders must run exact-SHA CI
and local-only browser/mobile verification after dependencies land.

Deferred TG3 capabilities: editable country International subpage,
World public search index, public activity/statement feed from later
governance waves, full historical office timeline and long-list server
pagination. These are not claimed complete.
