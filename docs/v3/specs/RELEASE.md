SOLARIS STUDIO V3

CANONICAL AUTHORITY, RELEASE READINESS & CERTIFICATION ADDENDUM

Version: 1.0
Date: 2026-10-27
Status: Canonical V3 architecture, migration, verification and release-governance addendum

────────

0. STATUS, PURPOSE AND PRECEDENCE

This document is a newer canonical addendum to the Solaris Studio V3 plans.

It exists because implementation and independent review of the real V3 repository exposed an important distinction that the earlier plans did not express strongly enough:

> **A complete architectural inventory is not the same thing as a release-risk inventory.**

Solaris Studio must remain strict where correctness, privacy, fairness, auditability and official contest state are at risk.

Solaris Studio must not, however, require integrity-grade machinery for every low-risk read model, analytics effect, UI projection or ordinary Organizer configuration edit merely because the same architecture exists elsewhere.

This document therefore defines:

• canonical mutation authority;
• database-level single-writer enforcement;
• how S15 ownership differs from real mutation authority;
• a new canonical mutation-authority audit;
• risk-tiered command, receipt, event, consequence and reconciliation requirements;
• hard, conditional and non-blocking release classifications;
• observable-contract parity and legacy cutover;
• state-machine expectations for critical aggregates;
• exact-SHA evidence production;
• release-manifest generation;
• CI fan-in certification;
• branch and integration policy;
• the Results / PR #1400 boundary;
• full-contest rehearsal requirements;
• pilot versus production release criteria;
• how external architectural reviews may influence implementation.

0.1 What this document DOES NOT replace

This document does not replace the canonical product, UX or domain specifications, including:

• v3-plan.txt
• V3 System plan (use this when u need to implement system stuff).txt
• Public side v3 (use this for v3 public implementation).txt
• Admin v3 (use this for admin v3 implementing).txt
• V3 bottom bar plan (use this for making the bottom page bar).txt
• Complete v3 coordinative master plan.txt
• newer explicit Organizer specifications;
• explicit project-owner instructions.

Those documents still define what Solaris Studio V3 is supposed to do.

This addendum mainly changes how architecture is enforced, how migration completion is classified, and what is allowed to block release.

0.2 Precedence

When this document directly conflicts with an older generic release-readiness, consequence-maturity, parity or ownership rule, this newer addendum wins.

When this document conflicts with:

• a newer explicit project-owner instruction;
• production safety;
• data-integrity requirements;
• a domain-specific canonical specification;

the newer or more specific requirement wins.

0.3 No silent scope reduction

This document MUST NOT be used to quietly remove required V3 product functionality.

A required launch capability does not become optional merely because its implementation is inconvenient.

A finding may move to non-blocking debt only when the remaining work is genuinely:

• evidence debt;
• obsolete/replaced work;
• non-critical architecture cleanup;
• optional observational maturity;
• an explicitly deferred product capability approved by the project owner.

Missing required user workflows remain real work.

────────

1. NON-NEGOTIABLE V3 LAWS

The following remain absolute.

1.1 One canonical contest truth

There is one canonical state for each durable domain.

Public, Participant, Organizer, Live, Results, notifications, analytics and historical views are projections or consumers of that truth.

No permanent competing authoritative stores.

1.2 Critical integrity belongs on the server and in the database

Official contest integrity must not depend on React conditionals, browser state or client goodwill.

Critical invariants belong in:

• PostgreSQL constraints;
• canonical RPCs/commands;
• server-side authorization;
• state-transition rules;
• transaction boundaries;
• version checks;
• idempotency where required;
• reconciliation where required.

1.3 Production Supabase isolation remains absolute

Automated CI, Playwright, browser audits, screenshot tests, migration rehearsals, load tests, crawlers and machine-generated QA MUST NOT use hosted production Supabase.

Normal automated testing uses isolated local/disposable Supabase.

If local infrastructure is unavailable:

> **FAIL CLOSED.**

Never fall back to production.

Production egress protection is part of correctness.

1.4 Exact-SHA certification remains mandatory

Evidence for one commit does not certify another commit.

No release decision may rely on:

• “latest green on this branch”;
• a successful older SHA;
• a stale PR description;
• a manually remembered workflow result.

The exact candidate SHA must have its own valid evidence.

1.5 Full-contest rehearsal remains mandatory

Final V3 release certification requires a realistic contest lifecycle rehearsal.

Isolated tests do not replace it.

1.6 Real failures must never be reclassified away

A security hole, unauthorized writer, non-atomic integrity mutation, privacy leak, broken mandatory workflow or reproducible data-loss risk must be fixed.

