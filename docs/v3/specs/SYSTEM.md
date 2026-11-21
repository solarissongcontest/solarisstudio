Solaris Studio App V3

System Integrity, Integration, Reliability & Final Release Specification

Canonical Ownership · Database Integrity · Cross-System Effects · Security · Observability · Reliability · Recovery · Capacity · Migration · Full-System Verification

⸻

Status of this specification

This document is the fourth canonical Solaris Studio V3 implementation specification.

It supplements:

1. Solaris Studio App V3 — Canonical Product Blueprint
2. Complete Public, Fan & Participant Implementation Specification
3. Organizer Operational System Implementation Specification

This document defines how those product surfaces operate as one coherent system.

Where this document is more specific about:

* canonical ownership
* cross-system integration
* system invariants
* mutation integrity
* database constraints
* events
* background jobs
* synchronization
* security
* abuse resistance
* observability
* SLOs
* incident detection
* backups
* disaster recovery
* capacity
* migrations
* whole-system verification
* release evidence

this document is authoritative.

It does not replace the feature-level UX specifications.

⸻

Part I

What this specification solves

1. The remaining V3 problem

A perfectly designed participant interface and a perfectly designed Organizer interface can still form a broken system if they disagree about:

* contest state
* deadlines
* permissions
* entry revisions
* voting state
* results
* notifications
* publication
* historical state

Therefore V3 requires system-wide contracts beneath both experiences.

The required property is:

One canonical competition, many projections.

Not:

several UIs which each happen to contain approximately the same information.

⸻

2. System promise

For every important state in Solaris:

* exactly one canonical owner exists
* mutations occur through known authoritative paths
* invalid combinations are prevented where practical
* derived projections can be rebuilt
* dependent tasks update deterministically
* notifications derive from explicit consequences
* public visibility follows publication policy
* audit history explains the change
* failures are observable
* uncertain operations are reconcilable
* historical truth remains reproducible

⸻

3. Cross-system doctrine

Prefer:

Canonical truth over synchronized copies

Database constraints over UI assumptions

Commands over arbitrary writes

Domain events over hidden side effects

Idempotency over hope

Reconciliation over duplicate retries

Explicit dependency over temporal coincidence

Structured telemetry over console archaeology

SLOs over “seems fine”

Restore rehearsal over backup optimism

Capacity budgets over surprise invoices

Compatibility windows over flag-day migrations

Full-contest rehearsal over isolated happy paths

⸻

Part II

Canonical System Registry

4. Create the System Domain Registry

Add a machine-readable registry:

type SystemDomainOwner = {
  domain: string;
  canonicalStore: string;
  authoritativeService: string;
  primaryTables: string[];
  mutationCommands: string[];
  projections: string[];
  eventTypes: string[];
  publicConsumers: string[];
  organizerConsumers: string[];
  backgroundConsumers: string[];
  retentionClass: string;
  sensitivityClass: string;
};

Store in version control.

Suggested location:

docs/v3/system-domain-registry.ts

⸻

5. Every domain needs one canonical owner

At minimum classify:

identity
accounts
sessions
memberships
capabilities
countries
country historical identity
editions
shows
show runtime state
running order
confirmation rounds
confirmation requirements
confirmation responses
entries
entry revisions
entry review decisions
media assets
media revisions
media validation
jury rounds
jury drafts
jury ballots
jury declarations
televote rounds
televote ballots
televote aggregate totals
vote validation
voting configuration
voting integrity cases
results
result versions
result publication
publications
notifications
notification deliveries
stories
rules
rule versions
interpretations
following
saved items
Fantasy
predictions
tasks/actions
receipts
audit
incidents
feature rollout
system jobs

⸻

6. One domain cannot have two competing truths

Example:

Bad:

show.jury_open = true
jury_round.status = closed

with different screens reading different fields.

Required:

jury_round.status

is canonical.

A show projection may derive:

jury = open

from it.

⸻

7. Legacy duplicate data

Where historical architecture currently stores the same semantic fact in multiple places:

1. identify canonical field
2. identify legacy copies
3. stop new independent writes
4. derive or synchronize during compatibility period
5. add parity monitoring
6. migrate readers
7. retire duplicate storage where safe

⸻

Part III

Global identity system

8. Canonical identifiers

Every durable domain object receives one canonical stable identifier.

Do not use:

* display name
* slug
* position
* edition number

as relational identity.

⸻

9. Slugs are routing metadata

Example:

country_id = uuid
slug = "oland"

Changing:

oland → republic-of-oland

must not break:

* results
* entries
* audit
* notifications
* historical records

⸻

10. Historical identifiers

Historical display state may differ from current identity.

Store explicit historical presentation where required.

Do not rewrite old contest history when current branding changes.

⸻

Part IV

Database integrity

11. Database constraints are first-class architecture

Important invariants must not rely solely on:

if (...) return error

inside React.

Use PostgreSQL integrity features where appropriate.

PostgreSQL supports NOT NULL, UNIQUE, primary keys and foreign keys specifically for these integrity guarantees. (PostgreSQL)

⸻

12. NOT NULL policy

Fields representing mandatory canonical relationships should normally be NOT NULL.

Do not permit impossible half-records simply because TypeScript expects the property.

⸻

13. Foreign keys

Use foreign keys for durable relationships such as:

entry.edition_id → edition.id
entry.country_id → country.id
ballot.round_id → voting_round.id
result.show_id → show.id
receipt.operation_id → operation.id

Choose delete behavior deliberately.

⸻

14. Unique invariants

Candidate uniqueness constraints include:

one active effective confirmation requirement
per edition + delegation + requirement type
one final jury ballot
per jury round + delegation
one canonical published result version
per publication slot
one user follow
per user + entity type + entity
one idempotency record
per actor/context + idempotency key

Actual constraint form must follow the domain rules.

⸻

15. Partial uniqueness

Where uniqueness applies only to active rows, use a partial unique index where appropriate.

Example concept:

UNIQUE active requirement
WHERE status NOT IN ('superseded', 'cancelled')

Do not enforce complex cross-row truth with inappropriate CHECK constraints.

PostgreSQL explicitly recommends using mechanisms such as UNIQUE, EXCLUDE or FOREIGN KEY for cross-row/cross-table restrictions rather than pretending a row-local CHECK can safely enforce them. (PostgreSQL)

⸻

16. Check constraints

Use for row-local invariants.

Examples:

jury_weight >= 0
public_weight >= 0
position > 0
close_at > open_at
revision >= 1

when applicable.

⸻

17. Enum/state integrity

Do not allow arbitrary free-text workflow status.

Use controlled state values through:

* database enum
* constrained text
* state-transition command

according to migration requirements.

⸻

18. Invalid state transitions

Prevent:

draft → published

when the domain requires:

draft
→ review
→ finalized
→ published

The server command validates allowed transition from current canonical state.

⸻

19. Referential delete policy

Every foreign-key relationship receives an explicit delete policy:

CASCADE
RESTRICT
SET NULL
archive instead

Do not accept database defaults without reviewing their domain consequence.

⸻

20. Official historical data

Official contest history should generally prefer:

archive

over destructive deletion.

Examples:

* published results
* finalized ballots
* official entries
* published rules
* operation receipts

⸻

Part V

System command architecture

21. One mutation architecture

Both public and Organizer consequential mutations use the same core system pipeline:

intent
↓
authenticate
↓
resolve actor
↓
capability check
↓
scope check
↓
load canonical state
↓
validate state transition
↓
validate expected version
↓
validate idempotency
↓
transaction / lock
↓
write canonical state
↓
write operation record
↓
write domain events
↓
commit
↓
derive/recompute affected projections
↓
schedule asynchronous effects
↓
return receipt
↓
realtime invalidation

⸻

22. No hidden direct critical writes

Prohibit direct browser writes for consequential canonical operations.

Examples:

close jury
publish result
verify entry
reopen confirmation
grant capability
submit ballot
exclude vote
activate broadcast state

must use commands.

⸻

23. Low-risk direct mutations

Direct CRUD may remain where:

* consequence is local
* no workflow transition exists
* no cross-system effect exists
* authorization is still safely enforced
* optimistic update is safe

The registry documents any exception.

⸻

24. Standard command envelope

type SystemCommand<T> = {
  commandId: string;
  actorId: string;
  editionId?: string;
  showId?: string;
  subjectType?: string;
  subjectId?: string;
  expectedVersion?: number | string;
  idempotencyKey: string;
  payload: T;
  reason?: string;
  requestedAt: string;
};

⸻

25. Server does not trust actorId from browser

The authenticated server context determines actor identity.

Client-supplied actor identifiers are never authoritative.

⸻

