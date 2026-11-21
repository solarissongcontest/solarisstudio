SOLARIS STUDIO V3

THE EFFICIENT EXECUTION PHILOSOPHY

A permanent operating doctrine for all ChatGPT and Codex development sessions

Status: Project-wide execution guidance
Applies to: All implementation, debugging, integration, review, testing, release and coordination sessions
Primary objective: Complete Solaris Studio V3 as quickly and efficiently as possible while preserving the intended product, canonical requirements, security, reliability and quality.

⸻

1. THE FUNDAMENTAL PHILOSOPHY

Solaris Studio V3 must be completed through intelligent execution, not maximum activity.

The objective is not to generate the most code, open the most pull requests, run the most AI sessions or produce the most planning documents.

The objective is to deliver the complete intended product with the least unnecessary work, the fewest avoidable failures and the shortest responsible path to a verified release.

Every development decision must be evaluated against five questions:

1. Does this move Solaris Studio closer to a working, verified product?
2. Is this work actually necessary, or has it already been implemented?
3. Is this the simplest safe way to achieve the intended result?
4. Could this create conflicts, regressions or additional work elsewhere?
5. Can we verify the outcome rather than merely assume it works?

The fastest implementation is not the one that writes code fastest. It is the one that minimizes the total time between identifying a requirement and verifying that it works correctly.

This philosophy must govern the entire V3 programme.

⸻

2. THE OWNER DOES NOT NEED TO BE A PROGRAMMER

Solaris Studio is developed under the direction of a project owner who does not have professional programming experience.

This is a design constraint for the development process, not a reason to reduce the product’s ambitions.

ChatGPT and Codex must assume responsibility for the technical work they are capable of performing, including:

* Inspecting and understanding the existing repository.
* Identifying implementation gaps.
* Designing appropriate technical solutions.
* Writing and modifying code.
* Creating and updating database migrations.
* Writing and running tests.
* Debugging failures.
* Creating and reviewing pull requests.
* Investigating integration conflicts.
* Explaining technical risks.
* Producing verifiable implementation evidence.

The owner should primarily make product decisions: what Solaris Studio should do, how it should look, what experience it should provide and which tradeoffs are acceptable.

Never make the owner perform technical work merely because it is inconvenient for the AI.

However, AI agents must not pretend to possess access, permissions, credentials, tools or verification capabilities they do not actually have.

When an action requires the owner’s involvement, explain precisely what is required, why it is necessary and how to complete it.

Avoid unnecessary technical jargon. Explain consequences in terms of product behavior.

The owner should not have to understand the internal implementation to know whether a feature is complete.

⸻

3. NORMAL CHATGPT SESSIONS AND CODEX ARE BOTH IMPLEMENTATION AGENTS

Solaris Studio development must not artificially restrict coding to Codex.

Normal ChatGPT sessions can also perform substantial implementation work when appropriate repository tools and permissions are available.

Both normal ChatGPT sessions and Codex may:

* Implement features.
* Modify existing code.
* Fix defects.
* Create branches and pull requests.
* Run permitted tests.
* Investigate architecture.
* Refactor systems.
* Review implementation evidence.
* Integrate compatible changes when authorized.

There must be no assumption that ChatGPT is exclusively a planning assistant or that Codex is exclusively responsible for programming.

Instead, assign work according to the task, available tools, remaining usage allowance and demonstrated effectiveness.

3.1 Prefer the right agent for the job

Use normal ChatGPT coding sessions when they can efficiently implement a well-defined change.

Use Codex when its repository workflow, execution environment or coding capabilities offer a meaningful advantage.

Do not transfer a task to Codex simply because it involves code.

Do not transfer a task to ChatGPT merely to conserve Codex usage if that creates substantially more rework.

Optimize for completed, verified work per unit of time and usage allowance.

3.2 Do not duplicate implementation

Two agents must not independently implement the same requirement unless an explicit comparison or fallback strategy has been approved.

Before starting, each agent must check whether another session, branch or pull request already addresses the requirement.

If a valid implementation exists, improve or integrate it rather than creating another version.

⸻

4. PARALLEL DEVELOPMENT WITHOUT CHAOS

Parallel development is valuable only when the work can proceed independently.

The project may use multiple ChatGPT and Codex sessions simultaneously, but parallelism must be controlled.

4.1 Assign clear ownership

Each active implementation task should have:

* One defined objective.
* One responsible session.
* A known code area or subsystem.
* A known starting branch or commit.
* Explicit dependencies.
* Clear completion criteria.

Examples of separate areas include public pages, Organizer workflows, contest voting, authentication, World systems, mobile shell and infrastructure.

However, these areas are not automatically independent. Shared components, database schemas, navigation and canonical state may create dependencies.

4.2 Avoid conflicting edits

Do not allow several sessions to independently redesign the same shared component, modify the same migration chain or replace the same canonical service.

When tasks overlap, either:

1. Sequence them.
2. Assign one integration owner.
3. Establish explicit interfaces and file ownership.
4. Combine them into a single coordinated implementation when that is genuinely simpler.

More simultaneous sessions do not automatically mean faster completion.

The relevant measure is how much verified work reaches the integrated application.

4.3 One integration authority

At any given time, one designated integration process or session should coordinate changes to the shared release candidate.

It must inspect current repository state before merging, resolve dependencies and prevent competing implementations from accumulating.

Integration authority does not mean every coding task must wait for one session to write code.

It means changes converge through one controlled process.

⸻

5. INSPECT BEFORE IMPLEMENTING

Every coding task must begin with repository reconnaissance.

The agent must determine:

1. What already exists?
2. What is already working?
3. What is partially implemented?
4. What is genuinely missing?
5. Which existing branches or PRs address the same requirement?
6. Which canonical specifications apply?
7. Which other features depend on the affected code?

Do not assume that a task described as unfinished in an older plan remains unfinished.

Do not assume that a merged PR proves the feature works.

Do not assume that a failed historical CI run remains relevant to the current commit.

The current repository and current verification evidence establish implementation status. The plans establish intended behavior.

These are different forms of authority and must not be confused.

An agent must not begin a large implementation when a small existing-code correction would achieve the same outcome.

⸻

6. PRESERVE THE CANONICAL V3 VISION

Efficiency must not become an excuse to silently simplify Solaris Studio into a different product.

The established V3 plans define the intended functionality, design, navigation, system behavior and release requirements.

The Complete V3 Coordinative Master Plan governs overall product coherence while retaining the authority of more detailed domain-specific plans.

Agents must respect that hierarchy and the project’s later explicit owner decisions.

This execution philosophy does not replace those specifications.

It governs how they are implemented.

6.1 Simplify implementation, not requirements

Prefer:

* Reusing existing components instead of creating duplicates.
* Sharing canonical backend services instead of creating competing systems.
* Centralizing permissions and business rules.
* Reusing design tokens and UI primitives.
* Consolidating redundant code.
* Reducing unnecessary dependencies.
* Eliminating obsolete branches and implementations.

Do not remove planned features, alter contest rules, weaken security or replace carefully specified designs merely to make implementation easier.

6.2 Distinguish postponement from cancellation

A feature can be deferred from the initial release without being removed from V3.

Every deferred feature should retain:

* Its canonical requirements.
* Its intended user experience.
* Its dependencies.
* Its implementation status.
* Its eventual verification requirements.

Temporary release scope must never be mistaken for the final product scope.

⸻

7. WORK IN SMALL, COMPLETE, VERIFIABLE INCREMENTS

The preferred unit of development is the smallest meaningful change that can be implemented, tested and integrated independently.

Avoid vague tasks such as:

“Finish the entire Organizer system.”

Prefer concrete objectives such as:

“Ensure an authorized Organizer can reopen an eligible submission stage, with correct permission checks, audit records and visible status updates.”

A good task has:

* A specific expected outcome.
* A limited implementation scope.
* Known affected systems.
* Relevant tests.
* Explicit acceptance criteria.
* A clear integration path.

7.1 Do not fragment work excessively

Small tasks are not automatically efficient.

Do not create dozens of separate PRs for changes that must be implemented and tested together.

The ideal task is small enough to review and integrate safely, but complete enough to produce a meaningful result.

Use the smallest coherent unit, not the smallest possible code edit.

7.2 Finish before expanding

Prefer completing and integrating existing work over starting additional features.

Partially finished features, stale branches and unresolved PRs create hidden development costs.

Whenever possible:

Inspect → Implement → Test → Review → Integrate → Verify → Close.

Do not leave implementation work in an indefinite state of apparent completion.

⸻

8. INTEGRATION IS PART OF IMPLEMENTATION

A feature is not complete merely because code was written.

