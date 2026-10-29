# Public V3 Stories implementation evidence

This branch implements the Chat 2A Stories capability without changing System, Organizer or global navigation ownership.

## Authority

- Public data comes only from `studio2_public_storylines`, `studio2_public_storyline` and `studio2_anniversary_engine`.
- Draft/generated storylines and story mutation operations are not exposed through the V3 boundary.
- The anniversary reference date is derived server-side using `SOLARIS_TIME_ZONE`.
- V3 cutover reuses the existing global + Explore rollout authority.
- Rollout authority is resolved before the V3 Stories read graph is enabled.

## Spoilers

- Shared spoiler preference resolution is the same server-aware contract used by V3 Results.
- In protected state the archive does not render story titles, summaries, hero moments or On This Day story content.
- In protected state the detail page does not render title, subtitle, introduction or timeline moments.
- Route-head metadata remains generic and does not include dynamic story content.

## Reversibility and failure behavior

- Browser/non-app behavior remains on the established implementation.
- Before server rollout selects V3, unresolved/disabled rollout authority continues to the established compatibility route.
- After server rollout selects V3, an initial publication-safe Stories read failure remains visibly fail-closed in V3 and offers an explicit retry instead of switching to another data path.
- Later refetch/reconnect failures retain the last cached publication-safe V3 bundle rather than replacing it with legacy data.
- A V3 error surface never renders unverified story content.

## Verification

Focused regression coverage lives in `src/lib/v3-stories.contract.test.ts`. Capability registry status remains evidence-gated until current-head objective verification is available; source implementation alone is not recorded as a test PASS.