26. Command preflight

High-risk commands may support:

POST /preflight

or equivalent server calculation.

Preflight returns:

* current authoritative state
* blockers
* consequences
* affected counts
* expected version

Commit revalidates everything.

⸻

27. Preflight is not permission to commit later

State may change between:

preflight

and:

commit

Commit must repeat critical checks.

⸻

Part VI

Idempotency

28. Idempotency registry

Create durable idempotency storage for critical commands.

Concept:

type IdempotencyRecord = {
  actorScope: string;
  idempotencyKey: string;
  command: string;
  requestFingerprint: string;
  state:
    | "processing"
    | "succeeded"
    | "failed";
  operationId: string;
  responseSnapshot?: unknown;
  createdAt: string;
  expiresAt?: string;
};

⸻

29. Same key, same payload

Repeated request with same key and same semantic payload:

return existing result

not duplicate mutation.

⸻

30. Same key, different payload

Reject.

Example:

IDEMPOTENCY_KEY_REUSED

⸻

31. Unknown outcome recovery

If client loses response:

GET operation/{operationId}

or equivalent reconciliation retrieves current result.

⸻

Part VII

Transactions and locking

32. Atomic official operations

Operations that must behave atomically use database transactions.

Examples:

finalize result version
close voting round
accept entry revision
publish result version
grant sensitive capability

⸻

33. Locking strategy

Use the weakest locking sufficient for integrity.

Options may include:

* row locks
* optimistic versions
* unique constraints
* advisory locks where justified

Avoid global locks.

⸻

34. Optimistic concurrency

Most editable versioned objects use:

expected_version

Server updates only when expected version matches.

Otherwise:

STATE_CHANGED

⸻

Part VIII

Operation ledger

35. Operation record

Every consequential command writes:

type SystemOperation = {
  id: string;
  command: string;
  actorId: string;
  editionId?: string;
  showId?: string;
  subjectType?: string;
  subjectId?: string;
  state:
    | "accepted"
    | "processing"
    | "succeeded"
    | "partial"
    | "failed";
  requestFingerprint: string;
  startedAt: string;
  completedAt?: string;
  correlationId: string;
};

⸻

36. Receipt relationship

User/Organizer receipts reference operation.

One operation may produce:

* participant receipt
* organizer receipt
* audit event

without three separate competing histories.

⸻

Part IX

Domain events

37. Introduce canonical domain events

Create a system-level event schema.

type DomainEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  operationId: string;
  correlationId: string;
  editionId?: string;
  showId?: string;
  actorId?: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
};

⸻

38. Events describe completed facts

Prefer:

entry.changes_requested

not:

request_entry_changes

Commands request.

Events state what happened.

⸻

39. Event examples

confirmation.requirement_opened
confirmation.submitted
confirmation.changes_requested
confirmation.accepted
entry.submitted
entry.changes_requested
entry.resubmitted
entry.verified
media.replacement_requested
media.asset_accepted
jury.ballot_submitted
jury.round_closed
televote.opened
televote.ballot_accepted
televote.closed
result.finalized
result.published
notification.delivery_failed
membership.capabilities_changed
incident.declared
incident.resolved

⸻

Part X

Transactional event delivery

40. No fragile dual write

Bad:

UPDATE entry;
send notification;

where database commits but notification/event bookkeeping disappears.

⸻

41. Transactional outbox

For mutations with asynchronous consequences:

write canonical mutation and outbox event in the same database transaction.

Concept:

canonical change
+
outbox event
+
operation record
COMMIT

⸻

42. Outbox processor

Background processor:

pending
→ claimed
→ processing
→ completed

Retry safe.

⸻

43. Outbox idempotency

Consumers track processed event IDs or otherwise guarantee idempotent handling.

A repeated outbox delivery must not:

* send duplicate push
* create duplicate task
* publish duplicate story
* duplicate aggregate update

⸻

Part XI

Cross-system consequence matrix

44. Create machine-readable consequence registry

type DomainConsequence = {
  eventType: string;
  projections: string[];
  taskEffects: TaskEffect[];
  notificationEffects: NotificationEffect[];
  publicationEffects: PublicationEffect[];
  realtimeEffects: RealtimeEffect[];
  analyticsEffects: string[];
  auditRequired: boolean;
  consumers: string[];
};

⸻

45. Every consequential event must be mapped

A domain event is not production-ready while its downstream effects are undocumented.

⸻

46. Confirmation example

ORGANIZER
requests confirmation changes
↓
confirmation response
= changes_required
↓
new response revision expected
↓
participant Journey
required task appears
↓
participant Home
attention appears
↓
notification
delegation notified
↓
Organizer task
awaiting resubmission
↓
participant resubmits
↓
review task created
↓
organizer accepts
↓
participant responsibility completes
↓
Home/Participate clear
↓
receipts/history update

⸻

47. Entry correction example

entry.changes_requested
affects:
Participant Journey
Participant Home
Entry editor
Organizer queue
Delegation readiness
notification
audit

Public entry remains unchanged until publication policy allows new revision.

⸻

48. Media replacement example

media.replacement_requested
↓
participant required task
↓
upload replacement
↓
processing
↓
organizer review
↓
approval
↓
entry readiness recompute
↓
public media version changes only when publication policy says so

⸻

49. Jury submission example

jury.ballot_submitted
↓
participant receipt
↓
participant task resolves
↓
Organizer missing count decreases
↓
jury readiness recomputes
↓
Organizer Overview may change

No public result changes yet.

⸻

50. Result publication example

result.published
↓
canonical publication state
↓
Public Results
Home
Edition
Country result
Live transition
notifications
search index
SEO metadataarchive history
Organizer readiness
audit

All consumers reference the same finalized result version.

⸻

Part XII

Projection architecture

51. Projections are disposable

A projection may be:

* cached
* recomputed
* rebuilt

Canonical truth must survive if projection storage is deleted.

⸻

52. Projection metadata

Every projection response should support:

stateVersion
generatedAt
serverTime

where operational freshness matters.

⸻

53. Projection dependencies

Document:

projection
→ canonical domains
→ invalidating events

Example:

Journey
→ membership
→ confirmation
→ entry
→ media
→ jury

⸻

54. No circular projection dependencies

Projection A must not require projection B which requires A.

Both should derive from canonical domains or lower-level shared projections.

⸻

55. Projection freshness classes

Define:

Static

Examples:

* archived edition metadata
* historical rule version

Can cache aggressively.

Normal

Examples:

* Explore
* country history

Moderate stale time.

Operational

Examples:

* Journey
* Organizer Tasks

Fresh within short bounded window/event invalidation.

Live

Examples:

* show runtime
* televote state

Realtime/event-driven.

⸻

Part XIII

Reconciliation

56. Every async consumer can be repaired

For each asynchronous projection/job, define:

incremental path
rebuild path
verification query

⸻

57. Reconciliation jobs

Examples:

rebuild Journey for edition
recompute delegation readiness
verify result publication projections
reconcile notification task states
rebuild search index

⸻

58. Reconciliation must be bounded

Never implement:

SELECT * FROM everything;

on every schedule.

Use:

* changed-since cursor
* edition scope
* event offsets
* batches
* bounded retries

⸻

Part XIV

Task architecture across sides

59. Task ownership

Public Actions and Organizer Tasks may derive from the same domain event but represent different responsibilities.

Example:

entry.changes_requested

creates:

participant:
Fix artist image

and resolves:

organizer:
Review entry

until resubmission.

⸻

60. Task identity

Use stable semantic keys.

Example:

participant:entry:{entryId}:correction:{revision}

⸻

61. Dead-task invariant

No task may remain actionable when canonical state proves the operation invalid.

⸻

Part XV

Notification integrity

62. Notification delivery is downstream state

Notifications never become canonical workflow truth.

If a push fails:

entry still requires correction

The workflow does not revert.

⸻

63. Notification dedupe

Use stable dedupe keys.

⸻

64. Delivery record

type NotificationDelivery = {
  notificationId: string;
  recipientId: string;
  channel: "push" | "in_app";
  state:
    | "queued"
    | "sent"
    | "delivered"
    | "failed"
    | "expired";
  attemptCount: number;
  lastAttemptAt?: string;
  failureCode?: string;
};

⸻

65. Retry only failed targets

Bulk delivery retry must not resend successful recipients unnecessarily.

⸻

Part XVI

Authorization architecture

66. Authorization is server-side

Every protected command and protected read checks:

actor
capability
scope
object
state

⸻

67. Object-level authorization

For any API accepting object identifiers:

verify the authenticated user may access that exact object.

OWASP identifies broken object-level authorization as a major API risk and recommends object-level checks whenever user-supplied IDs are used to access data. (api-security.owasp.org)