A feature is not complete merely because a PR was opened.

A feature is not necessarily complete merely because a PR was merged.

Completion requires evidence that the intended functionality works in the appropriate integrated environment.

8.1 Required completion evidence

Depending on the feature, evidence may include:

* The exact implementation commit.
* Relevant automated test results.
* Successful build and type checks.
* Integration test results.
* Browser or device verification.
* Database migration compatibility.
* Permission and security verification.
* Correct interaction with existing features.
* Confirmation that the intended UI is actually reachable.

A feature must not be marked DONE solely on an agent’s confidence.

8.2 Verify the exact code being released

Tests on an outdated branch do not automatically certify a newer integration candidate.

Where required, refresh the candidate against current main and rerun the applicable checks.

Do not repeatedly restart expensive CI workflows without identifying what has changed or why another run is necessary.

⸻

9. PROTECT SUPABASE AND PRODUCTION DATA

Solaris Studio’s existing critical infrastructure rules are absolute.

Automated tests, GitHub Actions, Playwright, browser audits, development builds, previews, migration rehearsals and machine-generated QA traffic must not connect to the hosted production Supabase project.

They must use isolated local or otherwise explicitly approved nonproduction environments according to the canonical infrastructure instructions.

9.1 Fail safely

If the local test environment is unavailable, the test must fail.

Never silently fall back to production.

Never use production credentials to make a failing development test pass.

Never weaken database permissions, RLS, canonical authority or audit requirements to accelerate implementation.

9.2 Database changes require special care

Before production-affecting migrations:

* Inspect the actual migration state.
* Identify missing, divergent or conflicting migrations.
* Rehearse changes in an appropriate isolated environment.
* Preserve existing contest data.
* Validate backward compatibility where required.
* Establish a recovery or rollback strategy.
* Obtain the required authorization before applying production changes.

Historical reports of migration problems must be rechecked against the current environment.

Production safety is a non-negotiable constraint, not an optimization variable.

⸻

10. TEST INTELLIGENTLY

Testing must be proportional to risk.

Running every expensive test after every harmless change wastes time and usage allowance.

Running almost no tests creates regressions that cost even more time later.

The solution is layered, risk-based verification.

Level 1: Immediate development checks

For ordinary changes, run the relevant fast checks:

* Type checking.
* Linting where applicable.
* Focused unit tests.
* Relevant component or service tests.
* Build checks when necessary.

Level 2: Integration verification

For changes affecting workflows or shared components:

* Relevant integration tests.
* Browser tests against isolated environments.
* Permission checks.
* Cross-feature behavior checks.
* Regression tests for affected functionality.

Level 3: Release certification

Before publicly enabling relevant functionality:

* Required full release checks.
* End-to-end contest workflows.
* Security and authorization verification.
* Database integrity checks.
* Mobile and desktop verification.
* Production configuration validation.
* Applicable canonical release gates.

Security-critical changes may require stronger testing immediately, regardless of task size.

Never skip a required test merely because it is slow. Optimize the testing architecture instead.

⸻

11. PRIORITIZE COMPLETE USER JOURNEYS

Solaris Studio is not a collection of disconnected pages.

It is a functioning contest platform.

Prioritization must therefore focus on complete user journeys.

For example, a jury voting journey includes:

1. An eligible user signs in.
2. The system recognizes their authorization.
3. The correct ballot becomes available.
4. The user can save permitted progress.
5. Validation prevents invalid submissions.
6. Submission is recorded correctly.
7. The user receives an appropriate receipt.
8. The Organizer can see the correct authoritative status.
9. The result is handled according to contest publication rules.

A polished voting page is not a completed voting system if the underlying workflow fails.

Likewise, a correct backend is not a completed user experience if the participant cannot successfully use it.

Prioritize end-to-end functionality over isolated implementation percentages.

⸻

12. RELEASE IN STAGES WITHOUT ABANDONING V3

Solaris Studio should not wait for every planned V3 feature to be finished before a smaller verified release becomes available.

The existing soft-launch strategy establishes a reduced initial scope, with unfinished features hidden or restricted until verified.

Use three practical milestones.

Stage A: Owner-only beta

The first milestone is an environment in which the owner can safely test the application.

Prioritize:

* A functioning application shell.
* Working navigation.
* Authentication.
* Essential contest participation.
* Essential Organizer workflows.
* Representative public pages.
* Correct data isolation and permissions.
* A stable deployment suitable for owner testing.

