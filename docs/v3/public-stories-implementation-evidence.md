# Public V3 Stories implementation evidence

Chat 2A owns this capability under Public Discovery, Content, Live & Results. The implementation stays inside Public route/content ownership and does not change System schema, Organizer operations or global navigation.

## Authority

- Public data comes only from `studio2_public_storylines`, `studio2_public_storyline` and `studio2_anniversary_engine`.
- Draft/generated storylines and story mutation operations are not exposed through the V3 boundary.
- The anniversary reference date is derived server-side using `SOLARIS_TIME_ZONE`.
- V3 cutover reuses the existing global + Explore rollout authority and fails closed to the established routes.

## Spoilers

- Shared spoiler preference resolution is the same server-aware contract used by V3 Results.
- In protected state the archive does not render story titles, summaries, hero moments or On This Day story content.
- In protected state the detail page does not render title, subtitle, introduction or timeline moments.
- Route-head metadata remains generic and does not include dynamic story content.
- Share controls and related-story disclosure remain behind the explicit spoiler reveal boundary.

## Continuity and sharing

- Published Story detail links back to its canonical Edition surface.
- Related Story continuity is optional: a supplemental archive-read failure cannot hide an otherwise valid published Story.
- Sharing uses native Web Share when available, then clipboard fallback, without introducing a second publication source of truth.
- Story timeline and publication dates use one deterministic Solaris archive formatter (`Europe/Helsinki`, fixed English locale) rather than render-time browser locale/time-zone inference. This keeps SSR and hydration text stable while preserving archival date meaning.

## Reversibility

Browser/non-app behavior remains on the established implementation. App mode falls back to the established implementation whenever the V3 bundle or rollout authority is unresolved, failed or disabled.

## Verification already merged

- PR #1100 merged the V3 Stories archive/detail continuity alongside delegation and Explore continuity.
- PR #1217 merged Story continuity and safe sharing with exact-head Quality and responsive Browser Audit passing.
- Focused regression coverage lives in `src/lib/v3-stories.contract.test.ts` and `src/lib/v3-stories-detail-continuity.contract.test.ts`.

The Public capability registry is therefore no longer truthfully `mapped`; it is `building`. It is deliberately **not** marked `parity`: richer artwork and related-entity/country story coverage still depend on publication-safe source data and must not be fabricated from mutable client-side labels.

## Current hardening slice

Branch `v3/public-stories-current-main-hardening` was restacked onto main `14b6eea59a3397e4fcf3ec419b3b6088876100a4` after the unrelated Scoreboard merge, preserving the reviewed feature blobs while adding deterministic archival date rendering and reconciling the capability status to evidence-backed `building`. Final exact-head checks for this restacked slice are CI-owned and must run only against isolated/local test infrastructure, never hosted production Supabase.