⸻

68. Property-level authorization

Do not return sensitive properties and rely on frontend hiding.

Public projections select only public-safe fields.

⸻

69. Function-level authorization

Participant endpoints cannot call Organizer functions merely by constructing an admin URL.

⸻

70. RLS defense

Where Supabase RLS is used:

* maintain explicit policy tests
* deny by default for sensitive tables
* do not rely exclusively on client route guarding

⸻

71. Service-role access

Service-role credentials remain server-side only.

Never:

* browser bundle
* public environment variable
* CI environment without explicit isolated need

⸻

Part XVII

Authentication integrity

72. Session model

Canonical session state remains server-authoritative.

⸻

73. Privilege transition

On material capability/role change:

* refresh authorization state
* invalidate protected caches
* renew session context as needed
* terminate access that no longer applies

⸻

74. Revocation

Revoked access must stop future protected operations even if old browser state remains visible.

⸻

Part XVIII

Security threat model

75. Maintain V3 threat model

Create:

docs/v3/security-threat-model.md

Update alongside new domains.

⸻

76. Actors

Model:

* anonymous visitor
* legitimate fan
* participant
* HOD
* organizer
* superadmin
* compromised account
* automated bot
* malicious voter
* malicious uploader
* abusive API client
* compromised integration

⸻

77. Assets

Protect:

* official results
* ballots
* unreleased entries
* private media
* identities
* account sessions
* recovery credentials
* evidence
* organizer permissions
* publication state
* audit history

⸻

78. Broken object authorization tests

Test:

user A cannot access user B's private entry
country A cannot alter country B
organizer scoped to edition A cannot mutate edition B
anonymous user cannot infer private records

⸻

79. Broken authentication tests

Test:

* expired session
* revoked session
* forged token
* reused recovery credential
* privilege downgrade
* deleted membership

⸻

80. Sensitive business-flow abuse

OWASP specifically calls out unrestricted access to sensitive business flows. Solaris should treat flows such as voting, reminders, account recovery and public submissions as abuse-sensitive. (api-security.owasp.org)

⸻

Part XIX

Rate limiting and abuse budgets

81. Define rate-limit classes

Public read

Generous.

Search

Moderate.

Authentication

Strict adaptive.

Submission

State-bound.

Public voting

Anti-abuse-aware.

Expensive analytics

Bounded.

Notification/send commands

Strict.

⸻

82. Resource consumption

OWASP lists unrestricted resource consumption as a major API risk, including bandwidth, CPU, memory, storage and service-provider costs. (api-security.owasp.org)

Therefore enforce:

* pagination ceilings
* batch size limits
* upload limits
* request timeouts
* search result limits
* expensive-analysis boundaries
* retry limits

⸻

83. Vote abuse protection

Use appropriate combination of:

* eligibility enforcement
* server timestamp
* dedupe/idempotency
* rate limits
* anti-automation signals
* integrity review

Do not disclose anti-abuse thresholds unnecessarily.

⸻

84. Reminder/notification spam

Organizer reminder commands enforce:

* recipient count
* cooldown where appropriate
* dedupe
* explicit operation receipt

⸻

Part XX

Upload security

85. Media upload validation

Server validates:

* MIME/content consistency
* size
* decode/readability
* image/audio/video requirements
* filename handling
* storage location
* authorization

⸻

86. Quarantine

Potentially unsafe/invalid uploads enter quarantine state.

Do not publish directly from raw upload.

⸻

87. Signed access

Private/unpublished media must not rely on obscure public URLs.

Use scoped access mechanism supported by storage architecture.

⸻

Part XXI

External integration security

88. External service inventory

Registry for:

Supabase
Cloudflare
push provider
email provider if present
media processing
external broadcast URLs
future integrations

⸻

89. Treat external responses as untrusted

Validate:

* schema
* status
* size
* timeout
* expected host

OWASP explicitly warns against blindly trusting integrated third-party APIs. (api-security.owasp.org)

⸻

90. Timeouts

Every network integration has bounded timeout.

⸻

91. Retry policy

Classify errors:

retryable
not retryable
unknown

Use exponential backoff/jitter where appropriate.

Bound attempts.

⸻

92. Circuit protection

For repeatedly failing optional external systems:

avoid hammering indefinitely.

Degrade gracefully where possible.

⸻

Part XXII

Canonical time

93. Store timestamps in UTC

Preserve existing V3 rule.

⸻

94. Edition timezone

Edition/show stores official timezone.

⸻

95. Deadline comparisons

Server determines authoritative deadline validity.

Never rely on device clock for permission to submit.

⸻

96. Client countdown

Compute from:

serverTime offset
+
canonical deadline

⸻

97. DST tests

Test edition deadlines across:

* DST transitions
* users in different zones
* browser with wrong clock

⸻

Part XXIII

Result integrity

98. Result input immutability

Finalized result references explicit immutable input versions.

⸻

99. Result reproducibility

Given:

jury version
televote version
voting config version
calculation version

the final ranking must be reproducible.

⸻

100. Correction model

Corrected result creates:

new result version

Do not rewrite historical finalized version invisibly.

⸻

101. Publication pointer

Public result publication points to exact finalized version.

⸻

Part XXIV

Search integrity

102. Search is a projection

Search index is not canonical data.

⸻

103. Private data

Index only fields allowed for the searcher’s authorization.

⸻

104. De-publication

When content becomes non-public:

search invalidation must remove it.

⸻

Part XXV

Cache integrity

105. Cache classes

Separate:

public immutable historical
public current
authenticated user
delegation-private
organizer-private
live

⸻

106. Private cache boundaries

Never share authenticated/private cache entries across users.

⸻

107. Result-version caching

Published finalized results may cache strongly by immutable version.

⸻

108. Invalidation contract

Every cache documents invalidating domain events.

⸻

Part XXVI

Realtime architecture

109. Realtime only where useful

Use for:

* Live show state
* voting transitions
* critical task completion
* result publication
* incidents
* relevant concurrency

⸻

110. Static archives

Use normal cached reads.

Do not open realtime subscriptions for historical pages merely because realtime exists.

⸻

111. Subscription ownership

One shared subscription per relevant scope where feasible.

Avoid duplicate page-component subscriptions.

⸻

Part XXVII

Background jobs

112. Job registry

type SystemJobDefinition = {
  id: string;
  purpose: string;
  trigger:
    | "event"
    | "schedule"
    | "manual";
  idempotent: boolean;
  retryPolicy: string;
  maximumAttempts: number;
  timeout: number;
  owner: string;
  impactClass: string;
};

⸻

113. Examples

notification fanout
deadline reminders
scheduled publication
search-index update
projection reconciliation
result-analysis recompute
retention cleanup

⸻

114. Job leases

Prevent duplicate concurrent workers processing same job where that would be harmful.

⸻

115. Poison jobs

Repeatedly failing job eventually enters:

dead_letter

or equivalent visible failed state.

Do not retry forever.

⸻

116. Failed job impact

System Health presents business impact first.

Example:

Jury reminders failed for 8 delegations

not:

worker-fanout-381 failed

⸻

Part XXVIII

Observability architecture

117. Three telemetry pillars

Capture:

* logs
* metrics
* traces

OpenTelemetry defines observability around telemetry such as traces, metrics and logs and provides a vendor-neutral instrumentation model. (OpenTelemetry)

⸻

118. Correlation identity

Every request receives:

request_id

Consequential operation receives:

operation_id
correlation_id

Propagate through:

browser
→ Cloudflare
→ server handler
→ database command
→ outbox
→ background job
→ notification

⸻

119. Structured logs

Prefer fields:

{
  timestamp,
  level,
  service,
  environment,
  requestId,
  correlationId,
  operationId,
  userIdHash?,
  editionId?,
  showId?,
  event,
  durationMs,
  outcome,
  errorClass?
}

⸻

120. Never log secrets

Exclude:

* tokens
* passwords
* recovery codes
* service keys
* private ballot payloads unless deliberately redacted
* sensitive evidence

⸻

121. Cloudflare observability

Use Cloudflare Worker metrics/logging for:

* request count
* success/error
* runtime failures
* latency investigation

Cloudflare exposes Worker request/error metrics and observability tooling for logs, traces and alerts. (Cloudflare Docs)

⸻

122. Sampling

High-volume routine logs may be sampled.

Never sample away critical:

* failed official submission
* result publication
* permission grant
* security event
* incident command

without retaining another durable system record.

⸻

Part XXIX

Metrics

123. Technical metrics

Track:

request volume
error rate
latency
database latency
query count
background queue depth
job failures
realtime disconnects
cache hit rate
storage failures

