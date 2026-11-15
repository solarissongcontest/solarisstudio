# Solaris Studio V3 — Release certification ledger

**Status: NO-GO for official public release.** Source integration is not hosted migration, production deployment, voting activation or final contest certification. This record is not authority to perform those operations.

**Historical source snapshot:** `ef92563a40d586a859949c329ff6e7e2c5efdbbe` (observed earlier on 15 November 2026 Finland time). **This SHA was NOT officially release-certified.** This document is a source-only evidence update proposed in PR #2498; any subsequent main advancement requires independent exact-SHA evidence.

## 0. Current Nov 15 exact-main and independently verified hosted authority frontier

**Latest source-integrated `main` observed before this ledger-only merge:** `baca3f9d34d7ae59281d738711e465df8718f029`. [#2523](https://github.com/solarissongcontest/solarisstudio/pull/2523) merged fail-closed V3 rollout validation as `6675f5cc28632d5099b76b7427f8fb4c3d0cd472`, and [#2524](https://github.com/solarissongcontest/solarisstudio/pull/2524) merged three-experience navigation as `baca3f9d34d7ae59281d738711e465df8718f029`. Both PRs passed all eight applicable exact-head workflows before merge, including Quality, Browser Audit, stateful acceptance, S13, S15, integration, budget and main-freshness. A successful PR-head run does **not** independently certify the newer main or the production database. Source rollout validation is not the server-side three-tier PUBLIC/TESTING/HIDDEN feature boundary; full mobile physical acceptance remains open.

**Earlier independently fetched `main` before the #2523/#2524 source merges:** `cc8fa522053f1dc16d2f52d77edb6285c8c7a3a6`. It contains [#2521 Results operation-engine/CAS recovery](https://github.com/solarissongcontest/solarisstudio/pull/2521), merged as `637c0ed424c7f86281fb774954be935eed300f01`, and [#2522 Jury table-authority retirement](https://github.com/solarissongcontest/solarisstudio/pull/2522), merged as `cc8fa522053f1dc16d2f52d77edb6285c8c7a3a6`. These source merges **have not installed their effects in production**.

On the exact `cc8fa5...` main, eight completed GitHub Actions workflow runs were checked: Quality, Browser Audit, V3 Public/Organizer integration contracts, S13 Migration Adoption, S14 Archive forward-effects local proof, V3 stateful release acceptance, S02 isolated baseline and PR Main Freshness. All eight reported successful **workflow execution**; none is a complete S16 zero-unsafe-writer certificate or authorized production adoption result. Main is **not** an officially certified candidate.

**Bounded production read-only PostgreSQL catalog, independently observed 15 Nov 2026:** connected Supabase account `Primary` returned canonical project `dkxmnvekiopyesuzggeu` ("Solaris Studio") at PostgreSQL 17.11, ACTIVE_HEALTHY. Three restricted catalog SELECTs inspected selected object identities, RLS/grants and `SECURITY DEFINER` metadata. They did not query contest data, invoke application RPCs, or change database state.

| Checked current hosted effect | Read-only outcome |
| --- | --- |
| Five canonical private S13 foundation tables | All five **absent** |
| Seven S13 registration/compatibility public RPC names | All seven **absent** |
| Governed `public.v3_submit_confirmation` and `public.studio2_apply_confirmation_round_change` | Both **present** |
| Results `public.studio2_execute_result_operation_v2` | **Absent** |
| Selected private S07/S08 source/projection/context structures and Televote source-management guard | **Absent** |
| Canonical `public.jury_votes`, `public.results`, `public.televote_votes` tables | Present with RLS enabled and effective SQL write privileges for `anon`, `authenticated` and `service_role`; policy/trigger conditions need effective assessment |
| Direct `authenticated` EXECUTE on `public.submit_country_jury_ballot`, `public.admin_update_confirmation_controls`, `public.admin_confirmation_delete_response` | Present, despite source-level internal-writer retirement plans; SECURITY DEFINER internals need exact signature and authorization review |
| `public.submit_confirmation` legacy helper | Direct API-role EXECUTE denied in selected catalog |
| `televoting.submit_vote_checked` | Present; `anon` and `authenticated` have EXECUTE, requiring normal canonical eligibility controls |

**Caution:** An EXECUTE or DML grant is not alone proof of a bypass; PostgreSQL RLS policies, function-body guards and triggers can deny actual operations. A further bounded, read-only catalog inspection established that the selected hosted Jury/Televote/Results tables have enabled `studio2_platform_direct_write_guard` statement triggers and capability-scoped authenticated DML policies; Confirmation rounds/submissions also have named mutation guards. This is meaningful existing defense, not proof that raw role grants are exploitable. The newer S08 source-managed projection guard remains absent, and internal SECURITY DEFINER functions and special actor grants still require local negative execution tests. The selected live `private.studio2_guard_direct_client_write()` definition was additionally inspected read-only: it guards operational modes and privileged recovery context, but does **not** require a canonical mutation operation in normal/degraded mode. With existing capability-based authenticated RLS write policies, this leaves a potential competing direct DML writer for actors who possess the relevant manage/verify capability. No actual mutation was attempted, and other triggers may constrain particular rows/operations. Classify the unresolved authority path as S16 release-critical pending System-owned recovery and isolated negative tests. The selected catalog proves a production **authority reconciliation requirement**, not successful unauthorized mutation. No destructive/positive RPC experiments or synthetic traffic were directed at production.

The subsequent nonproduction source fixes [#2523](https://github.com/solarissongcontest/solarisstudio/pull/2523) (fail-closed shell rollout policy) and [#2524](https://github.com/solarissongcontest/solarisstudio/pull/2524) (PWA/browser/desktop navigation split) are **now merged source**, after exact-head tests, but do not solve production database gaps, server-enforced soft-launch feature gating or physical-device acceptance.

**Current release decision: NO-GO.** The highest-leverage mandatory dependency is System-owned forward-only S13 → S14/Archive → S07/S08 Televote → Jury/Results/Publication qualification against a disposable hosted-observed-equivalent PostgreSQL baseline, including effective privileges, local restore and complete S14/S16 verification. The production recovery order needs operator-specific backup/PITR evidence, pre/postconditions and **separate owner approval** before any hosted DDL. Do not add migration-history aliases or use hosted Supabase as a test fallback. No hosted migration, active Worker traffic change or public-write enablement was performed.

The remainder of this ledger is retained as **historical 15 November integration evidence**, not silently upgraded to certify the newer main or pending PR heads.

## 1. Historical source integration record

| PR | Domain | Exact PR head tested | Main merge SHA | Source integration |
| --- | --- | --- | --- | --- |
| [#2496](https://github.com/solarissongcontest/solarisstudio/pull/2496) | Me identity/privacy isolation, scoped private cache eviction | `b90a5bf8e51a395d4d9f8951fe6d8395c7f65343` | `5c247f83f35a53a6e08c85c2e6b2590faf8051a0` | MERGED |
| [#2518](https://github.com/solarissongcontest/solarisstudio/pull/2518) | S08 ordered local Televote recovery and guarded writer tests | `c220db7dc1dbf9696ba67a9974d27feb855ae79e` | `45c114700a25bfca118556a82113fe4d2ea0dfcc` | MERGED |
| [#2497](https://github.com/solarissongcontest/solarisstudio/pull/2497) | Home requiredness/anonymous task truthfulness | `0949503c020d0cbf1239b2f600b93889b8174606` | `cda84286b025d2f0629faf73a01d7763f5a9fcf0` | MERGED |
| [#2516](https://github.com/solarissongcontest/solarisstudio/pull/2516) | Push-dispatch pre-Vault authentication hardening | `1efbec3e57e9adb2cea65329c4efdec1913836b4` | `ef92563a40d586a859949c329ff6e7e2c5efdbbe` | MERGED |

Exact-head checks were reviewed per applicable workflow: #2496, #2497 and #2516 passed the stateful 66-country acceptance; #2518 instead passed its dedicated local S14 recovered-state workflow. The relevant PR heads also passed Quality, isolated Browser Audit, S13 adoption, S15 owner/cutover evidence, bundle and current-main freshness; Public/Organizer integration passed where triggered. After the real Vault-only caveat was identified, PR #2516 changed to a **mandatory private Edge environment secret**, gained regression tests for missing Edge secret and arbitrary nonempty header, was refreshed onto current main, and passed all eight applicable checks at its final exact head before merge.

**Security deployment prerequisite:** before any *separately authorized* Supabase Edge Function deployment, verify `SOLARIS_PUSH_DISPATCH_SECRET` is a private Edge secret and matches the server-only scheduled Cloudflare caller. The newly merged source intentionally returns 503 without that configuration. Vault-only dispatch authentication is no longer compatible. No runtime secret configuration, Edge deployment or live smoke was performed as part of source integration.

No branch protection was bypassed; the normal GitHub merge API was used with an expected exact head. GitHub branch protection read returned 403, so do not assert independent administrative ruleset verification or independent review approvals. Failed Codex review attempts were quota errors, not completed code reviews.

## 2. Cloudflare source-merge boundary

**Owner-observed 14 November 2026 ~23:30 EET, authoritative for the captured setting:**
- Workers Builds production branch: `main`; Builds enabled.
- Build command: `bun install && bun run build`.
- Deploy command: `npx wrangler versions upload`.
- Root: `/`.
- At capture, 100% active production traffic received version beginning `35bf6d2e`.
- Separately uploaded `8bf204bd-fade-4e3f-ad06-d2bfc1f869a3` was not active.

The narrow source safety check covered the repository package scripts, Worker config, GitHub workflow set and explicit `wrangler deploy`, `wrangler versions deploy`, `wrangler versions rollout`, and production-publishing paths. **No additional automatic active Worker rollout path was identified in those repository surfaces.** This does not establish that no out-of-repository deployment actor exists.

**GitHub Cloudflare check evidence for successful source-build uploads:**
- #2496 main `5c247f8`: Worker version `2f4a5097-7465-46e4-a9a4-58200a381f53`.
- #2518 main `45c1147`: Worker version `86e7f8ca-05bd-4ac6-a48d-fa72b9cae1ba`.
- #2497 main `cda8428`: Worker version `511c2cce-45bb-4bd7-a773-d7285a889f9c`.
- #2516 main `ef92563`: post-merge Cloudflare build started; successful upload/version not yet independently recorded at this snapshot.

These are **Worker version upload** results, not deployment promotions. GitHub does not expose the Cloudflare active-production traffic split. **Postmerge active deployment unchanged: NOT VERIFIED.** No production promotion was invoked in this session. Do not infer from an uploaded version or preview alias that live traffic changed.

## 3. Database recovery, S13/S14 and Televote

The merged #2518 exact-head [PG17.11 local recovery workflow](https://github.com/solarissongcontest/solarisstudio/actions/runs/43640967222) succeeded for both the networkless recovered-observed fixture and the independent full-chain local job. It exercises:

- S13 → Archive → S07 → atomic calculation/Results → S08 installation order.
- Interrupted transactional S08 application and safe restart.
- Explicit duplicate-install refusal (not replay-idempotency).
- Actual role switches rejecting Televote direct INSERT, UPDATE and DELETE by `anon`, `authenticated` and `service_role`.
- Non-superuser recovery operator.
- Source/projection consistency, legitimate Results read/publication protection, historical snapshot preservation.
- Synthetic `pg_dump/pg_restore` and post-restore guards/ACLs.

**Important evidence limit:** the hosted-observed reconstructed fixture covers 215/215 observed table identities but only 199/727 observed function identities; table identity is not full schema/function/role/data equivalence. The restore involved synthetic local records, not a real hosted backup. Combined Televote recovery deferral remains explicit. The historical hosted frontier was 504 source migration files / 497 hosted migration records, 36 missing-history versions before tip, 42 newer source versions after tip `20261101181812`; those counts are not refreshed or adopted here.

The connected Supabase project metadata call was attempted read-only and returned **permission denied** on both available connections. Accordingly, **S13 foundations, governed Confirmation RPC/grants, S07 source effects, S08 guard adoption, and historical Results compatibility in hosted production remain UNVERIFIED**. Absence from migration history alone is not evidence of missing effects. Do not blindly replay migrations or synthesize migration-history records.

## 4. Required candidate-level release gates

| Gate | Evidence for exact integrated main `ef92563a40d5` | Release decision |
| --- | --- | --- |
| Source PR merges and per-PR exact-head CI | Four merged; PR head checks passed | SOURCE INTEGRATED; not production deployed |
| Postmerge Quality, Browser, bundle and type | Main checks initiated after #2516 merge; complete exact-main fan-in not established at this snapshot | NOT CERTIFIED |
| S13 migration adoption / S14 recovery | Local recovered-state evidence on #2518 PR head; hosted effect reconciliation and exact candidate-wide recovery not established | BLOCKED for hosted adoption |
| S15 ownership | Applicable PR-head tests passed; latest integrated-main certification needs independent extraction | NOT CERTIFIED |
| S16 actual mutation authority | Missing complete exact-main grants, RLS, SECURITY DEFINER, trigger and service-writer runtime proof; no zero-unsafe-writer certificate | HARD BLOCKER |
| Confirmation / Entry / Media / Jury / Televote / Results / publication / Archive | Source tests and some local rehearsals exist; no single complete full-contest clean+recovered lifecycle certificate for this exact main | HARD BLOCKER |
| Supabase Preview | Previous integrated main check reported failure; never interpret skipped/pending as successful schema adoption | BLOCKED |
| Historical official votes/Results and concurrency | Partial synthetic recovered-state checks passed, not full hosted reconciliation | NOT CERTIFIED |
| Protected production backup and rollback | Synthetic local restore only; real protected backup restore not verified | HARD BLOCKER |
| Installed iPhone PWA / ordinary mobile browser / desktop | No exact-integrated-main physical and product acceptance recorded | NOT CERTIFIED |
| Active Cloudflare production traffic | Owner baseline verified before merges, postmerge active deployment not independently accessible | NOT VERIFIED |
| Production migration, active deployment and public-write activation | Separate owner approvals not present | NOT AUTHORIZED |

## 5. Scope and final decision

**Release decision: NO-GO.** This document records successful source integration but expressly does not certify official contest operation, hosted production schema compatibility, live voting, production deployment, maintenance exit or publication.

**Next actual engineering dependency:** obtain a precise, read-only hosted schema-effect/privilege frontier through an authorized connector or other properly approved bounded inspection; reconcile S13 and S07/S08 canonical authority against the System-owned forward-only recovery chain; reproduce and certify clean-plus-recovered full contest S14 and S16 against the same exact main. Preserve production egress isolation throughout. An unavailable local database or connector must fail closed, never fall back to the hosted Supabase project.

Any final release SHA change, including a later documentation-only merge, invalidates blanket exact-SHA certification claims. Regenerate the complete fan-in rather than relabeling this snapshot.

*Updated as an integration evidence candidate in PR #2498; no production operations were executed.*