This stage is for discovering problems before broader release.

It must not expose unfinished functionality to unauthorized users.

Stage B: Public soft launch

Enable only features that satisfy their applicable release requirements.

The established release plan prioritizes:

* Home.
* Authentication and permissions.
* Country confirmations.
* Jury voting.
* Televoting.
* Organizer controls.
* Participant deadlines, status and receipts.
* Independently verified public functionality.

The canonical public navigation remains:

Home · Explore · Participate · Results · Me

A feature that is incomplete should be safely hidden, restricted or presented in an explicitly appropriate unavailable state.

Never publish fake functionality merely to make the application appear complete.

Stage C: Full V3 completion

Continue implementing and verifying the remaining planned functionality, including expanded public experiences, advanced participation, statistics, World systems, design refinements and other canonical features.

The staged release strategy changes the order of delivery, not the final ambition.

⸻

13. DESIGN QUALITY MUST BE SYSTEMATIC

Solaris Studio V3 has detailed visual and interaction requirements.

These must not be treated as optional decorations added after development.

However, implementing every screen independently is inefficient.

13.1 Build reusable design foundations

Use shared:

* Design tokens.
* Typography.
* Spacing rules.
* Navigation components.
* Forms and input controls.
* Cards and information patterns.
* Loading states.
* Empty states.
* Error states.
* Confirmation and feedback patterns.

Shared foundations should be implemented before repeatedly building equivalent interfaces.

13.2 Preserve the three-experience strategy

The V3 design plans distinguish:

1. Installed mobile PWA.
2. Mobile browser.
3. Desktop browser.

These experiences must remain appropriately differentiated while sharing the same underlying product, canonical backend and reusable implementation wherever practical.

Do not create three unnecessarily independent applications.

Do not force all three experiences into an identical interface when the canonical plans require differences.

Respect safe areas, mobile navigation and device-specific behavior.

13.3 Prefer visual consistency over repeated redesign

Once a shared design pattern has been verified, reuse it.

Avoid repeatedly redesigning completed pages unless there is a genuine requirement, usability problem or inconsistency.

Visual refinement should improve the product without continually destabilizing functional code.

⸻

14. REDUCE AI USAGE WASTE

ChatGPT Plus and Codex usage allowances are limited resources.

Their exact limits and accounting may change, so development must not depend on an assumption of unlimited usage.

Efficiency requires reducing unnecessary context, repeated investigation and duplicated work.

14.1 Use focused task instructions

Each implementation session should receive:

* The relevant canonical requirements.
* The current objective.
* Known dependencies.
* Important safety constraints.
* Relevant files or code areas, when known.
* Acceptance criteria.
* Required evidence.

Do not paste every V3 planning document into every task when only a small subset is relevant.

However, agents must still consult the applicable canonical sources before making changes.

14.2 Maintain compact persistent context

Keep a concise, current record of:

* Active tasks.
* Responsible sessions.
* Open PRs.
* Dependencies.
* Known blockers.
* Verified completions.
* Current integration candidate.
* Next recommended actions.

This record should reduce the need for every new session to reconstruct the entire project’s history.

It must distinguish verified facts from historical observations and assumptions.

14.3 Do not repeat failed attempts blindly

When an implementation or test fails:

1. Capture the exact failure.
2. Identify the likely cause.
3. Inspect relevant evidence.
4. Change the approach deliberately.
5. Rerun only the necessary checks first.

Repeatedly asking an AI to “try again” without new information is not a development strategy.

14.4 Choose tools economically

Use the least expensive capable tool or model for the task, considering both usage cost and likelihood of success.

Reserve more capable reasoning or coding workflows for problems that justify them.

Do not sacrifice correctness for minor usage savings.

⸻

15. PREVENT THE PLANNING LOOP

Solaris Studio already has extensive planning documents.

New planning must serve implementation rather than replace it.

Do not repeatedly rewrite the master plan, invent new architecture or create additional task systems without a concrete reason.

Before proposing a new plan, ask:

* Is an existing plan already sufficient?
* Is the problem actually missing implementation?
* Is there a real conflict between specifications?
* Can the issue be resolved by a small clarification?
* Would a new document reduce work or create more coordination overhead?

Prefer updating the appropriate existing source of truth rather than creating another overlapping authority.

Planning is valuable only when it improves execution.

⸻

16. HANDLE BLOCKERS IMMEDIATELY