⸻

124. Domain metrics

Track:

confirmation submission success
entry submission success
jury submission success
televote submission success
result finalization success
publication success
notification delivery success

⸻

125. Integrity metrics

Track:

duplicate operation prevented
stale write rejected
authorization denial
projection mismatch
reconciliation repair
dead task found

⸻

Part XXX

Tracing

126. Trace critical commands

Example trace:

televote.submit
├─ authenticate
├─ resolve capability
├─ load round
├─ validate eligibility
├─ validate ballot
├─ idempotency lookup
├─ transaction
│  ├─ insert ballot
│  ├─ operation record
│  └─ outbox event
├─ projection invalidation
└─ response

⸻
127. Slow trace diagnosis

Trace should identify whether latency comes from:

* Worker
* Supabase network
* query
* storage
* external service
* job queue

⸻

Part XXXI

Error taxonomy

128. System error classes

Standardize:

AUTHENTICATION
AUTHORIZATION
VALIDATION
STATE_CHANGED
VERSION_CONFLICT
IDEMPOTENCY_CONFLICT
RATE_LIMIT
DEPENDENCY_FAILURE
DATABASE
STORAGE
TIMEOUT
UNKNOWN

⸻

129. User-facing translation

Technical errors map to safe product messages.

Example:

VERSION_CONFLICT

→

This entry changed while you were editing it.
Review the latest version before continuing.

⸻

Part XXXII

Service Level Indicators

130. Define SLIs before SLOs

Measure actual user outcomes.

Examples:

Submission availability

Successful authoritative submissions / valid submission attempts.

Submission latency

Time from final user submit to definitive accepted/rejected response.

Read availability

Successful core page/API responses / valid requests.

Freshness

Age of critical operational projection relative to canonical event.

⸻

131. Do not use uptime alone

A server returning HTTP 200 while jury submissions fail is not healthy.

⸻

Part XXXIII

Initial SLO framework

132. SLO philosophy

Google SRE recommends explicit SLOs and error budgets so reliability decisions are driven by measurable user experience rather than vague impressions. (Google SRE)

Solaris should establish starter SLOs, then adjust from actual measured behavior.

⸻

133. Suggested starter availability classes

Class A: contest-critical

Examples:

jury submission
televote
result finalization/publication
authentication during active contest

Initial target:

≥ 99.9% successful valid operations
during relevant operational windows

⸻

134. Class B: participation-critical

Examples:

confirmation
entry
media

Initial target:

≥ 99.5%

over defined measurement windows.

⸻

135. Class C: discovery

Examples:

Explore
archive
wiki
analytics

Initial target may be lower than official submission systems.

Do not spend equal reliability budget on Archive Games and final voting.

⸻

136. Latency SLOs

Set independently.

Example starter goals:

critical command acknowledgement:
95th percentile < 1.5 s
common cached public projection:
95th percentile < 1 s server response target
background notification fanout:
within defined operational window

Actual values must be validated against production telemetry.

⸻

137. Correctness SLO

Critical official operations target effectively:

0 duplicate committed operations
0 silent lost successful operations
0 wrong-edition official mutations

Correctness is not something we budget casually.

⸻

Part XXXIV

Error budgets

138. Error budget

For availability SLO:

error budget = 100% - SLO

Google SRE uses error budgets to balance reliability and development velocity. (Google SRE)

⸻

139. Reliability freeze

If critical service materially exhausts error budget:

prioritize reliability work before continuing risky feature rollout.

⸻

140. Major incident rule

Any incident involving:

* corrupted official results
* lost official ballot
* unauthorized private access
* duplicate canonical submission

requires post-incident analysis regardless of aggregate budget.

⸻

Part XXXV

Alerting

141. Alerts must be actionable

Alert on:

* user impact
* integrity risk
* sustained degradation

not every technical hiccup.

⸻

142. Critical alerts

Examples:

critical submission error rate spike
result publication mismatch
database unavailable
auth failure spike
production egress anomaly
notification queue unable to drain during deadline

⸻

143. Warning alerts

Examples:

projection lag rising
cache hit rate collapsed
realtime reconnect rate elevated
job retry rate elevated

⸻

144. Alert dedupe

One underlying incident should not create thirty independent alarms.

⸻

Part XXXVI

System Health integration

145. Organizer System Health consumes observability

Technical health and domain health combine.

Example:

Voting
DEGRADED
Impact:
Public ballots delayed.
Technical:
Supabase write latency elevated.

⸻

146. Hide noise from ordinary organizer

Organizer sees actionable system state.

Deep diagnostics remain Advanced.

⸻

Part XXXVII

Incident linkage

147. Alert → incident

High-severity alert offers:

Declare incident

with affected-system context prefilled.

⸻

148. Incident → telemetry

Incident page links:

* metrics
* relevant logs
* traces
* failed operations
* deployment version

⸻

149. Incident timeline

Automatically include system events such as:

first elevated error
deployment
feature flag change
mitigation
recovery

when safely available.

⸻

Part XXXVIII

Deployment observability

150. Every production deployment has identity

Track:

commit SHA
build ID
deployment time
feature flags
schema compatibility version

⸻

151. Error correlation

Telemetry must identify deployment SHA/version.

⸻

152. Cloudflare deployment

Production runtime configuration belongs to Cloudflare.

Do not introduce Vercel assumptions into Solaris production architecture.

⸻

Part XXXIX

Capacity model

153. Create Capacity Budget

For every major system define expected:

normal load
contest-day load
peak load
hard safety limit

⸻

154. Capacity dimensions

At minimum:

* HTTP requests
* database requests
* Supabase egress
* database rows
* realtime connections
* storage
* media upload bandwidth
* notification sends
* search volume
* Cloudflare invocations
* log volume

⸻

155. Domain fan-out

Document operations with large fan-out.

Example:

result.publish

may affect:

* thousands of public users
* search
* Home
* notifications
* archive

Design fan-out asynchronously where appropriate.

⸻

156. Never calculate full public universe per request

Do not recompute:

* all country statistics
* all historical relationships
* all records

whenever one user opens Results.

⸻

Part XL

Supabase efficiency budgets

157. Query budget per screen

For core screens, establish query budget.

Example categories:

Home
Explore
Participate
Results
Organizer Overview
Live

⸻

158. Duplicate-fetch detector

Development instrumentation should identify repeated equivalent requests during one render/navigation.

⸻

159. Full-table restrictions

Code review should reject:

select("*")

against large operational domains when only summary columns are needed.

⸻

160. Realtime budget

Track:

active subscriptions per client

Shared subscriptions preferred.

⸻

161. Egress budget

Monitor daily/monthly Supabase egress.

Warn well before quota exhaustion.

⸻

162. Egress spike response

Follow permanent project rule:

* stop automated offender
* identify caller
* disable offending workflow
* do not continue high-volume testing
* verify traffic returns to normal

The existing infrastructure instructions explicitly treat uncontrolled automated production traffic as a release-blocking defect.

⸻

Part XLI

Log-volume budget

163. Logs are also resources

Cloudflare logging has ingestion/retention limits depending on plan, so instrumentation must be useful rather than dumping gigantic payloads per request. (Cloudflare Docs)

⸻

164. No payload dumping

Do not log whole:

* entry submissions
* ballots
* result datasets
* JWTs
* media metadata blobs

for every request.

⸻

Part XLII

Performance system

165. Frontend field metrics

Maintain Public V3:

LCP
INP
CLS

plus:

route transition latency
command acknowledgement latency

⸻

166. Backend latency

Track percentiles:

p50
p95
p99

for critical endpoints.

⸻

167. Performance regression gate

Release candidate compared to baseline.

Investigate significant regression before release.

⸻

Part XLIII

Backup architecture

168. Backups are not recovery until restore is proven

NIST contingency guidance emphasizes recovery strategies plus testing, exercises and maintenance, not merely possessing backup files. (NIST Computer Security Resource Center)

⸻

169. Data criticality classification

Class 0: irreplaceable official truth

Examples:

official ballots
finalized results
published rule versions
audit
membership/access history

Class 1: important reconstructible data

Examples:

receipts
tasks
notification records

Class 2: derived/rebuildable

Examples:

search index
projections
analytics cache

Class 3: disposable

Temporary cache.

⸻

170. Backup inventory

Document coverage for:

* PostgreSQL
* Storage/media
* configuration
* deployment source
* critical secrets recovery process
* feature flag configuration

⸻

171. Recovery point objective

Define RPO by class.

Starter target proposal:

Class 0:
RPO as close to zero as available architecture reasonably supports
Class 1:
≤ 1 hour target
Class 2:
rebuildable

Validate against available Supabase plan capabilities before promising these externally.

