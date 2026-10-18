# Public V3 Stories implementation evidence

This branch implements the Chat 2A Stories capability without changing System, Organizer or global navigation ownership.

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

## Reversibility

Browser/non-app behavior remains on the established implementation. App mode falls back to the established implementation whenever the V3 bundle or rollout authority is unresolved, failed or disabled.

## Verification

Focused regression coverage lives in `src/lib/v3-stories.contract.test.ts`. Capability registry status is intentionally unchanged until exact-head objective evidence is available.