Never convert a real defect into “debt” merely to lower a counter.

1.7 Frozen Results ownership remains protected

PR #1400 owns its explicitly frozen Results residual scope.

Other V3 work must not re-implement or casually modify that Results-specific logic.

Integration contracts may be added around the boundary.

Ownership must not be violated.

────────

2. RELEASE READINESS IS TWO THINGS, NOT ONE

Solaris V3 must maintain both:

1. complete migration / architecture inventory, and
2. release-risk classification.

They answer different questions.

The inventory asks:

> What remains incomplete, unproven, legacy, replaced, partially migrated or architecturally unresolved?

The release-risk model asks:

> What can actually make this exact candidate unsafe or operationally unfit to release?

Both matter.

They must not be collapsed into one undifferentiated number.

────────

3. CANONICAL RELEASE CLASSIFICATION

Every unresolved item must receive one release classification in addition to its capability/migration status.

3.1 HARD BLOCKER

A finding is a hard blocker when shipping it can plausibly cause:

• security compromise;
• privacy disclosure;
• wrong official results;
• corrupted votes or jury scores;
• lost or duplicated critical submissions;
• unauthorized mutation;
• two active authoritative writers;
• non-atomic critical state;
• unrecoverable partial progress;
• broken mandatory contest workflow;
• invalid publication;
• broken account/session isolation;
• unsafe migration;
• production-test leakage;
• failure of a required exact-SHA release gate.

Hard blockers must reach zero before full release.

3.2 CONDITIONAL BLOCKER

A finding is conditional when it must be complete for the specific contest, rollout or production surface being released, but is not universally required for every deployment.

Examples:

• an Organizer surface needed for the next contest;
• a specific reveal workflow used by the current production format;
• a notification provider required for this edition;
• a moderation flow only required when that product is enabled.

A conditional blocker may be excluded only when:

• the feature is explicitly outside the release scope;
• it is disabled or unreachable;
• its absence cannot corrupt canonical state;
• the exclusion is documented.

3.3 TRACKED V3 DEBT

This category contains real unfinished work that does not block the candidate.

Examples may include:

• low-risk evidence debt;
• non-critical analytics maturity;
• optional realtime effects;
• unused legacy parity;
• cleanup of unreachable compatibility code;
• architecture simplification;
• secondary product polish;
• optional projection enhancements.

Tracked debt still requires:

• an owner;
• a reason;
• a target or review date where appropriate.

Tracked debt must not become a trash bin for missing launch requirements.

3.4 OBSOLETE / REPLACED

Use this only when the original requirement no longer applies because:

• the feature was retired;
• a canonical replacement exists;
• the product decision changed;
• the old concept has no remaining consumer.

The replacement or retirement must be explicit.

Do not implement dead architecture to satisfy stale metadata.

────────

4. KEEP THE COMPLETE INVENTORY

The broad V3 readiness inventory still matters.

Do not delete the larger audit merely because many items are not release blockers.

The release dashboard should show at minimum:

Hard blockers: X
Conditional blockers: Y
Tracked V3 debt: Z
Obsolete/replaced awaiting cleanup: W

Total unresolved audit findings: N

The total remains useful for migration completeness.

It is not, by itself, the release decision.

4.1 Never trust stale counts

Dynamic counts MUST be regenerated from the exact current head.

Do not use:

• a PR-body count;
• an old handoff;
• an earlier audit JSON;
• arithmetic subtraction from historical totals.

The generator is authoritative for current inventory.

────────

5. S15 OWNERSHIP IS NECESSARY BUT NOT SUFFICIENT

S15 zero-orphan remains valuable.

It answers questions such as:

• does every required concept have a declared owner?
• do commands/events have conflicting registered owners?
• are routes mapped?
• are capability statuses unresolved?
• are feature surfaces represented?

But S15 does NOT prove:

> only the canonical owner can mutate canonical state.

A system can have perfect registry ownership while an old service helper, cron job, Edge Function or admin script still writes the table directly.

That is not an orphan.

It is an unauthorized second authority.

────────

6. S16 CANONICAL MUTATION AUTHORITY

Add a separate canonical release control:

> **S16 - Canonical Mutation Authority**

S16 proves that integrity-sensitive canonical state can only be mutated through explicitly sanctioned authorities.

S15 asks:

> Who is declared to own this?

S16 asks:

> Who can actually write this?

Both are required.

────────

7. S16 CRITICAL TABLE INVENTORY

At minimum, S16 must cover canonical state for:

• results;
• result publication;
• jury ballots/scores;
• televote submissions/totals/finalization;
• voting configuration;
• confirmations;
• entries and immutable content versions;
• edition/show lifecycle state;
• participation/lineup where it affects official state;
• permissions and sensitive account/session state;
• integrity decisions/exclusions;
• any other table later classified as integrity-critical.

Do not automatically apply the heaviest enforcement model to every low-risk table.

Expand the inventory according to risk.

────────

8. DATABASE-ENFORCED CANONICAL WRITERS

For integrity-critical tables, prefer database enforcement over registry promises.

8.1 Role separation

Where supported by the current Supabase/PostgreSQL environment, use a least-privilege role model such as:

domain_table_owner    NOLOGIN
domain_writer         NOLOGIN

The table owner owns the canonical tables.

The writer owns or executes the sanctioned SECURITY DEFINER mutation RPCs and receives only the table privileges those RPCs require.

Prefer domain-specific writer roles for the highest-risk domains, for example:

results_writer
voting_writer
jury_writer
confirmation_writer
publication_writer

Avoid replacing one universal super-writer with another universal super-writer.

8.2 Direct DML revocation

For a canonical integrity table after cutover:

• revoke INSERT;
• revoke UPDATE;
• revoke DELETE;
• revoke TRUNCATE;

from API roles that should not mutate it directly, including where applicable:

• anon;
• authenticated;
• service_role.

service_role bypassing RLS is not a reason to give it unrestricted direct DML on canonical state.

Trusted server/background work should call governed RPCs.

8.3 No direct-write policy as backup

If a table is RPC-only for mutations:

• remove unnecessary direct-write RLS policies;
• preserve the required SELECT policies;
• use default deny as another wall.

8.4 Guard trigger

For the most integrity-sensitive tables, add a guard trigger that rejects direct writes unless the effective writer is the sanctioned domain writer.

Conceptual form:

create function app.guard_results_writer()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'results_writer' then
    raise exception
      'direct canonical write denied: table=%, effective_role=%',
      tg_table_name,
      current_user
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

The exact implementation must be verified against the current Supabase role model before deployment.

Guard triggers are a second wall against privilege drift.

They do not replace correct grants or authorization.

They do not protect against unrestricted superuser/operations access, which remains governed by operational process.

8.5 SECURITY DEFINER safety

Every security-definer canonical function must:

• have a pinned safe search_path;
• use explicit authorization;
• validate resource scope;
• validate state transition;
• validate expected version where required;
• have narrowly granted EXECUTE;
• avoid dynamic SQL unless unavoidable and safely parameterized.

Functions should not be executable by PUBLIC by accident.

Explicitly revoke and grant execution.

8.6 Default privileges

Prevent newly-created tables/functions from silently receiving broader privileges than intended.

Review and configure PostgreSQL default privileges for the relevant schemas/owners.

CI must detect unexpected grants on newly introduced integrity tables/functions.

────────

9. USE THE EXISTING PERMISSION ENGINE

Do NOT introduce a second parallel authorization framework merely because external advice uses an example such as app.can(...).

Solaris already has canonical authorization concepts.

The rule is:

> critical RLS policies and governed RPCs should rely on the same canonical permission decision primitive wherever practical.

Avoid duplicating capability logic independently in:

• React;
• server route;
• RPC;
• RLS;
• service job.

Defense-in-depth is good.

Conflicting permission definitions are not.

────────

10. SERVICE-ROLE POLICY

service_role is an operational credential, not a canonical mutation authority.

10.1 User-delegated actions

When a server action is acting on behalf of a user:

• preserve the user identity;
• forward/verify the user session where appropriate;
• use the same canonical authorization boundary.

Do not upgrade ordinary user actions into invisible service-role authority merely for convenience.

10.2 System/background actions

Background jobs may use trusted server credentials, but should invoke explicit job/system RPCs rather than raw DML on canonical tables.

Audit/receipt data should identify an actor type where relevant:

• user;
• organizer;
• system;
• job.

The fact that “the service did it” must not hide what authority caused the mutation.

────────

11. S16 VERIFICATION LAYERS

S16 should combine prevention and detection.

11.1 Catalog privilege audit

For every canonical critical table, verify:

• expected owner;
• expected writer role;
• no unexpected DML grants;
• no unexpected column-level grants;
• no unexpected updatable-view write path;
• expected RLS state;
• expected policies.

Use PostgreSQL catalog/privilege functions rather than source-text assumptions.

11.2 Function/trigger audit

Inspect:

• pg_proc;
• pg_trigger;
• function execution grants;
• function ownership;
• security-definer state;
• pinned search_path;
• triggers that can mutate the critical tables;
• scheduled DB jobs such as pg_cron where present.