⸻

172. Recovery time objective

Define RTO.

Starter internal target:

critical contest operation:
restore or safe fallback within a few hours
noncritical archive/analytics:
longer acceptable

Actual target depends on available infrastructure.

⸻

Part XLIV

Restore runbook

173. Create restore documentation

docs/runbooks/database-restore.md
docs/runbooks/storage-restore.md
docs/runbooks/full-service-recovery.md

⸻

174. Restore process includes

1. declare recovery incident
2. freeze dangerous writes
3. identify recovery point
4. restore isolated copy
5. validate integrity
6. reconcile external/storage state
7. verify canonical invariants
8. cut over
9. verify
10. close incident

⸻

175. Never rehearse destructive restore against production

Restore exercises use isolated infrastructure.

⸻

176. Restore verification

After restore validate:

row counts
foreign keys
active edition
critical participants
ballot totals
result hashes
publication pointers
receipts

⸻

Part XLV

Disaster recovery drills

177. Schedule restore rehearsal

At least before major V3 release and periodically thereafter.

⸻

178. Drill scenarios

Database loss

Media/storage corruption

Incorrect migration

Results publication corruption

Account/permission corruption

⸻

179. Recovery evidence

Store:

date
snapshot
RPO achieved
RTO achieved
issues found
follow-up actions

⸻

Part XLVI

Degraded operation

180. Define graceful degradation

If noncritical service fails:

core contest operations should continue where technically possible.

⸻

181. Example: analytics outage

If Voting DNA fails:

do not break official Results.

⸻

182. Example: push outage

Participation tasks remain visible in app.

⸻

183. Example: search outage

Direct entity/public pages continue.

⸻

184. Example: realtime outage

Fallback to bounded refresh for critical state.

Clearly indicate freshness.

⸻

Part XLVII

Maintenance mode

185. Maintenance tiers

Partial

Disable affected feature.

Public maintenance

Public limited.

Organizer recovery remains.

Emergency

Minimal safe surfaces only.

⸻

186. Maintenance must not block recovery

Authorized organizers retain necessary recovery tools.

⸻

Part XLVIII

Schema evolution

187. Database migration doctrine

Prefer:

expand
→ backfill
→ dual-compatible period
→ switch readers/writers
→ validate
→ contract

instead of:

rename everything and deploy simultaneously

⸻

188. Additive-first migration

Example:

1. add new column nullable
2. deploy writers
3. backfill
4. deploy readers
5. validate
6. add stronger constraint
7. retire legacy field

⸻

189. Constraint rollout

For large existing tables, consider staged validation strategies where appropriate.

PostgreSQL supports adding certain constraints without immediately validating all existing rows, then validating afterwards, which can reduce operational impact during migration. (PostgreSQL)

⸻

Part XLIX

Backfills

190. Every backfill is resumable

Store progress/cursor.

⸻

191. Backfills are bounded

Batch.

Sleep/yield where necessary.

Monitor:

* database load
* egress
* errors

⸻

192. Idempotent backfill

Rerunning should not corrupt already migrated rows.

⸻

193. Backfill validation

Compare:

expected
actual
missing
duplicates

before cutover.

⸻

Part L

Application/schema compatibility

194. Schema version

App bootstrap already carries schema version.

Use it.

⸻

195. Compatibility window

During rollout:

old client
new database

and:

new client
transitional database

must behave safely.

⸻

196. Old client rejection

If incompatibility becomes unavoidable:

show controlled update requirement.

Do not produce mysterious failures.

⸻

Part LI

Feature-flag integrity

197. Flag classification

presentation
workflow
security
data migration
emergency

⸻

198. Workflow flags

A workflow flag must not produce incompatible writes between cohorts.

⸻

199. Kill switch

Critical new workflow receives rollback/disable path.

⸻

200. Flag history

Record:

* actor
* before
* after
* time
* reason

for production-critical flags.

⸻

Part LII

Data migration verification

201. Migration rehearsal

Every destructive/nontrivial migration runs against isolated realistic data.

⸻

202. Rehearsal checks

Before:

baseline invariants

After:

new invariants
parity
row counts
critical workflow queries

⸻

203. Migration rollback

Document whether migration is:

reversible
forward-fix only

Do not pretend all schema migrations have safe downgrade paths.

⸻

Part LIII

Historical reproducibility

204. Historical version registry

Version anything required to reconstruct historical calculated output:

* voting config
* scoring formulas* Fantasy rules
* prediction scoring
* result algorithm
* country identity
* rulebook

⸻

205. Formula changes

New formula version applies prospectively unless deliberate historical recalculation is a product requirement.

⸻

Part LIV

Data retention

206. Retention classes

Define:

permanent historical
long-lived audit
account-lived
edition-lived
short operational
temporary

⸻

207. Retention jobs

Deletion/anonymisation jobs:

* idempotent
* auditable
* bounded
* scoped

⸻

208. Retention vs audit

Do not delete data required for legitimate contest/audit integrity merely because a UI no longer displays it.

Apply actual policy/legal requirements during implementation.

⸻

Part LV

Privacy boundaries

209. Data classification

PUBLIC
ACCOUNT_PRIVATE
DELEGATION_PRIVATE
ORGANIZER_INTERNAL
SENSITIVE
SEALED

⸻

210. Projection classification

Every projection declares maximum sensitivity class it may contain.

⸻

211. Logging classification

Sensitive/Sealed content excluded or redacted from routine logs.

⸻

Part LVI

Full contest state machine integration

212. Do not create one giant linear edition state

Preserve orthogonal V3 domains.

⸻

213. Cross-domain prerequisites

Define dependency graph separately.

Example:

result.finalize
requires:
jury finalized
AND televote finalized
AND config frozen
AND integrity blockers = 0

⸻

214. Dependencies are server rules

UI merely explains them.

⸻

Part LVII

System dependency graph

215. Create machine-readable dependency registry

type WorkflowDependency = {
  operation: string;
  requires: DependencyCondition[];
  blocks: string[];
  produces: string[];
};

⸻

216. Example entry publication

public entry
requires:
entry verified
AND required media accepted
AND publication state public

⸻

217. Example jury close

jury close
requires:
round currently open
AND actor permitted
AND no active close operation

Missing ballots may be advisory/blocking depending on rules.

⸻

Part LVIII

Public ↔ Organizer consistency

218. Shared facts

The following must never have separate implementations by side:

edition state
show state
deadlines
entry status
jury status
televote state
result version
publication status
membership
capabilities

⸻

219. Shared domain types

Create common typed package/module for domain contracts.

Avoid duplicate public/admin enums.

⸻

220. Projection differences are presentation-specific

Organizer may see:

4 jury ballots missing

Public user sees:

Jury voting open

Same canonical round.

Different projection.

⸻

Part LIX

Cross-side tests

221. Organizer → participant

Test:

request entry correction
→ participant task

⸻

222. Participant → organizer

Test:

resubmit entry
→ organizer review queue

⸻

223. Organizer → public

Test:

publish results
→ public result becomes visible

⸻

224. Public action → organizer

Test:

public televote ballots
→ Organizer accepted count updates

⸻

Part LX

Notification cross-side tests

225. Entry correction

Verify:

organizer command
task creation
notification
deep link
resubmission
organizer queue
resolution

as one test.

⸻

Part LXI

Live cross-side consistency

226. Show state

When Organizer changes manual show state:

Public Live and Organizer Live receive same versioned state.

⸻

227. Vote open

Organizer opens televote.

Within defined freshness window:

* public CTA becomes available
* Home updates
* Live updates

⸻

228. Vote close

Public submission after canonical close is rejected regardless of stale UI.

⸻

Part LXII

Whole-edition rehearsal dataset

229. Build canonical local seed

Create realistic full contest:

1 edition
66 delegations
multiple shows
entries/media
confirmation rounds
jury
televote
results
stories
rules
fan users
organizers

⸻

230. Seed must remain bounded

Enough to expose scale behavior.

Not a production clone.

⸻

231. Deterministic seed

Same input produces predictable IDs/data where useful for tests.

⸻

Part LXIII

Full contest rehearsal

232. Stage 1 — setup

Test:

create edition
configure show structure
configure rules
configure voting
configure publication

⸻

233. Stage 2 — delegation onboarding

memberships
HOD access
confirmation requirements
notifications

⸻

234. Stage 3 — confirmations

Multiple countries:

* submit
* decline where supported
* correction
* reopen
* late/closed path

⸻

235. Stage 4 — entries

Include:

* valid
* invalid duration
* media replacement
* concurrent edit
* resubmission
* withdrawal

⸻

236. Stage 5 — running orders

Allocate.

Publish.

