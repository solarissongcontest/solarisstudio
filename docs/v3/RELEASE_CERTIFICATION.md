# Solaris Studio V3 — Release Certification Ledger

**Status: NO-GO for public release.** Source verification, database adoption, deployment promotion, and public-write activation are separate decisions. This is a source-controlled integration record, not a deployment certificate or authorization.

**Live GitHub baseline (14 November 2026):** `main` at `aec3ee018aa64fe0f2e3055b9a48d4fad40c649f`. This is an observed integration baseline, **not a certified final release SHA**. Re-read main before any merge or release decision.

## Merge queue: exact observed candidate heads

| Order | PR | Head SHA | Current evidence and next gate |
| --- | --- | --- | --- |
| 1 | [#2516](https://github.com/solarissongcontest/solarisstudio/pull/2516) Push dispatch authentication | `6ff4d1eae78ce2e96ed931523cce850140cf2482` | Open, non-draft, mergeable; recorded Quality, Browser, S13, S15, bundle, public/Organizer contracts, stateful acceptance and main-freshness runs pass. **Security caveat:** when `SOLARIS_PUSH_DISPATCH_SECRET` is absent from the Edge environment, a nonempty arbitrary header still reaches the service-role Vault lookup before authentication. Verify deployed secret configuration or finish a fail-closed design before treating *all* unauthenticated lookups as eliminated. |
| 2 | [#2496](https://github.com/solarissongcontest/solarisstudio/pull/2496) Me privacy | `b90a5bf8e51a395d4d9f8951fe6d8395c7f65343` | Open, non-draft, mergeable; recorded Quality, Browser, S13, S15, bundle, public/Organizer contracts, stateful acceptance and freshness pass. Fix scopes private summary cache by viewer and country and provides identity-mismatch recovery. |
| 3 | [#2497](https://github.com/solarissongcontest/solarisstudio/pull/2497) Home truth | `0949503c020d0cbf1239b2f600b93889b8174606` | Open, non-draft, mergeable; same recorded core gate family passes. Required/optional tone and anonymous calm-state messages use canonical task and identity data. |
| 4 | [#2518](https://github.com/solarissongcontest/solarisstudio/pull/2518) S08 recovered-state verification | `c220db7dc1dbf9696ba67a9974d27feb855ae79e` | Open, **ready for review** (changed from draft on 14 November); recorded Quality, Browser, S13, S14 ordered PG17.11 recovery, S15, bundle and freshness pass. Tests include interrupted S08 rollback, retry/duplicate refusal, API-role direct DML denial and restored-state Results safeguards. No production recovery has occurred. |

No submitted reviews or unresolved inline threads were returned for these four PRs in the 14 November inspection. That is not an assertion of independent approval. Each merge changes main and invalidates downstream freshness; merge one at a time only after the production promotion boundary and applicable security evidence are settled.

## Cloudflare promotion boundary — hard integration blocker

`wrangler.jsonc` defines Worker `studio`, production runtime variables, and `.output/server/index.mjs`; README documents `bun install && bun run build` followed by `npx nitro deploy --prebuilt`. Main-push GitHub Actions perform Quality/build/rehearsals, without an evident direct Worker deployment step in the inspected CI workflow.

The Cloudflare GitHub check **Workers Builds: studio** for main `aec3ee0` succeeded and reported build `762f6f05-ee65-46fb-8d54-b2462f972ddc`, Worker version `8bf204bd-fade-4e3f-ad06-d2bfc1f869a3`, and preview alias `main-studio.solaris-song-contest.workers.dev`. **Neither a build check nor a preview URL proves whether that version is active on production routes.** The actual Cloudflare Workers Builds production-branch, build/deploy command, auto-promotion policy, current deployed version, custom-domain routes and deployment history must be read from Cloudflare account settings. The connected GitHub API does not expose these Cloudflare account controls. Until verified, do not merge to `main` if main could auto-promote an unapproved deployment. Do not change Cloudflare settings or promote a Worker without separate owner approval.

## Exact-SHA gate inventory

| Gate | Evidence at 14 November baseline | Release implication |
| --- | --- | --- |
| `main` Quality, S13, public routes/contracts and stateful 66-country acceptance | GitHub exact-`aec3ee0` checks succeeded | Useful main baseline; does not certify unmerged PR code |
| Candidate PR exact-head Quality/Browser, S13/S15, bundle, contracts/freshness | All four recorded candidate heads succeeded; #2518 additionally passed its S14 local ordered/recovery workflows | Candidate confidence only; merge and retest at new exact main |
| Source S07/S08 and S13→Archive→S07→Results→S08 | Existing System-owned source candidates and #2518 PG17.11 recovered-state CI; no new live migration | Valid local evidence, not hosted schema equivalence |
| Real production migration history/effects | Previous observed snapshot: hosted tip `20261101181812`, 497 hosted entries, 504 source files, 36 absent hosted history entries before tip, 42 source files after tip; **not revalidated in this session** | Effects must be reconciled against a bounded, read-only hosted catalog; history absence is not proof of missing SQL |
| S16 database mutation authority | No exact integrated final candidate-wide runtime authority result inspected here | BLOCKED until grants/RLS/RPC/SECURITY DEFINER/trigger and legacy writer evidence is complete |
| Full-contest acceptance on clean and recovered baseline | Prior source and isolated CI exist; no post-integration exact-final-main full-contest certificate | BLOCKED |
| Supabase Preview | Current checked main/PR statuses include skipped Preview checks; previous ledger documented a historical migration-history mismatch | Skipped is not PASS; do not silently assume hosted adoption |
| Real production backup restorability | The local #2518 fixture restores synthetic local data, expressly not a production backup | BLOCKED pending verified protected backup and authorized restore rehearsal |
| Cloudflare active production version and routing | GitHub build result and preview URL only | BLOCKED |
| Hosted migration, production deploy, public-write activation | Three separate explicit approvals are absent from this session | NOT AUTHORIZED |

## Production recovery approval package: minimum missing evidence

The current repository recovery SQL and networkless tests are **not an operator-approved executable production sequence**. Before an authorized operator acts, System must bind a specific forward-only migration list and exact file digests to (1) live catalog effect-by-effect presence, (2) dependency and privilege order, (3) interrupted/retry duplicate handling, (4) preserved historical official results/votes, (5) rollback versus forward-recovery failure-stop criteria, and (6) verified restore of a real safeguarded backup. Provide operator roles, a post-migration bounded read-only authority check, deployment/schema compatibility, incident monitoring and Supabase egress limits. Never manufacture migration-history rows or blindly replay stale migrations. These are **unresolved requirements**, not completed procedures.

## Public release decision

**NO-GO.** Hard blockers: Cloudflare source-merge-to-production promotion unknown; integrated head and exact-SHA gates missing; Push Vault-only preauth boundary not proven safe for all runtime configurations; hosted migration effects and real backup restore not verified; S16 and clean-plus-recovered full-contest certification incomplete. Separate production migration, deployment and public-write approvals remain outstanding.

**Next safe integration step:** inspect Cloudflare `studio` → Workers Builds settings and production deployment/version history, establish whether main pushes automatically activate production, and record the observed deployed version and routes. While blocked, finish PR-level security/review and local-only source tests. Do not merge production-triggering branches or disable maintenance.

*This ledger is intentionally a current NO-GO snapshot. Any later main SHA or PR head requires fresh evidence; do not reuse this table as a future release certificate.*