A blocker should not remain hidden inside a long implementation report.

When an agent encounters a blocker, it must classify it.

Technical blocker

An implementation or test cannot proceed because of a code, infrastructure or dependency issue.

Action: investigate the smallest viable resolution.

Integration blocker

A PR conflicts with current code, depends on an unmerged change or duplicates another implementation.

Action: reconcile the integration path before creating more overlapping work.

Specification blocker

Canonical requirements genuinely conflict or leave a consequential decision unresolved.

Action: identify the exact conflict and apply the established authority hierarchy. Ask the owner only when a genuine product decision remains.

Access blocker

The agent lacks necessary credentials, permissions or tool access.

Action: explain the specific missing capability. Do not invent a workaround that bypasses security.

Verification blocker

Implementation exists but cannot be reliably tested or certified.

Action: preserve the unverified status and identify the exact evidence needed.

A blocked task should not stop unrelated independent work.

However, downstream tasks must not proceed on assumptions that the blocker has been resolved.

⸻

17. MAKE COMPLETION STATUS HONEST

Every meaningful task should use clear status definitions.

NOT STARTED: No verified implementation work has begun.

IN PROGRESS: Implementation is actively being developed.

IMPLEMENTED: Code exists, but all required integration or verification evidence is not yet complete.

BLOCKED: A specific unresolved dependency prevents safe progress.

INTEGRATED: The implementation is included in the intended shared codebase, but further required verification may remain.

VERIFIED: Applicable tests and acceptance checks have passed on the relevant code.

RELEASED: The feature has been safely enabled in its intended release environment.

DEFERRED: The feature remains part of the plan but is intentionally excluded from the current release scope.

Never confuse IMPLEMENTED, INTEGRATED, VERIFIED and RELEASED.

Never claim a feature is fully finished based only on a successful code generation session.

⸻

18. PRIORITIZE BY IMPACT, DEPENDENCY AND RISK

The next task should not simply be whichever feature is most interesting or visually impressive.

Choose work based on:

1. Whether it blocks essential contest operations.
2. Whether other tasks depend on it.
3. Whether it reduces significant security or data-integrity risk.
4. Whether it completes an end-to-end user journey.
5. Whether it removes integration bottlenecks.
6. Whether it can be completed and verified efficiently.
7. Whether it is required for the next release milestone.

A small fix that unlocks five other tasks may be more valuable than a large new feature.

A security blocker may take priority even when it produces no visible improvement.

A visual polish task may take priority when the underlying feature already works and its user experience is the only remaining release blocker.

Use judgment rather than blindly applying a fixed feature order.

⸻

19. DEFAULT WORKFLOW FOR EVERY CODING SESSION

Unless a task explicitly requires a different workflow, follow this sequence.

Step 1: Understand

Read the task and applicable canonical requirements.

Identify the intended user-facing outcome.

Step 2: Inspect

Check current repository state, relevant code, tests, branches and overlapping PRs.

Do not rely solely on old planning snapshots.

Step 3: Scope

Define the smallest coherent implementation.

Identify dependencies and risks.

Step 4: Implement

Modify existing code where appropriate.

Reuse established systems.

Avoid unrelated changes.

Step 5: Verify locally

Run focused tests in approved isolated environments.

Investigate failures rather than ignoring them.

Step 6: Prepare integration

Create or update the appropriate PR when authorized.

Explain the change, dependencies, tests and remaining risks.

Step 7: Integrate

Follow the controlled integration process.

Resolve conflicts and stale checks.

Step 8: Confirm

Verify the actual integrated behavior using the applicable acceptance criteria.

Step 9: Record

Update task status with exact evidence.

Identify any remaining work.

Step 10: Continue

Move to the next highest-value unblocked task.

Do not create a new planning cycle merely because the previous task was completed.

⸻

20. DEFAULT RESPONSE FORMAT FOR DEVELOPMENT SESSIONS

Development sessions should communicate concisely and usefully.

At the end of meaningful work, report:

Objective: What was supposed to be achieved.

Changes: What was actually implemented.

Repository evidence: Relevant branch, commit or PR, if available.

Verification: Which tests or checks passed, failed or were not run.

Risks: Any unresolved security, data, integration or functionality concerns.

Status: Implemented, integrated, verified, released or blocked.

Next action: The single most valuable next step.

Do not replace evidence with lengthy self-congratulation.

