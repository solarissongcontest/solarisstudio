# Solaris Studio production status — 20 September 2026

Solaris Studio, Confirmations and Televoting are one production application on canonical `main`. Older standalone or compatibility implementations are not production sources of truth.

## Current production baseline

- Solaris Studio is the canonical contest application and database.
- Confirmations is integrated under `/confirmations`.
- Televoting is integrated under `/televoting`.
- MySolaris is the canonical participant/delegation workspace.
- Solaris Organizer is the canonical administrative workspace.
- Permission Engine v2 is authoritative for Organizer capabilities.
- Publication gates, private ballots, Integrity evidence, country isolation and RLS remain fail-closed.
- Generated TanStack route trees are produced by the build and are not committed.
- Cloudflare Workers is the production runtime target.

### Televoting server runtime

Privileged Televoting requests remain user-token based. The server passes the **authenticated user's JWT** into the same RLS/capability boundary used by Solaris rather than substituting a browser-visible privileged credential.

`TELEVOTING_SUPABASE_SERVICE_ROLE_KEY` is **not a current Solaris Studio runtime dependency** and is not introduced by this programme.

## Public information architecture

Public IA v3 is globally enabled and is the normal public experience.

The old public navigation implementation is still present **only as rollback insurance** because its permanent removal is evidence-gated. The retirement dashboard uses the existing Beta 3 release criteria and production telemetry. As of the 20 September evidence snapshot, the comparable Beta 3 sample is still too small to justify destructive retirement.

This is not unfinished navigation implementation. It is an explicit evidence gate. See:

- `docs/public-ia-v3-retirement-readiness-2026-09-20.md`

The legacy branch may be removed only after the existing sample, route/role/mobile smoke, CI and regression gates pass.

## Product programme

The former roadmap-only products now have real implementations and canonical routes:

| Product | Canonical surface | Rollout state after implementation |
| --- | --- | --- |
| Public Encyclopedia | `/encyclopedia` | implemented, rollout-gated |
| Country Voting DNA | `/voting-dna` | implemented, rollout-gated |
| Prediction League | `/prediction-league` | implemented, rollout-gated |
| Fantasy SSC | `/fantasy` and `/admin/fantasy` | implemented, rollout-gated |
| Time Machine | `/admin/time-machine` | implemented, rollout-gated |
| Solaris Command Assistant | `/admin/command-assistant` | implemented read-only first, rollout-gated |

The feature registry classifies these as product surfaces rather than planned placeholders. They remain disabled or Organizer-only until migration, CI and production verification have completed.

### Public Encyclopedia

The Encyclopedia reuses the publication-safe public archive instead of inventing a second historical truth. Draft entries, private ballots, organizer notes and unpublished results are excluded.

### Country Voting DNA

Voting DNA is descriptive analytics only. It keeps jury and televote result dimensions separate and does not describe support patterns as evidence of misconduct.

### Prediction League

Prediction League builds on the existing Prediction Arena tables and versioned scoring. Public standings include only users who opted into public leaderboard visibility and only scores backed by published result layers.

### Fantasy SSC

Fantasy SSC has database-enforced roster size, uniqueness, eligibility, budget and server-time locks. Scoring is versioned and cannot run before the canonical result-publication gate opens. The initial production ruleset is deliberately simple and explainable.

### Time Machine

Time Machine is read-only. It reconstructs recorded event and audit evidence at a selected timestamp and explicitly reports incomplete historical evidence rather than fabricating state.

### Solaris Command Assistant

The first release is read-only and registry-based. Natural language maps only to registered operations and canonical routes. It does not generate arbitrary SQL or bypass Permission Engine v2. Mutating commands are intentionally not part of the initial rollout.

## Performance

Production real-user Web Vitals telemetry is active. The 20 September sample is still small, so route-level signals are treated as investigation evidence rather than universal performance conclusions.

The current evidence and thresholds are recorded in:

- `docs/performance-baseline-2026-09-20.md`

The recent Supabase egress reduction also changed passive live-result refresh from a 3-second database poll to a 30-second cadence while retaining focus/visibility invalidation.

## Accessibility

WCAG 2.2 AA remains the target. Automated coverage exists, and representative manual keyboard, semantics, reflow and reduced-motion verification is tracked in:

- `docs/accessibility-verification-2026-09-20.md`

No new product is considered rollout-ready merely because its route renders.

## Reliability

New engagement products use server-enforced locks and publication gates rather than trusting client clocks. Existing canonical error boundaries, route handling, auth/RLS and submission flows remain authoritative. Reliability verification covers stale state, duplicate/replayed actions, invalid URLs, permission changes and publication conflicts before rollout.

## Database and security hygiene

Applied migrations are immutable history. New schema changes are additive migrations.

Permission Engine v2 remains authoritative. New Organizer RPCs use capability checks and do not use `user_metadata` or browser service-role credentials.

Historical/compatibility database objects are not deleted merely because their names contain `legacy`. Retirement decisions are recorded in:

- `docs/engineering/legacy-retirement-inventory-2026-09-20.md`

## Supabase leaked-password protection

Supabase hosted leaked-password protection is **not part of this completion programme**, by explicit project-owner instruction. The production project is on the Free plan and the control is unavailable there. No billing, plan or Auth-setting change is performed by this programme.

## Definition of production completion

For this programme, implementation is complete only after:

- all product code and migrations are merged;
- Quality CI and Browser Audit pass;
- database migration rehearsal and advisors are acceptable;
- rollout flags are moved through internal verification before public enablement;
- production smoke verification passes;
- Public IA legacy retirement remains gated until its existing evidence threshold is actually met;
- no known P0/P1 regression introduced by the programme remains.