Because PL/pgSQL table references are not always dependency-tracked perfectly, source scanning may also be necessary.

11.3 Application mutation scan

Scan application/server code for direct canonical mutations such as:

.from("results").insert(...)
.from("results").update(...)
.from("jury_votes").upsert(...)
.from("confirmations").delete(...)

This is a detection aid, not the final enforcement layer.

Tests, migrations and approved adapters require explicit allowlists.

11.4 Behavioral negative tests

Against isolated local Supabase:

For each critical table and relevant role:

direct anon write            -> denied
direct authenticated write   -> denied
direct service_role write    -> denied where RPC-only
legacy mutation path         -> denied/unavailable after cutover
canonical RPC unauthorized   -> denied
canonical RPC authorized     -> succeeds

Assert the expected SQLSTATE/error contract where useful.

11.5 Cutover assertion

A capability must not be promoted to true mutation cutover merely because a registry status changed.

For a critical write capability, cutover requires evidence that:

• canonical writer exists;
• required behavior passes;
• old writer is unreachable or write-disabled;
• direct table DML is denied as designed;
• required permissions are correct.

────────

12. PRODUCTION DRIFT AUDIT

Production must not be used for stateful automated testing.

However, canonical privilege drift is important enough to justify a deliberately tiny read-only catalog inspection when explicitly permitted.

Any hosted-production audit must be:

• read-only;
• catalog-focused;
• low-frequency;
• tightly bounded;
• free of table-data crawling;
• incapable of mutation;
• unable to generate meaningful egress.

If project production-safety rules prohibit automated hosted checks in the current environment, perform the drift check manually or through an explicitly approved bounded process.

Never turn this into another crawler.

────────

13. COMMAND ARCHITECTURE IS RISK-TIERED

The earlier critical command pipeline remains correct for consequential operations.

It is not automatically required in full for every ordinary CRUD edit.

13.1 Integrity-critical command

Use the full governed envelope when an operation can affect:

• official result;
• vote/jury state;
• participant submission;
• publication;
• security/access;
• irreversible lifecycle state;
• externally visible official contest truth.

Typical requirements:

• authentication;
• actor resolution;
• capability + scope authorization;
• canonical state load;
• legal transition validation;
• expected-version validation;
• idempotency where retries matter;
• transactional mutation;
• durable operation/audit record;
• events/outbox where consequences require them;
• receipt/readback where outcome may become uncertain;
• reconciliation.

13.2 Operational but recoverable command

Examples include many Organizer configuration/lifecycle operations.

Typical requirements:

• server-side authorization;
• exact resource/edition scope;
• transactional RPC;
• optimistic version/CAS where concurrency matters;
• audit where operationally important.

Add idempotency/receipt/outbox only when the failure model justifies them.

13.3 Low-risk CRUD

For low-risk configuration that:

• is easily reversible;
• has no external side effect;
• has no ambiguous retry danger;
• has low concurrency;

a transactional authorized mutation plus versioning may be enough.

Do not manufacture receipt/outbox/reconciliation infrastructure solely for architectural symmetry.

────────

14. WHEN IDEMPOTENCY IS REQUIRED

Idempotency is required when retrying the same user intent can otherwise:

• duplicate a vote;
• duplicate a submission;
• duplicate publication;
• duplicate a consequential side effect;
• corrupt totals;
• create ambiguous official state.

Examples normally include:

• Televote submission;
• jury submission/finalization;
• Confirmation submission;
• publication;
• selected Results/lifecycle operations.

Do not require idempotency keys for every harmless metadata edit.

────────

15. WHEN OPERATION RECEIPTS ARE REQUIRED

Use durable receipts/readback when:

• the network response may disappear after commit;
• the user needs durable proof;
• the client must reconcile an unknown outcome;
• auditability is part of the domain;
• a consequential operation fans out asynchronously.

Receipts are not a universal wrapper around every mutation.

────────

16. WHEN OUTBOX IS REQUIRED

Use a transactional outbox when an asynchronous side effect:

• must not be lost after the canonical transaction commits;
• must tolerate retry;
• must avoid duplicate consequences.

Examples:

• critical notifications;
• external delivery;
• consequential projection updates;
• workflow tasks that must be created reliably.

Pure same-transaction domain logic does not need to pretend to be distributed.

────────

17. CONSEQUENCE CLASSES

The consequence registry remains useful, but release maturity is class-specific.

17.1 INTEGRITY-CRITICAL CONSEQUENCES

Examples:

• votes;
• jury;
• Results;
• publication;
• critical selection/lifecycle state;
• security/session events where loss is unsafe.