Do not describe a task as complete when it remains unverified.

Do not overwhelm the owner with raw logs unless they are necessary to understand a decision.

⸻

21. ANTI-PATTERNS THAT MUST BE AVOIDED

The following practices are considered inefficient or unsafe:

1. Starting a new implementation without inspecting existing code.
2. Creating duplicate PRs for the same requirement.
3. Allowing multiple agents to modify shared architecture without coordination.
4. Treating opened PRs as completed features.
5. Treating merged PRs as proof of end-to-end functionality.
6. Running expensive tests repeatedly without a reason.
7. Allowing automated tests to contact production Supabase.
8. Making unrelated changes inside a narrowly scoped task.
9. Rewriting entire systems when a targeted fix is sufficient.
10. Weakening permissions or security to make tests pass.
11. Inventing new architecture without checking canonical plans.
12. Repeatedly rewriting planning documents instead of implementing them.
13. Declaring success without current evidence.
14. Using historical repository observations as if they were live facts.
15. Leaving obsolete branches and competing implementations unresolved.
16. Forcing the owner to manually perform technical tasks an available agent can safely handle.
17. Launching unfinished functionality as though it were working.
18. Sacrificing the intended V3 experience for an arbitrary deadline.
19. Keeping every feature blocked until the entire project is finished.
20. Optimizing for AI activity instead of verified product progress.

⸻

22. HOW TO MEASURE REAL PROGRESS

The project should primarily track:

* Number of required user journeys verified.
* Number of release-blocking defects remaining.
* Number of critical dependencies resolved.
* Number of verified features integrated into the release candidate.
* Number of unresolved overlapping or stale PRs.
* Number of required release gates passed.
* Number of features safely enabled for users.
* Time spent correcting regressions or duplicate work.

PR counts, commit counts and lines of code are secondary operational information.

They are not reliable measures of product completion.

A week with three verified, integrated workflows may represent more progress than a week with thirty unfinished PRs.

⸻

23. THE CENTRAL DECISION RULE

Whenever there are several possible ways to proceed, prefer the option that:

Delivers the greatest amount of correctly functioning, canonically compliant Solaris Studio functionality in the shortest realistic time, with the least unnecessary implementation, integration and verification overhead, while preserving security, production safety, data integrity and product quality.

If a shortcut reduces immediate work but creates significant future debugging or integration costs, it is not genuinely efficient.

If an elegant architecture requires weeks of unnecessary rewriting, it is not genuinely efficient.

If a feature is already working, rewriting it without a concrete benefit is not genuinely efficient.

If a release can safely expose verified functionality while unfinished features remain restricted, waiting for every feature may not be efficient.

Efficiency must be evaluated across the entire development lifecycle.

⸻

24. FINAL OPERATING DIRECTIVE

Every ChatGPT and Codex session working on Solaris Studio V3 must adopt the following mindset:

We are here to finish Solaris Studio, not endlessly prepare to finish it.

We must preserve the complete product vision while eliminating unnecessary complexity from the implementation process.

We must inspect before coding, reuse before rebuilding, coordinate before conflicting, verify before declaring completion and integrate before accumulating more unfinished work.

We must use parallel development where it genuinely accelerates progress, but never confuse parallel activity with integrated results.

We must protect production data and enforce canonical security requirements regardless of deadlines.

We must make intelligent use of limited AI resources without reducing the quality of the final product.

We must communicate clearly with a project owner who should be able to direct the product without personally managing technical implementation details.

We must prefer working functionality over impressive-looking progress reports.

We must distinguish the first usable beta, the public soft launch and the complete V3 vision without abandoning any canonical requirements.

And above all:

Every session should leave Solaris Studio measurably closer to completion than it was when the session began.

Not merely with more code.

Not merely with more plans.

Not merely with more pull requests.

With more verified, integrated, usable Solaris Studio.

⸻

AUTHORITY AND INTERPRETATION

This document is an execution philosophy and coordination standard.

It supplements the existing Solaris Studio V3 plans and does not supersede their domain-specific requirements.

The established canonical hierarchy, critical production-safety instructions, data-integrity requirements, security requirements and later explicit project-owner decisions remain authoritative.

Where this philosophy offers an optimization, apply it only when compatible with those requirements.

Where it conflicts with a mandatory safety or product requirement, the mandatory requirement prevails.

Final principle: Build the full intended product, but reach each verified milestone through the shortest safe path.