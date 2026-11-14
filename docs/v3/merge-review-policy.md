# Solaris Studio V3 — Evidence-based merge and review policy

**Effective:** 14 November 2026. **Authority:** Explicit project-owner instruction. **Scope:** All Solaris Studio V3/TerraOS development sessions, Codex, repository guidance, PR triage, checklist/coordination queues and future agent prompts.

This is the current operational interpretation of merge/review requirements. It **supersedes older instructions that require a separate ChatGPT session, independent AI reviewer, designated second agent, or exclusive human/AI integrator to approve every source-code merge**. Do not resurrect those requirements from historical PRs, issue comments, checklists, handoffs, or older project-source documents. Historical evidence remains historical; do not rewrite old approvals or assertions.

## 1. Core rule: verified work may merge in its implementing session

- **An independently conducted human/AI review is NOT a universal prerequisite to merging.** An implementing session may inspect its own diff, verify the relevant evidence, resolve conflicts and merge its own task's PR **when authorized to operate on the repo**, the task is in scope and all applicable technical checks and GitHub rules pass.
- The person or agent performing the merge is the **integration function**, not necessarily a different session. No handoff, invented reviewer, "independent merge approval", fake second opinion, or second chat is needed solely to satisfy process.
- A separate reviewer is welcome when actually available and useful, particularly for sensitive architecture, but absence of a second session **alone** must never mark a safe, verifiable task BLOCKED.
- Do not claim an `APPROVED` GitHub review, independent review, separate approval, or passing check unless that action/evidence genuinely exists. Self-review is **self-review**.
- This rule does **not** bypass GitHub branch protection or an actual required-review rule. If GitHub requires another account's approval, report the exact configured block and request an authorized **repository-settings decision**, rather than manufacturing an approval or bypassing rules.

## 2. Evidence-based merge tiers

| Risk tier | Examples | Merge acceptance |
| --- | --- | --- |
| Routine | documentation, wording, styling, bounded UI bug fixes | Confirm current main/head, inspect changed paths and diff, run directly relevant checks, avoid conflicts, record evidence. No second reviewer. |
| Standard | new or changed noncritical features, component/data-read integration | All routine checks plus focused behavioral/regression tests, applicable exact-head CI, safe integration into current main, and no undisclosed dependency or incomplete required workflow. No second reviewer. |
| High-risk source | identity/auth, permissions, RLS/RPC, critical contest state, Confirmation, Entry, Jury, Televote, Results, publication, Archive, migration candidates | Explicit canonical owner/scope, server/database authority checks as applicable, negative security and role tests, idempotency/concurrency/recovery evidence, isolated local rehearsals, and all applicable exact-head CI. A distinct ChatGPT review is **not** the evidence; unresolved integrity defects still BLOCK merge. |
| Production operation | hosted migration, production deploy, maintenance/rollout change, enabling public/official writes, secrets or other consequential live changes | **Separate explicit project-owner authorization for each production operation**, together with the relevant verified preflight, recovery and release gates. A merge is **never** production authorization. |

Risk is determined by actual changed behavior and source paths, not whether a PR author calls it "safe" or "docs-only." A source PR may merge while its unapproved production effect remains gated/disabled, only if the merge leaves main safe and deployable under the existing release model.

## 3. Single active mutation and integration coordination

- The project can use one active implementation session and one canonical checklist queue (#574; overflow evidence #2464). **That same currently authorized session may complete the task's review and merge**, acting as integrator; a separately staffed QA/Integrator session is optional, not a dependency.
- Keep task claim, path ownership, dependencies, collision detection, current-main freshness, expected PR head SHA, and evidence handoff. Do **not** start concurrent conflicting mutators or rewrite pushed Lovable-connected history.
- A shared-file or cross-domain conflict must be resolved with the canonical owner and current code evidence. Domain boundaries and System ownership of schema/migration authority do not disappear.
- An old PR, owner checklist, or issue comment that says "needs independent merge approval" is to be read as "needs the applicable evidence-based checks above", unless it describes a genuine GitHub review setting or a separate high-risk production decision.
- Other genuinely risky operations that require two-person *product* authorization (such as protected integrity-case identity reveal or critical contest governance) are **not merge-approval bureaucracy** and are unaffected.

## 4. Hard guards that remain non-negotiable

1. Verify the **exact candidate SHA** and required Quality, Browser, bundle, security, S13/S14/S15/S16, release/freshness and other domain gates as applicable. A green older SHA is not a current pass.
2. **Never** connect automated CI/Playwright/browser audits/migration rehearsals to hosted production Supabase; use isolated local/disposable infrastructure, and fail closed if unavailable.
3. Preserve canonical server/database mutation authority, RLS, vote secrecy, official Results integrity, publication gating, idempotency, receipts, account/edition isolation, migrations and recovery proofs.
4. Preserve source ownership, one active writer and no unsafe duplicate implementation, silent skipped test, conflict, or history rewrite.
5. Source merge, owner-only beta certification, **hosted database migration**, **production deployment**, and **public write activation** are distinct decisions. Do not treat one as permission for another.

## 5. Completion and blocker labels

- **DONE:** verified integration on current main (or equivalent already present) with relevant evidence and required checks.
- **PARTIAL:** implementation/PR exists but applicable integration or verification is incomplete.
- **BLOCKED:** a *real* safety failure, missing required technical proof, unresolved ownership/conflict, failing applicable GitHub check, actual branch protection, or required production authorization.
- **NOT BLOCKED:** no independent ChatGPT session is available, no arbitrary "independent merge approval" comment exists, or a designated QA agent has not separately re-read an otherwise proven routine/standard PR.

Record task/PR, starting and final main SHA, expected PR head SHA, changed paths, test and workflow results, isolation evidence where relevant, unresolved risks, and whether merge vs production approval has occurred. If GitHub's enforced settings cannot be inspected, say so; do not assume either the presence or absence of required reviews.

## 6. Precedence and adoption

This owner-directed rule governs **merge process**, not product capabilities or sensitive-domain safety. It overrides older conflicting *procedural* language in project documents, GitHub issues/PR templates, queued instructions and agent handoffs. Keep original canonical V3 product, design and system requirements intact. Keep issue #574 as the single task/integration coordination source and #2464 only as its overflow evidence log. Update their *operative* instructions to align with this policy; never retroactively change historical records.

If a future request genuinely requires a distinct reviewer for a particular consequential action, it must name that action, the actual safety or configured GitHub basis, and the concrete way the requirement can be fulfilled. Do not invent an impossible second session as the default.