Required as applicable:

• declared;
• emitted;
• persisted;
• outbox-backed where async;
• consumed;
• idempotent;
• reconciled;
• observable;
• required projection effects proven.

Analytics and realtime are required only if the product contract depends on them.

17.2 DELIVERY-CRITICAL CONSEQUENCES

Examples:

• email;
• push;
• required notifications;
• external webhook delivery.

Required:

• durable enqueue/outbox;
• retry-safe/idempotent consumption;
• failure visibility;
• dead-letter or explicit recovery path where appropriate.

Full domain reconciliation is not automatically required.

17.3 DERIVED / OBSERVATIONAL CONSEQUENCES

Examples:

• analytics;
• optional realtime counters;
• dashboards;
• search/index projections;
• non-critical insights.

Required:

• source of truth remains canonical;
• derived state is rebuildable or recoverable where needed;
• failure does not corrupt official state;
• lag/failure is observable when operationally important.

These must not automatically block release merely because they do not implement every integrity-grade consequence stage.

17.4 PURE READ / UX EFFECTS

A read-only UI effect does not need an event/outbox lifecycle simply to satisfy a uniform matrix.

────────

18. CONSEQUENCE REGISTRY SEMANTICS

The registry must distinguish:

• required effect;
• optional effect;
• replaced effect;
• non-applicable effect.

An empty or undefined “expected consequence” must not silently become a blocker with no actual requirement.

Read-replaced consequences must name the canonical replacement.

Event-backed and read-backed completion are not the same thing and must not be conflated.

────────

19. CRITICAL STATE MACHINES

Events describe completed facts.

They do not replace legal state-transition rules.

Critical aggregates must have an explicit state-transition contract for at least:

• Confirmation;
• Entry/review;
• Jury;
• Televote;
• Results;
• Publication;
• Edition/show lifecycle.

The contract must define:

• legal states;
• legal transitions;
• actor/capability required;
• scope required;
• version/CAS requirement;
• irreversible transitions;
• preconditions;
• required side effects.

This does not require adopting a fashionable state-machine library.

The transition contract may be implemented through:

• canonical RPCs;
• PostgreSQL constraints;
• transition tables;
• domain code;
• generated tests.

The important requirement is that legal transitions are explicit and enforced.

────────

20. PARITY MEANS OBSERVABLE CONTRACT PARITY

Legacy is not automatically the specification.

Do not require V3 to reproduce bugs, obsolete quirks or accidental implementation behavior.

For each migrated surface, define the observable contract that current consumers actually need.

A contract may include:

• response/data shape;
• permission behavior;
• error behavior;
• publication visibility;
• required workflow actions;
• ordering;
• deep-link behavior;
• spoiler/privacy behavior.

V3 reaches parity when the required contract is met or intentionally improved.

────────

21. CUTOVER MEANS REMOVAL OF OLD AUTHORITY

A mutation capability is not truly cut over while legacy mutation authority remains active.

For critical mutations, cutover requires:

1. canonical path proven;
2. observable contract accepted;
3. legacy writer disabled, revoked, dropped or made unreachable;
4. S16 verifies the old path cannot mutate;
5. rollback strategy is explicit.

Read-only legacy compatibility may temporarily remain only when:

• it cannot mutate canonical state;
• it is explicitly documented;
• it has a sunset condition.

────────

22. EVERY MIGRATION FLAG/FALLBACK NEEDS A SUNSET

Every migration-era:

• feature flag;
• fallback;
• compatibility adapter;
• dual-read path;
• legacy route;
• rollback shim;

must have:

• owner;
• reason;
• condition for removal;
• target review/deletion date when practical.

A permanent “temporary fallback” is a second architecture.

────────

23. READINESS STATUS IS NOT PROOF

Capability status remains useful:

• missing;
• mapped;
• implementing;
• tested;
• parity;
• cutover;
• certified;
• retired;
• etc.

But changing the status string is not evidence.

For high-risk statuses, promotion must be backed by generated evidence.

A registry saying cutover while a legacy writer remains executable is a defect.

────────

24. EVIDENCE-FIRST PROMOTION

For a critical capability, readiness promotion should reference:

• exact candidate SHA;
• relevant focused tests;
• runtime/local-Supabase proof;
• S16 mutation-authority proof where applicable;
• required legacy-disable proof;
• migration evidence where applicable.

Where feasible, generate promotion evidence from tests rather than relying on hand-written claims.

────────

25. CI PRODUCERS AND ONE RELEASE CERTIFIER

Use a fan-in model.

