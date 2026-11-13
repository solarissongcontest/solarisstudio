# Solaris Studio V3 — Agent-verifiable evidence and owner-only workflow policy

**Status:** Project-owner-directed implementation and evidence workflow amendment, 11 November 2026. This document changes **who performs evidence collection and how infeasible manual work is handled**. It is not a release certificate, production access authorization, database migration or waiver of integrity checks.

**Purpose:** Solaris Studio's owner has only an iPhone and a restricted school laptop. They must not be asked to install PostgreSQL, run `pg_dump`, operate private database exports, configure a local server, find a separate technical operator or hire an external reviewer as routine prerequisites to continuing V3 development. ChatGPT and connected tools should perform all feasible technical inspection and verification.

## 1. Default operating contract

1. Prefer connected **GitHub** read-only inspection, exact-SHA CI evidence, and connected **Supabase** metadata API tools over owner-operated shell commands, screenshots or copies of secret values.
2. Run build, source contract, catalog-digest comparisons, local PostgreSQL and full-contest tests in explicitly isolated CI/test environments, with production Supabase inaccessible. Fail closed on missing isolation.
3. The owner supplies product decisions and explicit approvals for consequential actions, not engineering labor or credentials. Do not ask for manual exports, secret sharing, a private workstation or a technical reviewer as the default next step.
4. Treat an unavailable verification capability as an **engineering/tooling limitation to resolve or scope explicitly**, not as a reason to repeatedly send the owner to a command line.
5. No source assertion, agent statement, green test on synthetic data or passing digest proves an unobserved production property. Never fabricate evidence, assume absent schema definitions, fabricate role grants or insert synthetic migration-history rows.

## 2. Evidence levels (report every claim at the correct level)

- **DIRECTLY OBSERVED:** current authenticated connector read or repository metadata, timestamped and attributed to the exact project/commit. Example: database engine version, listed table identities, GitHub PR status.
- **REPRODUCED IN ISOLATION:** exact-SHA CI/local disposable tests with a documented fixture, network-isolation proof and artifact links. The evidence is limited to that fixture and tested behavior.
- **SOURCE-INFERRED:** code, migration text, frozen digests or static policy indicate expected behavior, without direct hosted verification.
- **UNKNOWN / NOT VERIFIED:** connectors do not expose needed production catalog semantics, effective role memberships, runtime grants or real migration effects. Do not present these as passing.

A feature can be **implemented** and **locally tested** without being **production-certified**. Keep these dimensions separate in all status and release boards.

## 3. ChatGPT-executable verification inventory

**GitHub:** inspect `main` SHA, PRs, branch/diff, workflow YAML, static contracts, relevant source files, migration sources and exact-head CI. Agents may propose changes in a narrowly scoped draft PR. A GitHub PR review submitted by an authorized distinct reviewer remains separate from an assistant's read-only technical critique.

**Supabase project metadata (read-only connector calls):** verify project identity and PostgreSQL version; enumerate tables and available column/PK/FK metadata for required schemas; inspect migration versions, installed extensions, generated type metadata and built-in security advisors. Avoid reading user, ballot or contest rows; keep output bounded and free of secrets.

**Additional catalog inspection:** if complete grants, routines, triggers, ownership, `SECURITY DEFINER` behavior, role inheritance or full schema definitions are not available through these APIs, mark precisely those claims **UNKNOWN**. A narrowly scoped read-only catalog SQL query requires separate project-owner approval under existing production-SQL rules. Such approval is not implied by this document or by access to a connector. No hosted query loops, browser crawls, CI access or export through chat.

**CI:** preserve local-only guard, exact-SHA checkout, networkless PostgreSQL fixtures, deterministic fail-closed source comparisons, regression tests, full-contest rehearsals and machine-readable negative-case results. If the fixture is synthetic or partial, label it explicitly.

**Production rollout:** before a production deploy or enabling official write workflows, separately prove the critical properties relevant to the specific released scope. If proof cannot be obtained safely with available tooling, redesign the dependency, defer that high-risk capability or explicitly limit the owner-only pilot. Do not weaken voting, authorization, data-integrity or release gates.

## 4. Replace manual-owner instructions in V3 plans

For any V3 plan/runbook/task that states the owner **must** download a tool, run local PostgreSQL, export sensitive schema, provide a connection string, commission a third-party review or carry out a technical rehearsal:

1. Translate the requested proof into a specific observable invariant and classify it by release risk.
2. Try the connected GitHub/Supabase read-only capabilities and CI/local-only tests first.
3. Produce reproducible exact-SHA evidence, recording what was and was not verified.
4. Where only the **method** is inaccessible, replace the manual method with agent-executable means that genuinely establish the same property.
5. If equivalent proof is impossible with current tools, **do not silently relax the property**. Mark it UNKNOWN/BLOCKED for the affected production capability, continue independent tasks, and propose an architecture/rollout change that removes the unsafe dependency.
6. The owner makes explicit scope and high-risk action decisions in chat. No need to repeat previously supplied screenshots, account details or constraints.

This overrides procedural requests for owner-side technical installation and external labor wherever the same proof can be obtained safely by an agent. It does **not** override canonical domain truth, server authorization, financial limits, data privacy, security, production isolation, migration ownership, or exact-SHA release certification.

## 5. Specific S06 decision

S06 currently contains a proposed **operator-only, schema-only PostgreSQL 17.11 export** to prove hosted-equivalent recovery. The owner cannot run that procedure. Therefore:

- **Do not request any more connection strings, passwords, PG17 installation, `pg_dump`, SQL dumps or external operators from the owner.**
- Keep the complete operator export instructions available only as an *optional future high-assurance route*, not a prerequisite for agent-driven investigation or unrelated V3 work.
- Use already-connected Solaris Studio Supabase metadata, bounded frozen-catalog comparisons, source provenance and networkless CI rehearsals to verify every property actually within their reach.
- An incomplete hosted-head fixture is **not** a full equivalent. In particular, names/hash inventories and non-executable placeholder functions cannot prove all real hosted routine bodies, RLS/grants, role inheritance or production upgrade behavior. Record those gaps as UNKNOWN, never as S06 DONE.
- Continue S06's agent-executable work and other safe tracks. Require stronger evidence before **releasing any production mutation/recovery path whose safety depends on the missing hosted-head equivalence**.
- If the goal is an *owner-only beta*, define exactly which read-only or proven locally safe surfaces are included, keep unproven critical writes disabled or unreachable, record the exclusions, verify guards and seek explicit owner approval. A limited beta is **not** fully certified V3.
- A full production-grade database recovery certificate remains unavailable until equivalent evidence exists. This is a limitation of observed evidence, not a task the owner must personally perform.

## 6. Merge and review policy (updated 14 November 2026)

The project owner's current policy is [**evidence-based merges**](merge-review-policy.md). **Independent merge approval from a second ChatGPT session, AI agent or designated integrator is not mandatory.** The currently authorized implementing session may perform documented diff/risk review, verify the applicable exact-SHA CI and isolated behavioral/security tests, and merge its own PR when GitHub's actual rules allow it. No real technical failure may be waived because a second reviewer is unavailable.

A separately performed source audit is useful, and CI provides objective independently executed verification, but neither is an official GitHub `APPROVED` review. Describe self-review as self-review. If branch protection actually requires another approving account, respect that configured gate and report the concrete settings blocker rather than claiming an approval.

High-risk source changes still need appropriate canonical-authority and negative-test evidence. Hosted migrations, production deployments and public official-write activation **still require separate explicit project-owner authorization**, even after source merge. Product-level two-person integrity protections are unaffected. Historical project sources and handoffs demanding "independent merge approval" are superseded on merge process alone.

## 7. Production and secret safety

- Do not send raw dumps, function bodies, private logs, credentials or connection strings into chat, GitHub, Actions or PR comments.
- Never use hosted production Supabase from automated CI, Playwright, screenshot/browser audits, migration rehearsal, preview or repeated QA. Keep the established egress safeguards.
- Source changes, draft PRs and isolated tests are not authorization for hosted SQL, migration, Worker deployment, production flag flips or public voting.
- Cloudflare's currently observed `wrangler versions upload` behavior only addresses that build path: audit any other possible deploy workflow before approving an integration.
- Real user votes, submissions, releases, and account permissions require server-side, independently verifiable integrity, not a substitute written declaration.

## 8. Agent handoff format

For each blocker provide: **requirement**, **why it matters**, **exact GitHub SHA/production metadata timestamp**, **evidence level**, **agent-executable steps completed**, **remaining unproven property**, **affected release surface**, **next tool-accessible action**, and **whether an explicit owner decision is needed**.

The default answer to an inaccessible manual procedure is **automate the valid proof or narrow the affected scope**, not `install PostgreSQL` and not `pretend the test passed`.