Verify public show.

⸻

237. Stage 6 — jury

Include:

* complete ballots
* missing ballots
* invalid attempt
* own-country violation
* multi-device conflict

⸻

238. Stage 7 — public voting

Include:

* valid voters
* duplicate attempt
* deadline extension
* network uncertainty
* integrity signal

⸻

239. Stage 8 — results

Calculate.

Validate.

Resolve integrity.

Finalize.

⸻

240. Stage 9 — publication

Publish.

Verify all public surfaces reference exact finalized result version.

⸻

241. Stage 10 — archive

Complete edition.

Verify:

* current CTAs disappear
* history remains
* results reproducible
* receipts retained

⸻

Part LXIV

Full-contest invariant checks

242. Confirmation

No effective duplicate requirements.

⸻

243. Entry

Every verified entry references a valid revision.

⸻

244. Media

Every published required media reference points to accepted asset revision.

⸻

245. Jury

No duplicate final ballot per delegation/round.

⸻

246. Televote

No duplicate canonical ballot beyond configured rules.

⸻

247. Result

Recalculation from referenced inputs equals finalized output.

⸻

248. Publication

Public result pointer equals finalized version.

⸻

249. Tasks

No actionable task contradicts canonical state.

⸻

250. Notifications

No active actionable notification points to impossible state without reconciliation path.

⸻

Part LXV

Failure-injection rehearsal

251. Kill network after commit

Test all critical mutations.

⸻

252. Database timeout before commit

Operation must fail safely.

⸻

253. Duplicate request

One canonical result.

⸻

254. Job worker crash

Outbox remains recoverable.

⸻

255. Realtime disconnect

Authoritative refresh restores truth.

⸻

256. Stale client

Server rejects invalid old action.

⸻

257. Two organizers

Concurrency conflict controlled.

⸻

258. Supabase outage

Client surfaces degraded state.

No fake success.

⸻

Part LXVI

Security verification

259. Authorization matrix tests

Generate tests from capabilities.

For each protected action:

allowed actor succeeds
disallowed actor denied
wrong scope denied

⸻

260. IDOR tests

Change IDs manually.

No cross-user/delegation/edition access.

⸻

261. Property exposure

Snapshot public payload schemas.

Fail if sensitive property appears.

⸻

262. Rate-limit tests

Use isolated environments.

Never load-test production.

⸻

263. Upload abuse tests

Test:

* oversized
* wrong content type
* malformed
* unauthorized target

⸻

Part LXVII

Observability verification

264. Traceability test

Given receipt:

receipt
→ operation
→ correlation ID
→ command logs
→ domain events
→ downstream jobs

must be possible for authorized debugging.

⸻

265. Error reproduction

Critical known errors should emit enough structured context to diagnose without private payload dumping.

⸻

Part LXVIII

Backup verification

266. Backup existence check

Monitor last successful backup/recovery point where provider capabilities expose it.

⸻

267. Restore drill gate

Before V3 final release:

perform isolated restore rehearsal.

⸻

Part LXIX

Capacity rehearsal

268. No production load test

Use isolated environment/synthetic architecture.

⸻

269. Critical peak scenarios

Model:

show starts
thousands refresh Live
televote opens
burst of submissions
results publish
large synchronized traffic spike

⸻

270. Capacity test outputs

Record:

request throughput
p95/p99
database load
error rate
egress
queue depth

⸻

Part LXX

Cloudflare-specific production validation

271. Worker health

Check:

* request success
* runtime errors
* execution/resource errors

Cloudflare Workers exposes these categories through its metrics. (Cloudflare Docs)

⸻

272. Logs

Enable appropriate production observability and sampling configuration.

Use real-time logs for diagnosis, not permanent manual monitoring. Cloudflare provides Worker logs and near-real-time log inspection for deployed Workers. (Cloudflare Docs)

⸻

273. Alerts

Configure high-value production alerts rather than depending on a human staring at dashboards.

⸻

Part LXXI

Supabase production isolation

274. Absolute CI rule

No automated testing traffic against production Supabase.

Existing project instructions explicitly require local/loopback Supabase for CI and browser testing and require tests to fail rather than fall back to hosted production.

⸻

275. Environment validator

Run before any automated workflow:

validateTestBackend()

Reject:

*.supabase.co

and every other known hosted production endpoint.

⸻

276. Future clients

Guard is not hardcoded only to current env var names.

New Supabase integrations must register with validator.

⸻

277. Production secrets

Do not expose production credentials to normal CI.

⸻

Part LXXII

Release candidate construction

278. Release candidate SHA

Freeze exact candidate SHA after implementation batch.

⸻

279. Migration set

Record exact migration versions expected by candidate.

⸻

280. Feature flags

Record intended production flag state.

⸻

281. Schema compatibility

Verify deployed application can safely operate against target production schema.

⸻

Part LXXIII

Release verification layers

282. Layer 1 — static

lint
typecheck
build
dependency checks
capability registry
domain registry

⸻

283. Layer 2 — unit

state machines
calculations
projection logic
task derivation
authorization helpers

⸻

284. Layer 3 — database

constraints
RLS
transactions
idempotency
migration rehearsal

⸻

285. Layer 4 — contract

Public projections
Organizer projections
Commands
Events
Receipts
Errors

⸻

286. Layer 5 — integration

Cross-system flows.

⸻

287. Layer 6 — browser

Small critical scenario set.

⸻

288. Layer 7 — accessibility

Automated + representative manual.

⸻

289. Layer 8 — full contest rehearsal

Required.

⸻

290. Layer 9 — recovery

Restore rehearsal and operation reconciliation.

⸻

Part LXXIV

Release evidence manifest

291. Generate release evidence

type ReleaseEvidence = {
  commitSha: string;
  migrations: string[];
  featureFlags: Record<string, unknown>;
  checks: ReleaseCheck[];
  capabilityParity: boolean;
  domainRegistryValid: boolean;
  consequenceRegistryValid: boolean;
  restoreRehearsalId?: string;
  fullContestRehearsalId?: string;
  generatedAt: string;
};

⸻

292. Evidence is immutable artifact

Store with release.

⸻

293. Earlier SHA evidence does not count

If final commit changes:

rerun required gates affected by the change.

⸻

Part LXXV

Production preflight

294. Before production release verify

production schema target
Cloudflare configuration
Supabase production endpoint
feature flags
migration order
backup/recovery point
observability
critical alerts
rollback/kill switches

⸻

Part LXXVI

Production smoke test

295. Production smoke is tiny

Only if necessary.

Permanent Solaris infrastructure rules require production smoke tests to be deliberately bounded, not page crawls, viewport matrices or loops across contest datasets.

⸻

296. Smoke budget

Document maximum:

requests
writes
duration

before running.

⸻

Part LXXVII

Rollback

297. Application rollback

Cloudflare deployment rollback path documented/tested.

⸻

298. Feature rollback

Prefer kill switch for new workflow.

⸻

299. Data rollback

Do not assume reverting application code reverses database changes.

Migration plan declares:

backward compatible
requires forward fix

⸻

300. Partial rollback

Possible architecture:

new UI off
new schema remains compatible
legacy UI restored

⸻

Part LXXVIII

Post-release monitoring

301. Enhanced observation window

After major cutover monitor:

* errors
* latency
* command success
* database
* egress
* queue failures
* auth
* realtime

⸻

302. Compare baseline

Compare candidate to previous stable release.

⸻

303. Automatic rollback trigger

For selected severe technical regressions, define threshold requiring immediate kill switch/rollback.

Human confirmation may remain for complex cases.

⸻

Part LXXIX

Data correctness probes
304. Lightweight production correctness probes

Where safe, run bounded invariant queries.

Examples:

active duplicate confirmation requirements = 0
published result without finalized version = 0
verified entry without revision = 0

Avoid large scans.

⸻

Part LXXX

System audit report

305. Generate V3 integrity report

Before final release:

Canonical domains: PASS
Database invariants: PASS
Cross-system consequences: PASS
Authorization: PASS
Idempotency: PASS
Reconciliation: PASS
Observability: PASS
SLO monitoring: PASS
Backup/restore: PASS
Capacity: PASS
Migration: PASS
Production isolation: PASS
Full contest rehearsal: PASS

⸻

Part LXXXI

Implementation phases

306. Phase S0 — system discovery

Inventory:

* canonical tables
* duplicate state
* RPC/functions
* direct browser mutations
* background jobs
* notifications
* external integrations
* realtime channels
* auth policies
* RLS
* caches

⸻

307. Phase S0 exit gate

Every important domain receives registry owner.

Unknown canonical ownership = release blocker.

⸻

308. Phase S1 — domain registry

