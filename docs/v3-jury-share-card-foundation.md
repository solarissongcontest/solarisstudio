# Solaris Studio V3 Jury Share Cards — foundation boundary

This file records the intentionally limited first implementation slice for the canonical `results.jury_share_card` capability.

## What lands in this slice

- product-safe TypeScript contracts for the jury-share projection;
- publication/visibility eligibility rules;
- the fixed Solaris Default design contract;
- Story target geometry and safe-area contract;
- theme availability for Default / Edition / Liquid Glass;
- deterministic render-key material that includes result and identity versions;
- text-share formatting;
- focused unit coverage.

The source is `src/lib/v3-jury-share-card-foundation.ts`.

## What is deliberately not wired yet

This slice must not expose a user-facing Share button, render endpoint, Organizer editor or database writer yet.

The full product remains blocked on stable canonical contracts for:

1. published Results version and jury-breakdown visibility;
2. caller-scoped Me / History / Activity access to historical jury participation;
3. historical identity resolution across the source country and all recipients;
4. Organizer edition-branding / scoreboard tokens needed by the Edition theme.

The foundation therefore exports `V3_JURY_SHARE_FOUNDATION` with `uiEnabled=false` and `renderEndpointEnabled=false`.

## Supabase inspection

A bounded read-only inspection of the connected Solaris Studio project on 2026-10-18 confirmed that the existing canonical source model already contains the relevant foundations:

- `public.jury_ballot_submissions`;
- `public.jury_votes`;
- `public.results`;
- `public.country_edition_identities`;
- `public.editions` and `public.shows`;
- `public.studio2_show_publication_controls` including `source_result_version`;
- `public.studio2_feature_flags`.

There is currently no `edition_jury_share_themes` table, no `jury_share_render_cache` table and no `get_jury_share_projection(...)` RPC in the connected production database.

That is intentional for this foundation slice. Do not create parallel share-specific vote truth. When the upstream contracts stabilize, System V3 should decide whether dedicated theme/cache schema is actually required, then add it through the normal migration/RLS/security process.

## Default theme invariant

`Default` is the permanent Solaris design. It must not inherit edition artwork, edition scoreboard geometry, edition typography or edition-specific decorative styling. Only factual content such as edition/show labels, historical names, flags and points may differ.

`Edition` and `Liquid Glass` remain independent optional visual treatments.

## Publication invariant

A closed Jury window is not sufficient to unlock sharing.

The eventual server projection must establish all of the following before export is allowed:

- canonical ballot exists;
- ballot is final;
- corresponding official result version is published;
- jury breakdown is public according to publication policy;
- viewer is authorized for any non-public ballot context.

The browser must never infer publication authority from a local timer, Jury closure or a hidden/disabled button.

## Historical invariant

Render identity includes the result version and historical identity versions. A corrected result or corrected historical identity must therefore produce different render-key material and cannot silently reuse an obsolete cached card.

## Production safety

All automated tests for this capability must remain local/isolated and must never crawl or render against hosted production Supabase. Production inspection is bounded and read-only only.

## Next implementation slice

After Results + Me/History + historical identity contracts stabilize:

- register/wire the capability in the shared Public registry with current-main coordination;
- add the caller/public read projection;
- enforce server-side eligibility and authorization;
- build the actual high-resolution Default renderer;
- add PNG/JPEG delivery and cache identity;
- add Results and Me/History entry points;
- then add Edition and Liquid Glass themes.

Do not skip directly from this foundation into a browser-only implementation of missing server authority.
