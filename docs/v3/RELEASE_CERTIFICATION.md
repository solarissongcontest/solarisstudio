# Solaris Studio V3 — Release Certification Ledger

**Status: NO-GO.** This is the single integration-ledger snapshot, not a certificate of deployment or production adoption.

**Candidate main SHA at ledger creation:** `3accae3f76f1a250327903fc07af9b7cd6cd011e` (14 November 2026 UTC). A later main commit invalidates this candidate's evidence until its own exact-head checks complete. Update this record before any GO decision.

## Evidence by gate

| Gate | Status at candidate | Evidence and missing condition |
| --- | --- | --- |
| Source integration | PARTIAL | [#2482](https://github.com/solarissongcontest/solarisstudio/pull/2482) ordered S13→Archive→S07 merged; [#2485](https://github.com/solarissongcontest/solarisstudio/pull/2485) Public/Organizer 37-test contract gate merged; [#2489](https://github.com/solarissongcontest/solarisstudio/pull/2489) persistent S14 acceptance merged; [#2491](https://github.com/solarissongcontest/solarisstudio/pull/2491) main-push stateful rerun merged. Other release-critical PRs remain open/draft. |
| PR-head contract CI | PASS, not final-main certification | #2485 exact head `b86c30bdc1ea77ad731369220bad263056a8e3fa`: 7 suites, 37 tests. |
| Stateful 66-country contest | PASS at PR head, final main pending | #2489 exact head `d9c450ad245c6fa75aa5e689e7f6e07ff4dd3e5f`: [GitHub Actions job](https://github.com/solarissongcontest/solarisstudio/actions/runs/43518817064/job/132207565436) PASS. Ten persistent stages, four Grand Final extensions, nine invariants, eight failure injections, non-skipped Grand Final Playwright summaries, archived state and SHA/database fingerprint required. #2491 exact-head rerun also PASS; main-push run must pass separately. |
| PostgreSQL runtime equivalence | PARTIAL | S14 local Supabase used PostgreSQL **17.6** (verified from CI log). Separate ordered recovery CI uses PostgreSQL **17.11**. Full application lifecycle has **not** been certified against 17.11. |
| Hosted migrations and Preview | FAIL / BLOCKED | Main's Supabase Preview reports `Remote migration versions not found in local migrations directory.` Do not repair remote migration history without System owner authorization and reconciliation. |
| Atomic Results and public snapshot | BLOCKED | Codex/System-owned recovery candidates remain separate from the merged S07 ordered rehearsal. Hosted production equivalence, atomic calculation and immutable public snapshot certification outstanding. |
| S16 security | BLOCKED | Release-critical scanner findings and canonical authority grants require disposition. Draft [#2487](https://github.com/solarissongcontest/solarisstudio/pull/2487) has Quality failure (TS1005 in new test and old legacy Jury contract), independently identified in [review comment](https://github.com/solarissongcontest/solarisstudio/pull/2487#issuecomment-6866584195). |
| Public / Organizer | PARTIAL | Contract suites and representative browser audit passed at PR head. Complete authenticated edition-scoped flows and authorization boundary matrix not independently certified for final main. |
| Mobile / PWA | PARTIAL | Representative Browser Audit includes installed-app coverage; exhaustive mobile, deep-link, account-switch and deferred-route matrix not complete as one release-grade artifact. |
| Production safety and operations | BLOCKED | No production SQL, live votes, migration adoption, deployment or activation authorized. Require backup/restore proof, rollback procedure, monitoring/incident plan, scoped operation approvals and final exact-SHA GO sign-off. |
| Independent reviews | NOT CERTIFIED | GitHub main branch protection was observed disabled; #2482/#2485/#2489/#2491 had no submitted human review at inspection. Absence of an enforced review is not evidence of independent human approval. |

## Release decision rule

**GO only when every mandatory gate is independently verified at the same final main SHA**, with actual CI logs and artifacts linked, all blocking security/hosted compatibility issues resolved, production procedures approved, and the owner explicitly authorizing each high-impact operation.

A green PR check never certifies a later main SHA. A synthetic local pass never certifies hosted migration adoption. A source-level permission check never substitutes for a runtime API-role denial.

## Continuation ownership

- **Integration lead:** exact-main CI, Public/Organizer/Mobile E2E, release evidence, PR review/merge eligibility, cross-system regression.
- **System / Results / S16 owner:** canonical Results recovery, production catalog and migration reconciliation, database authority, S16 remediation and separate operational approvals.
- **Owner:** production adoption/deployment/activation authorization and final release decision.

Update the candidate SHA, per-gate results and source links whenever main advances. Do not change NO-GO to GO without the complete evidence set.