Implement machine-readable:

system-domain-registry
workflow-dependency-registry
domain-consequence-registry

⸻

309. Phase S2 — operation infrastructure

Implement:

* operation IDs
* correlation IDs
* command envelope
* idempotency store
* receipt relationship
* standard error taxonomy

⸻

310. Phase S3 — database invariants

Add safe migrations for:

* uniqueness
* referential integrity
* nullability
* state constraints
* indexes

where domain analysis confirms correctness.

⸻

311. S3 migration rule

Do not add potentially breaking constraints before auditing existing production data.

Sequence:

audit
repair
add non-valid/staged constraint where appropriate
validate
enforce

⸻

312. Phase S4 — domain events/outbox

Create:

* event schema
* outbox
* consumer framework
* processing leases
* retry/dead-letter handling

⸻

313. Phase S5 — cross-system consequence migration

Migrate hidden frontend side effects into explicit consumers.

Priority:

1. confirmation
2. entry/media
3. jury
4. televote
5. results/publication
6. notifications
7. membership/access
8. engagement

⸻

314. Phase S6 — projections/reconciliation

For every core projection:

* invalidation
* rebuild
* verification
* lag metric

⸻

315. Phase S7 — authorization hardening

Implement generated capability/object tests.

Audit RLS.

Audit public payloads.

⸻

316. Phase S8 — abuse/resource protection

Implement:

* rate limits
* maximum batch size
* upload ceilings
* expensive query limits
* retry limits

⸻

317. Phase S9 — observability

Implement:

* correlation
* structured logs
* metrics
* traces
* deployment tagging
* error reporting

⸻

318. Phase S10 — SLOs/alerts

Start with measured baselines.

Configure:

* critical SLIs
* SLO targets
* alert thresholds
* error budget dashboard

⸻

319. Phase S11 — recovery

Document and test:

* database restore
* storage recovery
* deployment rollback
* full-system recovery

⸻

320. Phase S12 — capacity

Create synthetic/local peak tests.

Optimize.

⸻

321. Phase S13 — migration hardening

Apply:

* compatibility versioning
* safe schema rollout
* backfill framework
* parity validation

⸻

322. Phase S14 — full-contest rehearsal

Run complete seeded edition.

⸻

323. Phase S15 — zero-orphan system audit

Re-scan:

* domains
* commands
* jobs
* notifications
* integrations
* projections

No unknown system behavior.

⸻

324. Phase S16 — final release certification

Generate exact-SHA evidence.

⸻

Part LXXXII

Priority order

325. Critical-first rule

Do not spend early system-integrity work optimizing:

Taste DNA animation

while:

jury submission

still has ambiguous consistency.

Priority:

identity/access
official participation
voting
results
publication
notifications
live
then noncritical engagement

⸻

Part LXXXIII

PR architecture

326. Avoid giant PR

Suggested architectural PR sequence:

PR S1
registries + tests
PR S2
operation/idempotency infrastructure
PR S3
core DB invariants
PR S4
event/outbox infrastructure
PR S5
confirmation consequences
PR S6
entry/media consequences
PR S7
jury/televote consequences
PR S8
results/publication
PR S9
authorization/security
PR S10
observability
PR S11
recovery/capacity
PR S12
full rehearsal + certification

Actual numbering may differ.

⸻

327. Each PR must preserve deployability

Main should remain production-safe.

⸻

Part LXXXIV

Definition of Done for a system domain

328. Domain DoD

Each domain must have:

canonical owner ✓
schema ✓
constraints ✓
commands ✓
authorization ✓
state machine ✓
idempotency ✓
versioning ✓
events ✓
consequence map ✓
projections ✓
tasks ✓
notifications ✓
audit ✓
reconciliation ✓
metrics ✓
alerts where needed ✓
retention ✓
backup classification ✓
tests ✓

⸻

Part LXXXV

Definition of Done for a command

329. Command DoD

Every consequential command:

server authoritative ✓
authenticates actor ✓
checks capability ✓
checks object/scope ✓
validates state ✓
checks expected version ✓
idempotent ✓
atomic where required ✓
emits events ✓
creates operation record ✓
returns receipt/status ✓
observable ✓
failure-tested ✓

⸻

Part LXXXVI

Definition of Done for an event

330. Event DoD

schema versioned ✓
semantic name ✓
payload minimal ✓
operation link ✓
consumers registered ✓
consumer idempotency ✓
replay/rebuild implications understood ✓
monitoring ✓

⸻

Part LXXXVII

Definition of Done for a projection

331. Projection DoD

canonical sources known ✓
authorization boundary ✓
invalidating events ✓
cache policy ✓
freshness class ✓
stateVersion ✓
rebuild path ✓
query budget ✓
no private leakage ✓
contract tests ✓

⸻

Part LXXXVIII

Definition of Done for a job

332. Job DoD

purpose ✓
trigger ✓
idempotency ✓
lease/concurrency ✓
timeout ✓
retry policy ✓
max attempts ✓
failure state ✓
business impact ✓
metrics ✓
manual retry ✓

⸻

Part LXXXIX

Definition of Done for an integration

333. Integration DoD

owner ✓
auth ✓
timeout ✓
validation ✓
retry ✓
failure behavior ✓
rate/resource limits ✓
observability ✓
secret handling ✓
degraded mode ✓

⸻

Part XC

System acceptance scenarios

334. Scenario 1 — entry correction loop

Organizer requests change.

Participant receives correct task.

Participant resubmits.

Organizer sees resubmission.

Organizer verifies.

All tasks clear.

Public state follows publication policy.

One continuous operation history exists.

⸻

335. Scenario 2 — lost submission response

Participant submits jury ballot.

Server commits.

Network response lost.

Participant reconnects.

Receipt recovered.

Organizer count reflects ballot.

No duplicate ballot.

⸻

336. Scenario 3 — wrong edition

Organizer with SSC22 open attempts stale SSC21 operation.

Server rejects due to scope/state.

No mutation occurs.

⸻

337. Scenario 4 — concurrent entry review

Organizer A reviewing revision 4.

Participant submits revision 5.

Organizer A attempts decision.

Server rejects stale decision.

Organizer sees revision change.

⸻

338. Scenario 5 — public result publication

Result R7 finalized.

Organizer publishes.

Every public consumer displays R7.

Search does not expose R6 as current.

Notification links to R7.

⸻

339. Scenario 6 — result correction

R7 published.

Correction required.

R8 created/finalized.

Publication intentionally switched to R8.

R7 remains historical.

⸻

340. Scenario 7 — queue crash

Result publication event committed.

Notification worker crashes.

Public result remains published.

Outbox retries.

Notification eventually sends once.

⸻

341. Scenario 8 — Supabase degradation

Writes begin timing out.

Submission UI does not falsely confirm.

System Health degrades.

Operations can reconcile.

⸻

342. Scenario 9 — privilege revocation

HOD loses membership while entry editor open.

Next protected save rejected.

ViewerContext refreshes.

Private data removed from future projections.

⸻

343. Scenario 10 — malicious ID

User changes entry ID in request.

Object-level authorization rejects.

⸻

344. Scenario 11 — duplicate click

User taps Submit repeatedly.

One canonical operation.

One receipt.

⸻

345. Scenario 12 — results traffic spike

Publication causes traffic burst.

Cached immutable result serves efficiently.

Core backend remains healthy.

⸻

346. Scenario 13 — backup restore

Restore isolated backup.

Official result and ballot invariants pass.

Recovery evidence recorded.

⸻

347. Scenario 14 — old PWA client

Old client resumes after schema migration.

Compatibility preserved or controlled update presented.

No data corruption.

⸻

Part XCI

Final release gates

348. Canonical ownership gate

Every domain registered.

No competing undocumented owner.

⸻

349. Database integrity gate

Critical invariants enforced and migration rehearsed.

⸻

350. Command integrity gate

No Tier 2–4/official mutation bypasses authoritative command path without documented exception.

⸻

351. Idempotency gate

Every critical operation passes duplicate/reconciliation tests.

⸻

352. Event gate

Every consequential event mapped to downstream effects.

⸻

353. Projection gate

Every critical projection has:

* source
* freshness
* invalidation
* rebuild

⸻

354. Cross-side consistency gate

Participant/Public and Organizer display compatible views of same canonical state.

⸻

355. Authorization gate

Object-, property- and function-level authorization tests pass.

⸻

356. Abuse gate

Critical flows have appropriate rate/resource protection.

⸻

357. Observability gate

Critical operation can be traced from request/receipt through system processing.

⸻

358. SLO gate

Critical SLIs collected.

Initial SLOs documented.

Alerts functional.

⸻

359. Recovery gate

