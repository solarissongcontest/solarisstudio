# Terra Solaris TG2 public organizations, wave 2

Starting main SHA: 7eda678c98a63caf49e59b3507cf2130e8d3200b.

Upstream dependency: PR #1888, exact base at claim 01580c97e0a1397baffaac4aa4e176b51625fc75.

## Scope

Public organization directory at /world/organizations: server-paged collection, name/abbreviation search, status filters, explicit empty/loading/error/retry states.

Public detail at /world/organizations/:slug: published institutional identity, bounded overview, current officeholders, registered public organs, current membership directory, country links, 3:2 flags, pagination and manual recovery.

Mobile and desktop use the existing AppShell, without duplicating navigation, changing maintenance, or touching other workers' visual-cutover files. GUARD and UNITY are database records; this client has no brand-specific governance rules.

## Canonical read authority

The directory reads public.world_organizations through its published-only RLS. Details read only the authoritative world_organization_projection_v1(p_slug) RPC. The client projects known fields only; no raw account IDs, private proxies, grants, or representative identities are forwarded to the view. Current member counts use only current membership rows. No historical members/officeholders are guessed.

Requests are bounded to 25 directory records including look-ahead, 20 published country identities per member page and one RPC per detail. No polling, full-country table query or hidden production testing.

## Integration dependencies and remaining product

Merge PR #1888 and rehearse TG1/TG2 migrations locally before integrating this PR. The root Public Explore nav, global sitemap and home are under parallel ownership; integration commander should add a discoverability link to /world/organizations after coordinating with active Public/navigation owners.

TG4 documents in PR #1890 are deliberately not duplicated. Assembly, agendas, proposals, resolutions, formal documents, Court, notifications, private membership controls, historical world archive, editorial world landing and governing mutations are separate unfinished work.

This PR is not certification, not full TG release readiness, and does not apply a migration to production.
