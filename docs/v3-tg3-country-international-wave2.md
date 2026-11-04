# TG3 Country International public slice (Wave 2)

## Ownership and dependencies

This PR is stacked directly on [TG1/TG2 #1888](https://github.com/solarissongcontest/solarisstudio/pull/1888)
at 01580c97e0a1397baffaac4aa4e176b51625fc75. At start, main was
7eda678c98a63caf49e59b3507cf2130e8d3200b.

Owns only new paths under:
- src/lib/terra-world-country-international*
- src/integrations/v3/terra-world-country-international.server.ts
- src/components/world/TerraWorldCountry*
- src/routes/world/countries/**
- docs/v3-tg3-country-international-wave2.md

Does not modify the contested World organization directory or details, which
are separately claimed by #1934/#1936/#1938, or the existing Country routes,
Public shell, central navigation, TG1/TG2 migration, or TG4 documents.

## What works

1. A read-only international country directory with 18-at-a-time server
   pagination, search on explicit submit (not per keystroke), flags at canonical
   3:2 proportions, responsive rows and safe retry/empty/loading states.
2. Public country identity from the TG1 world_country_identity_v1 RPC,
   including published government metadata and confirmed durable controller
   identity, explicitly saying when the latter is unresolved.
3. Current and historic international membership lists derived from TG2
   world_organization_memberships, only joined to currently public
   world_organizations. A private organization is never inferred or shown.
4. User-facing country history link to the existing contest Country page.
   Membership institution links depend on the separately integrated public
   organization routes in #1934 or another adopted equivalent.
5. Focused pure-model tests for malformed input, cross-country results,
   missing durable identity, no invented leader/owner, duplicate membership,
   public organization filtering, status boundaries, safe flags, query grammar
   and bounded count semantics.

## Canonical authority and safety

- No new country owner or membership truth.
- No official mutations, service-role calls or production data operations.
- TG1 public RPC is the only source of fictional government/controller display
  facts. public.country_accounts stays sole *current country controller* authority.
- TG2 RLS gates memberships and organizations; never read private proxies,
  office capability grants or user-linked representation tables.
- Every successful membership query must prove a complete count (no silently
  truncated institutional history). Country/organization IDs are exact matches.
- Existing public Supabase runtime only, finite reads, 5-minute client cache,
  maximum one retry and no polling/realtime.
- Isolated unit tests only. Browser testing must target local Supabase.
- No changes to maintenance or V3 rollout flags.

## Integration instructions

1. Integrate and migrate #1888 first with local migration and RLS evidence.
2. Integrate this focused PR without copying unrelated TG3 directory work.
3. Integrate one chosen organizational directory/detail implementation so
   outbound institution links work. Do not blindly merge all overlapping
   #1934/#1936/#1938 variants.
4. The Explore/Navigation owner may later add a discoverable World/Country
   International entry, without losing the existing Country contest journey.
5. Perform exact-SHA CI, local-only responsive verification and public RLS
   tests before enabling this product in maintenance-off production.

## Remaining TG3 work

Representatives/officeholders by country, treaties, proposals, resolutions,
sanctions, Court cases, world activity and archive history need additional
canonical published read projections or later governance phase commands.
They are not invented here. Full World Search/global navigation are also
outside this PR's ownership.