Independent workflows produce evidence.

They do not depend on each other.

A single release-certification workflow consumes their exact-SHA artifacts and produces the canonical release manifest.

Conceptual shape:

focused contracts --------\
local Supabase rehearsals --\
S15 ownership ---------------\
S16 mutation authority --------> RELEASE CERTIFIER -> release-manifest.json
security/privacy -------------/
S14 full contest ------------/Results contract ------------/
Browser/accessibility -------/

Only the certifier may declare a SHA release-ready.

────────

26. EVIDENCE ARTIFACT CONTRACT

Each producer artifact must contain at minimum:

{
  "schema_version": 1,
  "candidate_sha": "<full SHA>",
  "gate_id": "<stable gate id>",
  "result": "pass",
  "workflow_run_id": "<run id>",
  "job_name": "<job>",
  "produced_at": "<timestamp>"
}

Where useful, also include:

• evidence digest;
• migration head;
• tested policy version;
• local database identity;
• focused test counts;
• relevant capability IDs.

Artifact names should include the candidate SHA.

────────

27. EXACT-SHA AGGREGATOR RULES

The release certifier must fail closed when:

• required artifact is missing;
• artifact candidate SHA does not equal release candidate SHA;
• required gate failed;
• artifact schema is invalid;
• evidence is stale or ambiguous;
• policy version is incompatible.

Never use:

• “latest successful artifact on branch”;
• branch-only lookup;
• a cache not keyed to the exact commit;
• an older SHA because it tested “basically the same code”.

────────

28. CANONICAL RELEASE MANIFEST

The certifier must produce one machine-readable manifest for the exact candidate.

Example shape:

{
  "schema_version": 1,
  "candidate_sha": "<sha>",
  "policy_version": "v3-release-doctrine-1",
  "hard_blockers": 0,
  "conditional_blockers": 0,
  "tracked_debt": 37,
  "gates": [
    {
      "id": "canonical-writers",
      "blocking": true,
      "result": "pass",
      "workflow_run_id": "..."
    }
  ],
  "overall": {
    "release_ready": true
  }
}

For a real release, preserve the manifest with the release evidence.

The manifest is the certification snapshot.

The broad readiness inventory remains a separate migration/audit artifact.

────────

29. CI LAYERS

Preserve staged verification by cost.

29.1 PR / FAST REQUIRED

Frequently run:

• build/typecheck;
• lint;
• unit/contract tests;
• migration adoption checks;
• production isolation;
• focused authorization;
• S15 structural ownership;
• affected S16 static/catalog checks;
• focused affected local-Supabase tests.

These protect main.

29.2 AFFECTED WORKFLOW

After coherent slices:

• targeted migration rehearsal;
• affected browser flow;
• affected stateful integration tests;
• capability-specific parity/cutover contracts.

29.3 CHECKPOINT / RELEASE REQUIRED

Only for meaningful candidate checkpoints:

• full S14;
• exact-SHA privacy/security certification;
• full S16 critical-table certification;
• Results integration contract;
• production upgrade rehearsal;
• recovery evidence;
• Browser/accessibility certification where required;
• full contest lifecycle.

29.4 INFORMATIONAL

Examples:

• low-risk architecture inventory;
• optional consequence maturity;
• non-critical parity debt;
• analytics completeness;
• performance headroom warning;
• cleanup/sunset debt.

Informational checks remain visible.

They do not automatically veto release.

────────

30. LOCAL SUPABASE ISOLATION

Every concurrent local/CI Supabase stack must have isolated identity.

Prefer:

• unique project/stack identifier per job;
• unique Docker/Compose project namespace;
• no fixed host port when not necessary;
• unique host port when necessary;
• if: always() teardown;
• no shared mutable local stack between concurrent jobs.

A port/container collision is infrastructure failure.

It is not evidence that the tested domain is semantically broken.

────────

31. BRANCH AND PR STRATEGY

Long-lived integration PRs are allowed when necessary.

They are not automatically the safest place for every already-proven change.

31.1 Safe incremental merges

Consider merging independently proven work to main when it is:

• additive;
• production-safe;
• disabled/dark behind correct gates where required;
• not introducing a second authority;
• fully tested;
• independently reversible or non-activating;
• leaving main deployable.

Examples may include:

• isolation primitives;
• safe shared infrastructure;
• additive migrations;
• independently proven consumer cutovers;
• registry plumbing that does not falsely activate behavior.

31.2 Keep high-risk authority changes isolated until ready

Do not prematurely merge:

• unfinished Results authority;
• non-atomic voting paths;
• unsafe publication authority;
• incomplete critical migration cutovers;
• code that creates dual-write risk.