Isolated restore rehearsal passes.

⸻

360. Capacity gate

Peak scenarios tested without production load generation.

⸻

361. Migration gate

Schema/data migration rehearsals pass.

⸻

362. Egress gate

Automated testing proven isolated from production Supabase.

⸻

363. Full-edition gate

Complete SSC rehearsal succeeds from setup through archive.

⸻

364. Capability gate

Public and Organizer capability registries contain no unknowns.

⸻

365. Exact-SHA gate

Every release-critical result corresponds to exact final candidate commit.

⸻

Part XCII

V3 master certification

366. Required final evidence

Core blueprint compliance
PASS
Public capability parity
PASS
Organizer capability parity
PASS
System domain ownership
PASS
Database invariants
PASS
Cross-system consequence matrix
PASS
Critical commands
PASS
Idempotency
PASS
Concurrency
PASS
Authorization
PASS
Privacy
PASS
Abuse protection
PASS
Observability
PASS
SLO instrumentation
PASS
Recovery rehearsal
PASS
Capacity rehearsal
PASS
Migration rehearsal
PASS
Accessibility
PASS
Responsive workflows
PASS
Full contest rehearsal
PASS
Production Supabase isolation
PASS
Exact release SHA
PASS

⸻

Part XCIII

Conditions that prohibit “V3 complete”

367. V3 is not complete if

Any of these remains true:

unknown public capability
unknown admin capability
domain with unclear canonical owner
critical direct browser mutation
duplicate workflow truth
unreconciled ambiguous submission
critical command without idempotency
state transition only protected by UI
private data in public projection
unbounded background retry
unobserved critical workflow
backup never restore-tested
migration not rehearsed
full contest never rehearsed
browser/CI capable of production Supabase access
final evidence belongs to older SHA

⸻

Part XCIV

Final architecture

368. The complete V3 system model

                    SOLARIS STUDIO V3
                         USER
                          │
               ┌──────────┴──────────┐
               │                     │
          PUBLIC / PARTICIPANT   ORGANIZER
               │                     │
               └──────────┬──────────┘
                          │
                    VIEWER / ACTOR
                       CONTEXT
                          │
                    PROJECTIONS
                          │
                 CANONICAL DOMAINS
                          │
                 SERVER COMMANDS
                          │
             AUTH + SCOPE + STATE
                          │
              TRANSACTION / LOCK
                          │
          ┌───────────────┼───────────────┐
          │               │               │
     CANONICAL DATA   OPERATION       OUTBOX EVENT
          │            RECEIPT             │
          │                                │
          │                         DOMAIN EVENTS
          │                                │
          └──────────────┬─────────────────┘
                         │
              CONSEQUENCE PROCESSING
                         │
       ┌─────────────────┼──────────────────┐
       │                 │                  │
    TASKS          NOTIFICATIONS       PROJECTIONS
       │                 │                  │
       └─────────────────┼──────────────────┘
                         │
                    REALTIME /
                    INVALIDATION
                         │
                    USER STATE

⸻

369. Observability surrounds the system

Every layer emits:

metrics
logs
traces
operation identity

without exposing secrets.

⸻

370. Recovery surrounds the system

Every irreplaceable domain has:

backup
restore path
reconciliation
rehearsal

⸻

371. Security surrounds the system

Every access crosses:

authentication
authorization
scope
domain-state validation

⸻

372. Efficiency surrounds the system

Every subsystem operates under:

query budget
egress budget
capacity budget
retry budget
cache policy

⸻

Part XCV

Final implementation order across all V3 documents

373. Combined V3 program

The recommended complete implementation sequence becomes:

1. Capability discovery
   Public + Organizer
2. Canonical system domain audit
3. Shared V3 design foundations
4. ViewerContext + OrganizerContext
5. Command / idempotency / operation infrastructure
6. Database integrity hardening
7. Event/outbox/consequence infrastructure
8. Core focused projections
9. V3 shell
10. Home + Overview + Tasks
11. Confirmations
12. Entries + Media
13. Shows + Running Order
14. Jury
15. Televote
16. Results + Publication
17. Live + Broadcast
18. Notifications + Communications
19. Auth / Me / Delegation access
20. Explore + Search + entities
21. Advanced result tools
22. Fantasy / Predictions / engagement
23. Archive / Wiki / Stories / Anniversary
24. Governance / Platform / specialist Organizer tools
25. Security hardening
26. Observability + SLOs
27. Backup / restore
28. Capacity hardening
29. Legacy cutover
30. Capability re-scan
31. Full edition rehearsal
32. Final exact-SHA certification

Feature work may overlap where dependencies allow.

The architecture order must not be reversed merely because a cosmetic screen is easier to demonstrate.

⸻

Part XCVI

Definition of complete Solaris Studio V3
Solaris Studio V3 is complete only when:

Product completeness

Every real capability has explicit V3 ownership.

Canonical truth

Each domain has one authoritative source.

Data integrity

Impossible states are prevented as low in the stack as practical.

Mutation integrity

Consequential mutations are authoritative, version-aware and idempotent.

Cross-system integration

Every meaningful operation has documented and tested consequences.

Public/Organizer consistency

Both surfaces project the same canonical competition.

Security

Authorization is enforced at object, function and data boundaries.

Reliability

Critical workflows have measurable SLOs and safe error behavior.

Observability

Failures can be located without guessing which subsystem lied.

Recovery

Backups have been restored successfully in rehearsal.

Capacity

Contest-day spikes have been modeled and tested.

Migration

Schema and feature migrations are compatibility-aware and rehearsed.

Efficiency

Queries, realtime, storage, jobs and egress operate within explicit budgets.

Historical integrity

Official results and records remain reproducible.

Accessibility

Critical operation is usable without hidden modality traps.

Infrastructure safety

Automated systems cannot accidentally consume production Supabase.

Whole-system proof

A complete contest has successfully run through the isolated V3 rehearsal.

Release proof

All evidence belongs to the exact final candidate SHA.

⸻

Final system principle

The goal is not merely:

“Every Solaris feature works.”

The stronger requirement is:

Every Solaris feature participates correctly in one canonical system.

A participant submission changes organizer state.

An organizer decision changes participant responsibility.

A result finalization controls public publication.

A permission change immediately changes access.

A failed notification does not corrupt workflow truth.

A crashed job can resume.

A stale client cannot overwrite newer state.

A duplicated request cannot duplicate an official action.

A database constraint prevents classes of impossible data.

A production failure can be traced.

A backup can actually be restored.

And every release can prove those claims against the exact code being deployed.

Only then should Solaris Studio V3 be considered system-complete.

## Country Hero media contract

Reconciled from the archived 19 November Country/Edition source §§6–7; this section owns the media lifecycle, while DESIGN owns its editor and public composition. These are required contracts to qualify against existing code, not a claim that an API or schema is implemented.

- Reuse current `country_accounts` controller/capability authority, `country_profiles`, `country_media` and existing processing/storage services. No competing ownership table, upload authority or `current_hero_url` truth. Country identity is independent of current contest participation.
- Server checks actual type, dimensions, size and decodability. JPEG, PNG and WebP are required; HEIC is allowed only through a tested safe conversion. Animated GIF and SVG are not hero inputs. Strip EXIF/location metadata from published derivatives. Confirm publication rights and apply moderation rules.
- Around 1920×1080 is source-quality guidance and 15 MB was an illustrative proposed upload limit, not an approved infrastructure constant. Qualify and enforce actual limits server-side; give truthful client feedback. Generate bounded responsive derivatives in a trusted pipeline rather than delivering originals to every visitor.
- Lifecycle: local selection → private upload → processing → ready draft → preview → publishing → published, with rejected/failed/conflict/removed/fallback/moderated alternatives. Drafts and preview URLs remain private, including search and CDN surfaces.
- Publication rechecks actor, country, capability, ready asset, moderation and expected published revision atomically, uses stable idempotency where required and returns an auditable receipt. Preserve normalized focal point, alt/credit, contrast treatment, asset/version identity and revision. Read back the acknowledged published revision.
- Controller transfer immediately revokes former-controller private draft and publication access. A HoD title alone is not sufficient authority. Organizer moderation/forced fallback requires an explicit capability, reason and audit.
- Failure preserves the prior public revision. Replacement, removal, rollback and restore preserve history and audit. Use versioned asset URLs/bounded invalidation, not mass polling, and prevent withdrawn assets returning from cache.
- Hero changes do not rewrite edition identities, entries, results, membership or official World facts. Public readers expose only approved published revisions. Historical names, flags and records remain reproducible.
- Existing legacy media needs explicit mapping before migration. New schema/storage configuration and hosted migration remain separately authorized System operations.
