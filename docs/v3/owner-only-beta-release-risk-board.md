# Solaris V3 A07: owner-only beta release-risk board

> **Merge-process note (owner update, 14 November 2026):** [The current evidence-based merge policy](merge-review-policy.md) replaces routine independent-AI/integrator merge approval. The currently authorized implementation session may integrate its own verified PR. This historical release/evidence document does not authorize production changes or waive safety gates.

**Observed source main:** [`49abd36426a5c7227406fc9f574442aa36d30e16`](https://github.com/solarissongcontest/solarisstudio/commit/49abd36426a5c7227406fc9f574442aa36d30e16) (8 November 2026). **Status: NOT CERTIFIED / NO GO pending proof.**

**Full-V3 authority remains separate:** [final-week release blocker matrix](https://github.com/solarissongcontest/solarisstudio/blob/49abd36426a5c7227406fc9f574442aa36d30e16/docs/v3/final-week-release-blocker-matrix.json). This is a source-based, grouped **partial** full-V3 matrix (`initial_verified_high_priority_only`, snapshot `2026-11-08`, 15 rows), not an exact-current-runtime audit of all migrations, hosted database effects, CI or capabilities.

**Source-board counts:** **9 unresolved hard blockers** (1 historically closed hard row); **5 unresolved conditional reviews**; **0 verified conditional exclusions**; **0 safely classified tracked-debt rows** (not proof of zero V3 debt); **1 verified replaced PR group**; **7 explicit separate unknown/proposed-exclusion findings**, with five conditional scope reviews also pending. Counts of unknowns overlap the matrix and are not additive defect totals.

## Owner-only beta boundary

One authorized project-owner tester; core server-authoritative Confirmation, Entry, Media, Jury, Televote, Results/publication, Archive and recovery, authentication/access control, safe tested shell and isolated local complete-contest rehearsal still require proof. This board does **not** permit a production launch or weaken an official state mutation.

**Required tested paths:** one-owner authentication and server-enforced access; Confirmation → Entry and Media; Jury → Televote → Results and publication; Archive and recovery of official contest state; isolated local full-contest rehearsal and candidate-specific integrity evidence; safe installed-app shell/navigation for the tested client.

**Explicitly unauthorized operations:** hosted database migration; production deploy or Worker promotion; disable maintenance or reopen public writes; modify production secrets or bypass RLS; automated tests, previews or browser audits against hosted Supabase.

## Hard blockers: preserved, not reclassified

| Finding | Recorded status | Owner | Dependencies | PRs observed | Required evidence / next action |
| --- | --- | --- | --- | --- | --- |
| **SYS-FRONTIER** | blocked | System / Supabase | None | [#2393](https://github.com/solarissongcontest/solarisstudio/pull/2393), [#2403](https://github.com/solarissongcontest/solarisstudio/pull/2403), [#2404](https://github.com/solarissongcontest/solarisstudio/pull/2404), [#2405](https://github.com/solarissongcontest/solarisstudio/pull/2405) | New authorized bounded read-only hosted catalog fingerprint; Source-to-hosted effect-level classification and dependency graph; Sanitized hosted-equivalent local fixture; System owner reconcile #2405 hosted-only guard triggers and notification-delivery grants, restore missing source-owned Archive/Task/receipt triggers and indexes through an approved forward-only local-tested recovery path; reverify migration frontier without production writes. |
| **SYS-S13** | in_progress | System / Supabase | SYS-FRONTIER | [#2393](https://github.com/solarissongcontest/solarisstudio/pull/2393), [#2403](https://github.com/solarissongcontest/solarisstudio/pull/2403) | Strict negative precondition tests; Sanitized local hosted-equivalent restore and replay; Grant/RLS/function-signature proof; Review and safely integrate System-owned forward-only S13 candidate; no blind hosted replay. |
| **SYS-ARCHIVE** | blocked | System / Supabase | SYS-S13 | [#2403](https://github.com/solarissongcontest/solarisstudio/pull/2403) | Hosted-equivalent local forward-recovery replay; Archive terminal-state and one-shot guard negatives; Post-failure Task and notification convergence; Rebase System-owned Archive PR on actual current main and prove recovery on sanitized hosted-equivalent local state. |
| **VOTE-AUTHORITY** | in_progress | System / Voting | SYS-FRONTIER, SYS-S13 | [#2404](https://github.com/solarissongcontest/solarisstudio/pull/2404) | Unauthorized role/actor/edition/round denial; Idempotency and stale-version regression; Single-authority S16 catalogue checks; Negative Combined-score and corrected publication acceptance; Complete #2404 ownership review and local S14 source-truth replay; do not create competing writer. |
| **RESULT-PUBLICATION** | unverified | Results owner / System | VOTE-AUTHORITY, SYS-ARCHIVE | [#1400](https://github.com/solarissongcontest/solarisstudio/pull/1400), [#2402](https://github.com/solarissongcontest/solarisstudio/pull/2402), [#2404](https://github.com/solarissongcontest/solarisstudio/pull/2404) | Full publication, correction/replay, historical version and spoiler-secrecy tests; Signed negative score reaching official output; Frozen Results scope review; Regress merged #2402 with dependent source truth and exact S14 publication flow; do not alter frozen Results writer. |
| **QA-S14** | blocked | QA / Integrator | SYS-ARCHIVE, VOTE-AUTHORITY, RESULT-PUBLICATION | [#2403](https://github.com/solarissongcontest/solarisstudio/pull/2403), [#2404](https://github.com/solarissongcontest/solarisstudio/pull/2404) | Isolated hosted-equivalent local full rehearsal; Failure/retry/concurrency and restoration scenarios; Exact candidate SHA and stage reports; Rehearse full lifecycle once System prerequisites permit; retain genuine failing stage evidence. |
| **QA-S15** | in_progress | QA / Integrator | SYS-S13 | [#2386](https://github.com/solarissongcontest/solarisstudio/pull/2386), [#2337](https://github.com/solarissongcontest/solarisstudio/pull/2337), [#2409](https://github.com/solarissongcontest/solarisstudio/pull/2409) | Complete untruncated exact-SHA S15 registry inventory; No orphaned mandatory capability/command/route; Known legacy cutover accounted for; Integrate independently reviewed complete-inventory guard #2409 only after its exact-head Browser and owner review; rerun producer's complete zero-orphan scan at frozen V3 candidate and resolve actual orphaned capabilities/routes/ownership. |
| **QA-S16** | in_progress | QA / Integrator + System | SYS-S13, VOTE-AUTHORITY | [#2386](https://github.com/solarissongcontest/solarisstudio/pull/2386), [#2404](https://github.com/solarissongcontest/solarisstudio/pull/2404), [#2347](https://github.com/solarissongcontest/solarisstudio/pull/2347), [#2410](https://github.com/solarissongcontest/solarisstudio/pull/2410) | Exact-SHA S16 catalog grants/RLS/RPC/function proof; Legacy and unauthorized second writers removed; Negative browser/direct-write authorization tests; After review and integration of #2410, run independent S16 grant/RLS/RPC/function/trigger/direct-browser-writer proof on the frozen hosted-equivalent local candidate; resolve catalog anomalies and prevent unauthorised second writers. |
| **QA-PR2386** | closed | QA / Integrator | None | [#2386](https://github.com/solarissongcontest/solarisstudio/pull/2386) | Retry isolated Browser audit after external HTTP504; Exact-head Quality and focused security tests; Full review, non-overlap and merge eligibility; No additional #2386 integration action. Rerun the full exact-SHA release acceptance matrix at the eventual frozen candidate; do not infer V3 certification from this PR-local pass. |
| **QA-RELEASE-SHA** | blocked | QA / Release manager | QA-S14, QA-S15, QA-S16, PUBLIC-PARITY, ORG-PARITY, DESIGN-3X, WORLD-SCOPE | None | Quality, Browser, S13–S16 and security at the same SHA; Migration hosted-equivalence and no-egress proof; Signed owner review and recovery checklist; After all real product/System/World gates, freeze exact main SHA; require independent generated full S0-S16/P0-P50/O0-O18/N0-N14 and 22 Navigation/12 directory acceptance dashboard plus S14/S15/S16/security evidence, then obtain distinct human authorizations for hosted migration, production deploy and reopening writes. |

The nine unresolved statuses above are the **current-main source matrix's recorded statuses**, not nine separately replicated live failures. Historic closure of `QA-PR2386` does not certify the current release candidate. Fail closed on missing exact-SHA or hosted-equivalent evidence.

## Conditional blockers: pilot-specific and exclusions not yet verified

| Finding | Owner | Dependency | Pilot requirement / missing exclusion evidence |
| --- | --- | --- | --- |
| **PUBLIC-PARITY** · **PENDING** | Public 2A/2B | SYS-S13, VOTE-AUTHORITY, RESULT-PUBLICATION | Mandatory Confirmation/Entry/Media/Jury/Televote/Results privacy, routes and participant flows remain in scope; optional discovery/fan screens require owner-approved, proven disabled/unreachable exclusions. |
| **ORG-PARITY** · **PENDING** | Organizer / Voting | SYS-S13, VOTE-AUTHORITY | Organizer actions and exact edition/show/actor state used in the one-owner lifecycle remain in scope; unused specialist workspaces cannot be silently declared excluded. |
| **DESIGN-3X** · **PENDING** | Navigation / Public/Organizer | PUBLIC-PARITY, ORG-PARITY | Tested installed PWA safe zones, floating dock clearance, auth/focus and core workflow usability remain required; full three-experience polish requires an explicit excluded-client rollout decision. |
| **WORLD-SCOPE** · **PENDING** | World owner / Release manager | None | World/Governance is a proposed pilot exclusion only; require approved feature flags, route/RPC inaccessibility and no ability to mutate pilot canonical state. |
| **PROD-AUTH** · **PENDING** | Owner / Release manager | QA-RELEASE-SHA, SYS-FRONTIER | No production operation is authorized by this task. If beta runs on any hosted/production surface, each required migration, deploy and write-reopen approval is a separate mandatory gate. |

**Exclusion rule:** no conditional row is excluded yet. Written owner approval, exact-candidate proof that the capability is disabled or unreachable, and proof that it cannot mutate pilot canonical state are required before any exclusion is accepted.

## Tracked V3 debt

No concrete work has been safely classified as *beta non-blocking debt* from this snapshot. Missing capability parity, access control, critical writers, publication safety and hosted migration uncertainty remain blockers or unknowns, not a convenient debt bucket.

## Replaced / superseded work (not release closure)

- **QA-WAVE5-DONORS** · QA/Integrator. Unmerged donor PRs #2408, #2409, #2410 and #2414 were consolidated into merged QA integration PR #2415; this is replaced implementation work, not resolved release safety. Successor: [#2415](https://github.com/solarissongcontest/solarisstudio/pull/2415). The donor PRs are closed/unmerged and the 12 QA paths are in merged #2415; this does not imply S15/S16 safety certification.

## Unknowns and explicitly proposed feature exclusions

- **UNKNOWN-CURRENT-CI** · **QA/Integrator**: No independently verified passing set of exact-current-candidate Quality, isolated Browser, S13/S14/S15/S16, security and full-contest acceptance is supplied by the source matrix.
- **UNKNOWN-HOSTED-EFFECTS** · **System/Supabase**: The 7 November migration-history counts and the 8 November 30-leaf-field #2405 comparison are dated partial observations, not a fresh complete hosted/schema-effect verdict.
- **UNKNOWN-BETA-ACCESS** · **System/Release manager**: Server-enforced one-owner access, isolation from public users, and the exact pilot infrastructure/runtime boundary lack a verified signed-off proof.
- **UNKNOWN-FULL-INVENTORY** · **QA/Integrator + Public/Organizer/System**: The canonical full-V3 matrix declares partial coverage; capability, consequence, route and physical-ownership registry gaps need current source generation and separate safety triage, not arithmetic reuse of old counts.
- **EXC-WORLD-GOVERNANCE** · **World owner/Release manager**: Full institutional GUARD/UNITY/World workflows are outside the proposed one-owner contest test; neither explicit final owner approval nor runtime disable/unreachable and mutation-isolation proof is recorded. **Proposed only, NOT verified disabled/unreachable.**
- **EXC-FAN-EXTRAS** · **Public 2A/2B/Release manager**: Fantasy, Predictions, advanced public analytics, broader archive and optional fan screens may be deferred only after exact rollout and backend safety proof; full V3 requirements remain open. **Proposed only, NOT verified disabled/unreachable.**
- **EXC-UNUSED-CLIENTS** · **Navigation/Release manager**: Full mobile-browser/desktop visual parity is not yet proven excluded from an installed-app-only owner test, nor is their inaccessibility established. **Proposed only, NOT verified disabled/unreachable.**

## Fresh PR observations at the starting main

- [#2415](https://github.com/solarissongcontest/solarisstudio/pull/2415) is closed/merged, its 12 exact QA paths already appear on main. Donors [#2408](https://github.com/solarissongcontest/solarisstudio/pull/2408), [#2409](https://github.com/solarissongcontest/solarisstudio/pull/2409), [#2410](https://github.com/solarissongcontest/solarisstudio/pull/2410), [#2414](https://github.com/solarissongcontest/solarisstudio/pull/2414) are closed/unmerged.
- System recovery [#2393](https://github.com/solarissongcontest/solarisstudio/pull/2393), [#2403](https://github.com/solarissongcontest/solarisstudio/pull/2403), Televote authority [#2404](https://github.com/solarissongcontest/solarisstudio/pull/2404), hosted catalog [#2405](https://github.com/solarissongcontest/solarisstudio/pull/2405) and child [#2417](https://github.com/solarissongcontest/solarisstudio/pull/2417) remain **open drafts** at inspection. The child #2417 targets #2404's branch, not main. Do not count these as integrated.
- The #2405 thirty-leaf-field catalog discrepancy and 7 November migration history counts are historical **scope-limited findings**; fresh authorized read-only effect-level reconciliation and sanitized local rehearsal remain required.
- Owner-only server access scope and the production/local runtime boundary remain unverified. Existing source gates alone cannot establish a GO decision.

## Dependency and evidence protocol

System/Supabase owns hosted-effect inspection, schema and forward-only recovery. Results/Voting owners own canonical vote/result mutation semantics and publication. Public/Organizer owners prove required pilot client and operator flows; Navigation owner proves installed safe areas and dock. QA/Integrator owns isolated S14 rehearsal, S15/S16 single-authority and exact-candidate CI; Owner/Release manager owns beta scope and any separate hosted/deploy/write approvals.

Regenerate this board from the literal checkout with `node scripts/generate-v3-owner-only-beta-risk-board.mjs --candidate-sha "$(git rev-parse HEAD)"`; `--json` produces machine-readable projections. The generator deliberately does not query Supabase or pretend to certify live GitHub Actions. Compare live PR states and complete machine-generated registry/S14/S15/S16 evidence separately for the candidate SHA.

**A07 outcome:** a scoped **NO-GO / evidence-pending** board, not release authorization. Full migration inventory remains open and separate.