31.3 Avoid permanent mega-branch gravity

A giant draft PR must not become the only place proven improvements can exist forever.

Periodically evaluate whether completed slices can safely land.

Do not mass-split or mass-merge solely for tidiness.

────────

32. RESULTS / PR #1400 BOUNDARY

The Results ownership freeze remains valid.

PR #1629 and other V3 work must not duplicate #1400 Results logic.

However, frozen ownership does not mean frozen integration.

32.1 Shared contract

Define a thin explicit integration contract covering what the rest of V3 may assume from Results.

At minimum where applicable:

• official result row shape;
• round/show relationship;
• calculation/finalization state;
• publication/readback state;
• operation/receipt semantics;
• atomic official conversion behavior;
• countback/tie-break authority.

32.2 Contract tests

Both sides should be tested against the same contract fixtures or interface tests.

If #1629 changes something #1400 consumes, the contract should fail early.

If #1400 changes something Public/Organizer expects, the contract should fail early.

32.3 Restacking

Rebase/restack the Results branch against current main often enough to avoid release-week integration surprise.

Do not resolve integration drift by importing unrelated Results internals into #1629.

────────

33. FULL-CONTEST REHEARSAL CONTRACT

Final release requires a realistic end-to-end contest lifecycle.

The rehearsal should drive real canonical commands through a lifecycle such as:

1. edition setup;
2. countries/delegations;
3. Confirmation;
4. entry submission/review;
5. show/lineup setup;
6. jury;
7. televoting;
8. voting close/finalization;
9. Results calculation/readback;
10. publication;
11. public consumption;
12. notifications/required consequences;
13. archive/historical handoff where applicable.

Reference/master data may be seeded.

Critical workflow state should not be magically pre-seeded past the behavior being certified.

33.1 Manual database repair is failure

If the rehearsal requires a developer/operator to:

• edit a row manually;
• run ad-hoc SQL to advance state;
• repair a projection manually;
• bypass a canonical command;

the rehearsal is not a clean pass.

The intervention becomes a blocker or an explicitly understood missing operational tool.

────────

34. FAILURE AND RECOVERY ARE RELEASE BEHAVIOR

For every integrity-critical operation, document/test:

• safe retry behavior;
• unknown-outcome behavior;
• receipt/readback;
• reconciliation;
• partial failure handling;
• operator recovery;
• rollback or compensating action where rollback is impossible.

A correctness test that passes only when nothing fails is insufficient.

────────

35. PILOT RELEASE VS FULL RELEASE

A pilot is not an excuse to weaken integrity.

35.1 Pilot may reduce surface area

A limited pilot may exclude unfinished features if they are:

• disabled;
• unreachable;
• outside the pilot workflow;
• unable to mutate pilot canonical state.

35.2 Pilot must still satisfy critical-path safety

Pilot requires zero unresolved hard blockers in the paths it uses, including:

• authorization;
• privacy;
• critical canonical writers;
• critical idempotency/recovery;
• relevant Results/voting integrity;
• production isolation.

35.3 Full release

Full production release requires:

• hard blockers = 0;
• required conditional blockers for release scope = 0;
• exact-SHA release manifest green;
• full-contest rehearsal green;
• required Results integration green;
• required recovery evidence;
• migration/production isolation green.

Tracked debt may remain only if it is genuinely non-blocking and explicitly owned.

────────

36. PERFORMANCE AND EGRESS

Do not optimize every query preemptively.

Prioritize real hot paths:

• Public Live;
• Results publication;
• scoreboard;
• voting close/finalization;
• jury operations;
• Organizer live controls;
• high-fanout realtime.

Still enforce:

• bounded queries;
• minimal columns;
• no accidental N+1;
• deduplicated subscriptions;
• no uncontrolled polling;
• cache/invalidation where useful.

Production Supabase egress remains a correctness constraint.

────────

37. EXTERNAL REVIEW POLICY

External reviewers, Discord communities and AI architecture reviews are advisory.

They are valuable for identifying:

• blind spots;
• known platform patterns;
• safer database techniques;
• CI/release patterns;
• unnecessary complexity.

They are not release evidence by themselves.

37.1 Evidence ranking

Prefer conclusions supported by:

1. current exact-head code;
2. current migrations/database catalog;
3. current focused runtime/local-Supabase tests;
4. current exact-SHA CI artifacts;
5. documented platform behavior;
6. reviewer inference.

A reviewer who cannot access the repository may still provide useful hypotheses.

Do not treat guessed implementation details as facts.

37.2 Verify before canonicalizing

