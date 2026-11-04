# TG7: Formal institutional measures and procedural submission (first vertical slice)

## Ownership and dependencies

This is a **stacked implementation on the exact head of PR #1950** (`0aabcfe667099b539c20d3cdbf9cb372b2a268f9`), which itself depends on the TG1/TG2 organization/organ, membership and scope foundation in PR #1888. It creates no competing institution, permission engine, task engine or voting system. No hosted Supabase was contacted.

Canonical persisted owners: `public.world_measures`, `public.world_measure_versions`, `public.world_measure_categories`, `public.world_measure_procedural_reviews`. The TG6 `world_sessions` table is referenced but not changed. Existing Permission Engine V2 `studio2_capabilities` and scoped `world_access_allowed` remain authoritative.

## Implemented

- Organization-scoped, sponsor-scoped, organ-scoped measure records with the complete canonical measure-type and state vocabularies.
- Reusable topic-code registry with stable historical codes. **GUARD topic codes are not invented**: an authoritative list is needed to seed them before formal GUARD registration works. Its bounded, publication-filtered `world_measure_categories_public_v1` projection provides active labels to future forms without leaking private or expired codes.
- Version history with same-measure composite FKs, unchangeable text and hashes; only one-way `draft -> published` promotion for a registered version is permitted.
- `world_measure_submit_v1`: sponsor must control the country or hold a delegated world capability, have an active member term, and target an active organ of that organization. Creates an unpublished version, durable idempotency receipt and domain event.
- `world_measure_review_v1`: authorized procedural reviewer can start review, return for a recorded procedural correction, or register with an immutable identifier. No political-content veto, vote result or approval decision is fabricated. GUARD identifiers keep the canonical `GAG.Year.Sequence.CountryCode.TopicCode.ShortTitle` structure with exact sponsor/category alignment.
- `world_measure_resubmit_v1`: country corrects returned text as a **new version** with CAS; prior text remains archived. Every procedural decision and note is also stored as a private append-only review record, preserving the reason for corrections after the current note is cleared.
- Safe `world_measure_public_list_v1` and `world_measure_public_detail_v1`: only a formally registered **public** measure belonging to a public organization/organ and holding a published current version can be read anonymously. Public list is limited to 50; version history is capped at 25. Sensitive drafts/private procedural notes do not escape.
- Scope-authorized private `world_measure_manage_v1`, capped at 20 latest versions and 50 latest procedural decisions with explicit truncation indicators; older history remains permanently persisted. Explicit RPC grants, table grants revoked and RLS enabled.

## Still required for full TG7

- Genuine GUARD topic-code backfill from constitutional sources; no guessed codes.
- Authenticated mobile/desktop submission, correction/review UI integrated into the existing shell.
- External DM/Instagram intake with receipt and audit-hash provenance, separated from the formal measure record.
- Scheduling registered measures onto TG6 agendas; voting, amendments, constitutional policy snapshots, resolutions, certification, Archive and notification/Task Engine consequences.
- Actual local Supabase migration/replay/authorization tests and exact-source GitHub CI; the committed Vitest source contracts do not prove runtime SQL behavior by themselves.

This is an **implementation**, not certification of TG7, and does not authorize production migration until stacked prerequisite PRs and migration rehearsal are complete.