Before changing architecture because of external advice:

• verify the relevant current code;
• verify Supabase/PostgreSQL behavior;
• check interaction with existing V3 rules;
• implement incrementally;
• add regression protection.

────────

38. IMPLEMENTATION LOOP FOR FUTURE V3 SESSIONS

Every substantial implementation run should:

1. fetch current main;
2. fetch the actual target PR/current head;
3. inspect latest exact-head CI;
4. regenerate current readiness instead of trusting old counts;
5. identify hard blockers first;
6. identify shared root causes/fan-out;
7. implement the highest-value coherent slice;
8. add/repair focused proof;
9. run cheap verification first;
10. run local Supabase only for stateful tests;
11. update evidence/readiness honestly;
12. commit and push a coherent checkpoint;
13. continue to the next safe high-value slice.

Do not stop after one trivial success.

Do not run the largest suite as the primary debugger.

────────

39. BLOCKER PRIORITY WITH THIS ADDENDUM

Use this order unless a newer project-owner instruction overrides it.

P0 - SAFETY / INTEGRITY

• production Supabase isolation;
• auth/privacy;
• critical canonical writer enforcement;
• Results/voting/jury integrity;
• critical migration safety;
• session/account isolation.

P1 - ACTIVE DUAL AUTHORITY

• old writer still reachable;
• non-atomic critical conversion;
• duplicate ranking/calculation authority;
• legacy mutation fallback.

P2 - REQUIRED CONTEST WORKFLOW

• Confirmation;
• Entry;
• Media where required;
• Jury;
• Televote;
• Results;
• Publication;
• required Organizer live operations.

P3 - RECOVERY / OPERATIONAL CONTROL

• receipts/readback where required;
• reconciliation;
• incident/recovery tooling;
• required notification delivery;
• rollback/compensating actions.

P4 - REQUIRED PUBLIC/ORGANIZER CUTOVER

• observable-contract parity;
• old authority removal;
• required launch surfaces.

P5 - NON-BLOCKING MIGRATION DEBT

• evidence-only low-risk work;
• optional projections;
• analytics;
• unused parity;
• cleanup.

P6 - POLISH

Only after substantive blockers.

────────

40. RELEASE DECISION RULE

Solaris Studio V3 is release-ready when:

1. the exact candidate SHA has a valid release manifest;
2. hard blockers are zero;
3. all conditional blockers required by the release scope are zero;
4. S16 is green for critical canonical mutation authority;
5. critical auth/privacy checks are green;
6. critical Results/voting/jury/Confirmation/publication integrity is green;
7. full-contest rehearsal is green without manual database repair;
8. migration/production isolation is green;
9. required recovery evidence is green;
10. #1400 / Results integration contract is satisfied;
11. remaining debt is genuinely non-blocking, explicit and owned.

The total unresolved architecture/migration inventory does NOT have to be numerically zero merely because the inventory contains non-blocking debt.

However:

> **No required product capability, security defect, integrity defect, active dual writer or critical operational gap may be hidden inside that debt.**

────────

41. DEFINITION OF V3 COMPLETE

“Release-ready” and “all migration debt eliminated” are not necessarily the same milestone.

For clarity:

V3 RELEASE-READY

The production candidate satisfies Section 40.

V3 MIGRATION-COMPLETE

In addition to release readiness:

• required V3 product scope is fully delivered;
• obsolete legacy mutation paths are removed;
• migration flags/fallbacks are cleaned up;
• the broad canonical inventory has reached its intended end state;
• remaining debt is ordinary post-release product/engineering debt rather than unfinished migration authority.

Do not claim migration-complete merely because the application shipped.

Do not prevent a safe release merely because optional architecture debt still exists.

────────

42. FINAL DIRECTIVE

Build Solaris Studio V3 with strictness proportional to risk.

Be uncompromising about:

• official contest truth;
• privacy;
• authorization;
• canonical mutation authority;
• Results/voting/jury integrity;
• critical idempotency;
• recoverability;
• production isolation;
• exact-SHA evidence.

Be pragmatic about:

• low-risk CRUD;
• optional analytics;
• observational consequences;
• obsolete parity;
• non-critical evidence debt;
• architecture cleanup that does not affect release safety.

Prefer database enforcement over registry promises.

Prefer observable contracts over historical quirks.

Prefer one exact-SHA release manifest over scattered remembered greens.

Prefer a clean full-contest rehearsal over a beautiful counter.

The objective is not to make Solaris Studio look architecturally complete.

The objective is to make Solaris Studio actually safe, coherent, operable and releaseable, while preserving a truthful record of everything still unfinished.