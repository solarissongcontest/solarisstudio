Solaris Studio App V3

Organizer Operational System

Complete Product, UX, Architecture, Data, Workflow, Migration, Testing & Release Specification

⸻

Status of this specification

This document is the implementation-ready Organizer extension to the canonical Solaris Studio V3 blueprint.

It does not replace the overall V3 product specification.

It expands and supersedes the less detailed Organizer-specific sections of the canonical blueprint wherever this document is more specific.

The following existing V3 principles remain authoritative:

* V3 is not a backend rewrite.
* Canonical domain state remains authoritative.
* UI projections are derived from canonical state.
* Organizer is a separate operational mode.
* Organizer navigation is Overview · Tasks · Control · Live · More.
* Edition and show context must always be explicit.
* Organizer actions use the V3 risk model.
* Critical mutations are server-authoritative, idempotent and receipted.
* Existing trustworthy workflows should be migrated rather than casually replaced.
* Automated testing must never generate traffic against production Supabase.

If this document conflicts with production-safety requirements, production safety wins.

⸻

Part I

Organizer product definition

1. What Organizer V3 is

Organizer V3 is the operational control system for Solaris Studio.

It is not:

* a collection of database editors
* a list of admin routes
* a desktop dashboard squeezed onto a phone
* a giant settings screen
* a collection of specialist tools presented with equal importance

Its purpose is to answer:

What is happening?

Current authoritative contest and operational state.

What requires intervention?

Problems, incomplete workflows, exceptions and approaching deadlines.

What should happen next?

The next valid organizer operation according to current state.

What happens if I perform that operation?

Consequences, affected entities, public impact and reversibility.

What already happened?

Immutable or versioned history, receipts and audit information.

⸻

2. Core Organizer promise

An organizer should not need to remember where a feature lives.

If Solaris knows that four jury ballots remain incomplete, the normal experience is:

4 jury ballots missing
Grand Final · closes in 2h 41m
Notify 4 delegations

not:

Admin → Voting → Jury → Final → Submission monitor → Filter incomplete

The specialist structure remains available for deliberate exploration.

Routine operational work should normally begin from the state requiring action.

⸻

3. Capability parity rule

V3 requires capability parity, not screen parity.

Every currently valid admin capability must receive exactly one migration classification:

REDESIGN

Capability remains first-class but gets a new workflow.

MERGE

Capability remains but becomes part of a larger coherent workspace.

CONTEXTUALIZE

Capability remains available but is usually reached from a relevant task, warning, object or advanced section.

RESTRICT

Capability remains but is visible only to users with relevant permissions.

RETIRE

Visible legacy surface is removed because its capability is duplicated or obsolete.

A route must never disappear without its capability being accounted for.

⸻

4. Organizer design doctrine

Every implementation decision should prefer:

Decision over navigation

State over settings

Exceptions over normality

Recognition over recall

Explanation over unexplained disablement

Scope over assumption

Review over generic confirmation

Receipt over ambiguous success

One clear next action over many equal buttons

Progressive disclosure over feature dumping

⸻

Part II

Canonical Organizer information architecture

5. Permanent primary navigation

Organizer uses five permanent destinations.

Overview

Purpose:

What needs my attention now?

Contains:

* operational status
* critical problems
* readiness
* upcoming deadlines
* recent meaningful changes
* next recommended action

⸻

Tasks

Purpose:

What work remains?

Contains:

* unresolved organizer actions
* blocking issues
* review work
* deadlines
* assigned items
* system-generated operational tasks

⸻

Control

Purpose:

Intentionally manage a contest system.

Contains logical workspaces, not every specialist route.

Root domains:

* Delegations
* Contest
* Voting
* Results & Publication
* Communications
* Production
* Governance where permitted

⸻

Live

Purpose:

Operate the active show.

Contains:

* show state
* now/next
* voting state
* results readiness
* live cues
* active incidents
* next operation

⸻

More

Purpose:

Low-frequency, specialist, historical and platform administration.

Contains permission-aware groups:

* Governance
* Platform
* Integrations
* Engagement
* Product QA
* System
* Historical tools

More must never become an unstructured dumping ground.

Any tool regularly required during ordinary contest operation should graduate into Control, Tasks or a contextual action.

⸻

6. Secondary navigation model

Workspaces may use local sections.

Example:

Voting
├─ Overview
├─ Jury
├─ Televote
├─ Integrity
├─ Results
└─ Advanced

Example:

Delegations
├─ Attention
├─ Countries
├─ Confirmations
├─ Access
└─ History

The same local structure must work across phone, tablet and desktop.

Phone may use:

* segmented controls
* horizontally scrollable section tabs
* drill-down rows
* sheets

Desktop may use:

* sidebar
* master-detail
* split panes

The conceptual structure remains identical.

⸻

Part III

Organizer context architecture

7. OrganizerContext

Create one canonical client/server context contract:

type OrganizerContext = {
  editionId: string | null;
  editionSlug: string | null;
  editionLabel: string | null;
  showId: string | null;
  showLabel: string | null;
  mode: "organizer";
  contextVersion: number;
};

The shell owns OrganizerContext.

Feature pages must not independently invent edition selection.

⸻

8. Context lock UI

Every edition-scoped organizer page displays:

SSC 22

Every show-scoped page displays:

SSC 22 · Grand Final

This context remains visible near the top of the viewport.

Critical confirmation sheets repeat context.

Example:

Close jury voting
SSC 22 · Grand Final

Never rely only on breadcrumb, URL or background color to communicate scope.

⸻

9. Edition switching

Edition switching must:

1. inspect unsaved local state
2. warn if meaningful unsaved work exists
3. cancel or close unfinished Tier 3/4 review flows
4. clear current show context
5. invalidate edition-scoped queries
6. establish new OrganizerContext
7. fetch authoritative OrganizerProjection
8. remain in equivalent workspace if valid

Example:

SSC22 · Voting · Jury
↓ switch edition
SSC23 · Voting · Jury

If equivalent destination does not exist:

SSC23 does not have Jury configured.

Then send user to Voting Overview.

⸻

10. Show switching

Show switch preserves domain workspace.

Example:

Grand Final · Televote
↓
Semi-final 1 · Televote

If target show lacks the feature:

* explain why
* show setup action if permitted
* never silently redirect to unrelated screens

⸻

Part IV

Organizer projection architecture

11. OrganizerProjection

Extend the canonical V3 Organizer projection.

Target contract:

type OrganizerProjection = {
  edition: OrganizerEditionSummary;
  activeShow?: OrganizerShowSummary;
  readiness: OrganizerReadiness;
  attention: OrganizerAttentionItem[];
  tasks: OrganizerTaskSummary[];
  upcoming: OrganizerUpcomingItem[];
  recentChanges: OrganizerRecentChange[];
  domains: {
    delegations: OrganizerDomainSummary;
    contest: OrganizerDomainSummary;
    voting: OrganizerDomainSummary;
    results: OrganizerDomainSummary;
    communications: OrganizerDomainSummary;
    production: OrganizerDomainSummary;
    governance?: OrganizerDomainSummary;
    system?: OrganizerDomainSummary;
  };
  systemHealth: OrganizerSystemHealthSummary;
  stateVersion: string | number;
  serverTime: string;
};

⸻

12. Domain summary contract

type OrganizerDomainSummary = {
  state:
    | "ready"
    | "attention"
    | "blocked"
    | "active"
    | "not_configured"
    | "complete";
  label: string;
  detail?: string;
  issueCount: number;
  blockingIssueCount: number;
  primaryRoute: string;
  recommendedAction?: OrganizerRecommendedAction;
};

Example:

{
  "state": "attention",
  "label": "Jury",
  "detail": "62 / 66 submitted",
  "issueCount": 4,
  "blockingIssueCount": 0,
  "primaryRoute": "/organizer/voting/jury",
  "recommendedAction": {
    "label": "Notify 4 delegations"
  }
}

⸻

13. Readiness model

Readiness must never be an unexplained percentage.

Target:

type OrganizerReadiness = {
  overall: number;
  blocking: ReadinessFactor[];
  incomplete: ReadinessFactor[];
  ready: ReadinessFactor[];
  calculatedAt: string;
  stateVersion: string | number;
};

Example:

Readiness 92%
Blocking
• 1 result integrity issue
Incomplete
• 4 jury ballots missing
• 1 media replacement awaiting review
Ready
• Entries
• Running order
• Broadcast

Selecting the percentage opens its explanation.

Never present a magical number without derivation.

⸻

14. Readiness computation

Readiness is deterministic.

Do not use generative AI to calculate readiness.

Domain rules define:

* blockers
* mandatory conditions
* advisory conditions
* completed conditions

AI may summarize the result.

AI must not decide whether official voting or publication is safe.

⸻

Part V

Action and Task architecture

15. OrganizerTask

type OrganizerTask = {
  id: string;
  kind: string;
  editionId: string;
  showId?: string;
  subjectType: string;
  subjectId: string;
  title: string;
  description: string;
  why: string;
  state:
    | "open"
    | "in_progress"
    | "blocked"
    | "resolved"
    | "expired"
    | "superseded";
  actionRequired: boolean;
  urgency: "none" | "low" | "medium" | "high" | "immediate";
  impact: "low" | "medium" | "high" | "critical";
  deliveryClass:
    | "required"
    | "recommended"
    | "optional";
  blocking: boolean;
  opensAt?: string;
  deadline?: string;
  expiresAt?: string;
  route: string;
  primaryAction?: OrganizerTaskAction;
  assigneeId?: string;
  dedupeKey: string;
  stateVersion: string | number;
};

⸻

16. Task generation

Tasks should be derived server-side from canonical conditions wherever possible.

Examples:

confirmation.requirement.open
AND response missing
→ confirmation task
entry.status = submitted
→ entry review task
jury.window = open
AND missing ballots > 0
AND deadline approaching
→ jury completion task
notification job failed
AND undelivered recipients > 0
→ delivery recovery task

⸻

17. Task resolution

Tasks must resolve automatically from canonical state.

Example:

A reminder task should not remain active after:

* delegation submits
* requirement is waived
* round closes permanently
* requirement is superseded

Never require manual task housekeeping when system state already proves completion.

⸻

18. Task ordering

Default ordering:

1. critical blocking
2. immediate deadline
3. high-impact blocking
4. required + urgent
5. required
6. recommended
7. optional

Within same class:

* earlier deadline first
* higher impact first
* older unresolved task next

⸻

19. Task ownership

Support:

* unassigned
* assigned to me
* assigned to another organizer

Assignment must not hide the task from critical system views.

For critical blocking items:

Assigned to Maria

still remains visible to authorized team members.

⸻

Part VI

Mutation architecture

20. Organizer command rule

Tier 2, Tier 3 and Tier 4 organizer actions must use server-authoritative commands.

They must not perform authoritative mutation through direct client-side Supabase table updates.

Target pipeline:

client intent
↓
server command
↓
authentication
↓
capability check
↓
scope validation
↓
state-version validation
↓
domain validation
↓
idempotency check
↓
transaction / lock
↓
mutation
↓
audit event
↓
receipt
↓
projection invalidation
↓
realtime event
↓
client reconciliation

⸻

21. Command request

Standard command envelope:

type OrganizerCommandRequest<TPayload> = {
  command: string;
  editionId: string;
  showId?: string;
  payload: TPayload;
  expectedStateVersion?: string | number;
  idempotencyKey: string;
  reason?: string;
};

⸻

22. Command response

type OrganizerCommandResponse<TResult> = {
  ok: boolean;
  operationId: string;
  receiptId: string;
  result?: TResult;
  stateVersion: string | number;
  serverTime: string;
  partialFailures?: OrganizerPartialFailure[];
};

⸻

23. Idempotency

All consequential operations require idempotency.

Examples:

* send bulk reminder
* open confirmation round
* close confirmation round
* request entry changes
* verify entry
* approve media
* open jury
* close jury
* open televote
* close televote
* finalize voting
* calculate/finalize results
* publish results
* publish announcement
* activate broadcast version
* retry notification delivery

Double taps, retries and reconnects must never duplicate the underlying operation.

⸻

24. Operation receipt

Persistent receipt model:

type OperationReceipt = {
  id: string;
  operationId: string;
  actorId: string;
  command: string;
  editionId?: string;
  showId?: string;
  subjectType?: string;
  subjectId?: string;
  requestedAt: string;
  completedAt: string;
  outcome:
    | "success"
    | "partial"
    | "failed";
  summary: string;
  affectedCount?: number;
  beforeVersion?: string | number;
  afterVersion?: string | number;
  metadata?: Record<string, unknown>;
};

Receipts appear in:

* success surfaces
* object history
* global audit
* troubleshooting

⸻

Part VII

Concurrency and revisions

25. State versioning

High-value organizer objects must expose a version.

Examples:

* entry review
* running order
* voting rules
* result version
* publication config
* broadcast config
* rules release

Mutation includes expected version.

Server rejects stale command when unsafe.

⸻

26. Concurrent edit UX

Example:

This entry changed while you were reviewing it.
Maria updated:
• artist image
• song duration
Your review is based on Revision 4.
Current revision is Revision 5.
[Compare changes]
[Reload current version]

Never silently overwrite newer authoritative state.

⸻

27. Revision contract

For versioned content:

type Revision<T> = {
  revisionId: string;
  version: number;
  createdAt: string;
  createdBy: string;
  reason?: string;
  snapshot: T;
  parentRevisionId?: string;
};

⸻

28. Diff representation

Provide semantic diffs where possible.

Bad:

JSON field changed

Preferred:

Audio
old-final.mp3 → corrected-final.mp3
Duration
03:11 → 02:58
Artist image
unchanged

⸻

Part VIII

Universal Organizer UI primitives

29. OrganizerPageHeader

Standard header contains:

* context
* title
* state
* concise description only when useful
* one primary action
* optional overflow

Do not place six equal primary buttons in a page header.

⸻

30. OperationalStatusHeader

Reusable component:

Jury voting
OPEN
62 / 66 submitted
Closes in 2h 41m
4 missing ballots
[Notify 4]

Required for operational systems.

⸻

31. AttentionCard

Contains:

* severity
* subject
* problem
* consequence
* primary fix
* optional details

Example:

🔴 Result publication blocked
Integrity case #024 is unresolved.
[Review case]

⸻

32. ReviewQueue

Reusable for:

* confirmation review
* entry review
* media review
* integrity review
* appeals
* preclearance
* community moderation

Supports:

* state filters
* search
* assignment
* next item
* bulk action where safe

⸻

33. ReviewWorkspace

Canonical review layout:

Context

Subject identity.

Status

Current workflow state.

Checks

Automatic validation.

Content

Actual material being reviewed.

History

Versions and previous decisions.

Relevant rules

Contextual rules and interpretations.

Decision

Valid next decisions only.

⸻

34. ConsequenceSheet

Tier 2–4 review component.

Displays:

* operation
* edition
* show
* target
* affected count
* consequences
* public effect
* notifications
* reversibility

Tier controls determine required confirmation strength.

⸻

35. OperationReceiptCard

After consequential operation:

✓ Reminder sent
4 delegations
17:12:04
Operation 9F21…
[View details]

⸻

36. Status language

Use consistent vocabulary.

Preferred states:

* Draft
* Scheduled
* Open
* Under review
* Changes required
* Ready
* Blocked
* Finalized
* Published
* Archived
* Failed

Avoid domain-specific synonyms for the same state unless semantics genuinely differ.

⸻
Part IX

Organizer Overview implementation

37. Route

Canonical conceptual route:

/admin/operations

Existing route may remain.

Product identity:

Overview

⸻

38. Overview query

Implement one aggregated server projection request rather than independent page-component fetches.

Conceptual:

getOrganizerOverview({
  editionId
})

Returns:

* readiness
* top issues
* next deadline
* recent meaningful changes
* active show state
* system health summary

Avoid loading full entry, participant or vote tables solely to calculate counters client-side.

⸻

39. Overview hierarchy

Strict order:

Context

Edition and active show.

Needs attention

Maximum 3–5 most important issues before expansion.

Next

Next operational deadline/event.

Readiness

Explainable readiness.

Recent changes

Only meaningful cross-organizer changes.

Domains

Quiet summary cards.

⸻

40. Overview zero-problem state

Do not fill the screen with fake celebration.

Example:

SSC 22
On track ✓
No organizer action required.
Next
Jury opens tomorrow at 18:00

Then show quiet domain summaries.

⸻

41. Overview acceptance

Pass only if an organizer can answer within seconds:

* what edition am I controlling?
* is anything wrong?
* what should I do first?
* what happens next?

⸻

Part X

Tasks implementation

42. Route

/admin/tasks

Legacy Action Center / Action Centre routes redirect here.

⸻

43. Task filters

Primary:

* Mine
* Required
* Blocking
* Due soon
* All

Domain:

* Delegations
* Entries
* Media
* Voting
* Integrity
* Publication
* Communications
* System

⸻

44. Task card

Example:

Jury · Grand Final
4 ballots missing
Closes in 2h 41m
Required · High urgency
[Notify 4]

Secondary:

View jury
Assign
Snooze

Snooze not allowed for tasks whose deadline semantics make it unsafe.

⸻

45. Bulk task operations

Allowed:

* assign
* send compatible reminders
* resolve administrative informational items
* snooze compatible items

Do not bulk-combine unrelated domain mutations.

⸻

Part XI

Delegations workspace

46. Control route

Conceptual:

/admin/delegations

Existing country and confirmation routes may remain during migration.

⸻

47. Delegation list

Default row/card:

🇴🇱 Oland
Needs attention
Media replacement required
Confirmation ✓
Entry ✓
Media !
Jury —

Do not show every metric if all are healthy.

⸻

48. Delegation search

Search:

* country
* delegation
* HOD
* artist
* song where useful

Results preserve edition scope.

⸻

49. Delegation detail

Sections:

Overview

readiness and current problem

Confirmation

Entry

Media

Voting

Access

Communications

History

⸻

50. Delegation aggregate endpoint

Target:

getDelegationOperationalProfile({
  editionId,
  delegationId
})

Do not have every subsection independently reload country, membership and edition identity.

⸻

Part XII

Confirmations

51. Confirmation workspace

Merge:

* Confirmation overview
* Requirements
* Responses
* Responses by country
* Submission rounds
* Calendar
* Submission history

Specialist integration diagnostics move to Advanced/System.

⸻

52. Confirmation overview

Confirmations
64 / 66 resolved
Needs attention
2
Current round
Open · closes Friday 20:00
[Notify 2]

Secondary sections:

* Attention
* Delegations
* Rounds
* Calendar
* History
* Advanced

⸻

53. Requirement invariant

Server must enforce effective requirement uniqueness according to the domain model.

Closed/superseded requirements must not create duplicate actionable tasks.

The UI must not solve duplicates merely by hiding them.

⸻

54. Confirmation requirement state machine

not_required
→ upcoming
→ open
→ started
→ submitted
→ accepted

Branches:

submitted
→ changes_required
→ resubmitted

Exceptional:

open → waived
open → expired
accepted → reopened

Each transition defines:

* allowed actors
* conditions
* risk tier
* notification effect
* task effect
* audit event

⸻

55. Reopen confirmation

Tier 3 when reopening a finalized/closed obligation.

Review sheet:

Reopen confirmation
Delegation
Oland
Round
Final confirmation
This will:
• allow Oland to edit its response again
• create a new response revision
• notify the delegation
• mark the confirmation unresolved
Reason
[ required ]

⸻

56. Confirmation review queue

Default filter:

Needs review

Item:

Oland
Submitted 16:42
Revision 3
1 change since previous response
[Review]

⸻

57. Confirmation decision

Valid:

* Accept
* Request changes
* Escalate
* Waive when domain permits

No freeform status dropdown.

⸻

58. Submission rounds

Implement round wizard:

1. purpose
2. eligible delegations
3. opens
4. closes
5. late policy
6. reminder policy
7. review
8. create

⸻

59. Round status

Draft
Scheduled
Open
Closed
Archived

Extend/reopen are explicit transitions rather than arbitrary date edits after closure.

⸻

60. Confirmation calendar

Calendar is projection only.

Editing an event opens underlying round/deadline editor.

Do not store duplicate independent calendar events for canonical round dates.

⸻

61. Delegation access

Merge recovery-code tools into delegation access.

Capabilities:

* inspect status
* issue recovery mechanism
* invalidate previous recovery
* suspend access
* restore access

One-time credentials must never be redisplayed indefinitely.

⸻

62. Confirmation integration tools

Move:

* Confirmation edition links
* Confirmation sync
* Confirmation settings

to:

More
→ System
→ Integrations
→ Confirmations

Normal state:

Healthy

Only failures become organizer Tasks.

⸻

Part XIII

Contest workspace

63. Contest overview

Contains:

* Shows
* Entry Review
* Running Orders
* Progression
* Eligibility

Example:

SSC 22 Contest
Shows
3
Entries
66
64 verified
2 need review
Running orders
3 / 3 ready
Progression
1 warning

⸻

64. Shows

Retain existing show model.

Redesign presentation.

Each show:

Grand Final
Scheduled · 20:00
18 entries
Readiness 96%
Blocking
Televote not configured
[Resolve]

Secondary:

* Entries
* Running order
* Voting
* Publication
* Broadcast

⸻

65. Create show

Wizard:

Step 1

Name

Step 2

Type

Options preserve current supported kinds.

Step 3

Contest relationship

Examples:

* standalone
* feeds next stage
* receives qualifiers

Step 4

Review

Do not require configuration irrelevant to the selected type.

⸻

66. Delete show

If no dependent data:

Tier 3.

If substantial dependent official data exists:

Tier 4.

Preflight returns:

{
  entries: number;
  ballots: number;
  votingRounds: number;
  publishedResults: boolean;
  mediaReferences: number;
}

Prefer Archive/Disable where deletion would destroy historical contest truth.

⸻

67. Show Mode

Preserve existing principle:

Solaris must not fabricate exact broadcast timing it cannot know.

Store:

* scheduled start
* external broadcast URL
* manual companion phase
* linked voting round

Authoritative voting/publication states remain derived from their systems.

⸻

Part XIV

Entry Review

68. Entry Review is separate from running order

Create a first-class capability:

Contest
→ Entries
→ Review

Do not use the current running-order workspace as substitute for song verification.

⸻

69. Entry state model

Target:

draft
submitted
under_review
changes_required
resubmitted
verified
withdrawn
disqualified

State changes must preserve revision history.

⸻

70. Entry review queue

Default:

Needs review 3
Changes required 2
Verified 61

Filters:

* Needs review
* Resubmitted
* Changes required
* Verified
* Withdrawn
* All

Search:

* country
* artist
* song

⸻

71. Entry review header

🇴🇱 Oland
Artist Name
Song Name
Revision 4
Resubmitted

Immediately show whether this is:

* first review
* resubmission
* exceptional late change

⸻

72. Automated entry checks

Server returns structured checks:

type EntryCheck = {
  id: string;
  category: string;
  status:
    | "pass"
    | "warning"
    | "fail"
    | "manual";
  label: string;
  detail?: string;
  blocking: boolean;
  ruleRef?: string;
};

Possible checks:

* required metadata
* duration
* file existence
* media type
* image dimensions
* duplicate references
* credit completeness
* submission deadline
* eligibility signals

Checks do not replace organizer judgment where rules require interpretation.

⸻

73. Media preview

Review screen must provide embedded preview where technically possible:

* audio
* video
* image
* metadata

Do not force organizer to download files solely to inspect ordinary submissions.

⸻

74. Relevant rules

Review API returns rule references relevant to warnings.

UI opens a contextual sheet.

Example:

Rule 4.2
Song duration
Maximum permitted duration: 3:00
Submitted duration:
3:11

⸻

75. Entry change request

Structured categories:

* song file
* duration
* title
* artist
* image
* video
* credits
* metadata
* eligibility
* other

Each category supports editable organizer explanation.

⸻

76. Request changes command

Example:

requestEntryChanges({
  editionId,
  entryId,
  revisionId,
  issues,
  message,
  expectedStateVersion,
  idempotencyKey
})

Server:

* validates review capability
* verifies current revision
* writes decision
* changes state
* creates task for delegation
* emits notification
* creates receipt
* invalidates organizer projection

⸻

77. Verify entry

Tier 2.

Review:

Verify Oland entry
Revision 4
All blocking checks passed.
This marks the entry as verified.

⸻

78. Revision comparison

When resubmitted:

Revision 3 → Revision 4
Changed
Audio file
duration 03:11 → 02:58
Unchanged
Artist
Image
Credits

Primary action:

Review changed items

Secondary:

Review full entry

⸻

Part XV

Media

79. Media review queue

Merge organizer media review into one workspace.

States:

uploading
processing
validation_failed
needs_review
approved
replacement_required
quarantined

⸻

80. Media review card

Oland
Artist image
Replacement submitted
3000 × 2000
JPEG
2.8 MB
[Review]

⸻

81. Media validation

Technical pipeline may validate:

* file type
* dimensions
* file size
* decode/readability
* malware/quarantine state
* expected orientation
* aspect-ratio suitability

Technical pass is not equivalent to editorial approval.

⸻

82. Media replacement

Replacement request records:

* category
* reason
* affected asset
* rule/requirement
* message
* requesting organizer

New upload creates a new revision, not destructive replacement of historical evidence.

⸻

Part XVI

Running Order & Progression

83. Running order architecture

Separate:

* canonical participants/entries
* show allocations
* order positions
* draft changes
* published order

Do not use each drag gesture as authoritative production mutation.

⸻

84. Running order draft

Client may maintain temporary reorder state.

Save draft command persists draft version.

Publish command creates canonical published version.

⸻

85. Mobile running order

Each card:

12
🇴🇱 Oland
Artist · Song
[↑] [↓] [Move]

Drag optional.

Single-pointer non-drag alternative mandatory.

⸻

86. Desktop running order

Use:

* drag
* keyboard move
* multi-select where useful
* clear order numbers
* comparison preview

⸻

87. Publish order preflight

Show:

3 changes
A 4 → 6
B 5 → 4
C 6 → 5
No duplicate positions
18 / 18 entries allocated
[Publish running order]

⸻

88. Heat progression

Progression uses source result version.

Preview:

Heat 1 → Semi-final
Qualifiers
5
Will add:
A
B
C
D
E
Conflicts:
0

⸻

89. Progression conflict

Never silently overwrite:

* manual allocation
* manually corrected artist/song information
* withdrawn entry
* already existing qualifier

Conflicts require explicit resolution.

⸻

Part XVII

Eligibility

90. Eligibility workspace

Default view:

Eligible 64
Needs review 2
Blocked 0

⸻

91. Eligibility signal model

type EligibilitySignal = {
  check: string;
  state:
    | "pass"
    | "warning"
    | "fail"
    | "manual_review";
  evidence: string[];
  ruleRefs: string[];
  blocking: boolean;
};

⸻
92. Human decision

Automated integrity/eligibility analysis must be described as signal/evidence.

It must not automatically claim misconduct.

Organizer decision records:

* conclusion
* relevant rule
* reason
* evidence
* actor
* time
* impact

⸻

93. Override

Eligibility override is Tier 3.

Requires explicit reason.

If override creates rule deviation, show that prominently.

⸻

Part XVIII

Voting workspace

94. Voting overview

Grand Final Voting
Jury
Open · 62 / 66
Televote
Ready to open
Integrity
Clear
Results
Waiting for voting

Primary action corresponds to valid next state.

⸻

95. Voting configuration model

Voting System config must be versioned.

Contains:

type VotingConfig = {
  juryWeight: number;
  publicWeight: number;
  pointScale: number[];
  qualifierCount?: number;
  ownCountryRule: string;
  tieBreakRule: string;
  otherRules: Record<string, unknown>;
  version: number;
};

⸻

96. Human-readable rules summary

Always derive:

Jury 50%
Public 50%
Points
12, 10, 8–1
Tie
Public score decides

Organizer should not need to mentally decode raw numeric configuration.

⸻

97. Voting config change preflight

Before save show:

* affected shows
* whether voting already started
* whether ballots already exist
* whether results already exist
* whether recalculation would be required

Post-start modification may escalate to Tier 3/4.

⸻

Part XIX

Voting rounds

98. Voting round state machine

draft
scheduled
open
closed
validating
finalized
archived

Transitions server-controlled.

⸻

99. Round readiness

Before opening:

✓ 18 eligible entries
✓ rules valid
✓ public interface ready
✓ no blocking integrity issue
✓ result pipeline configured

If not ready:

Cannot open
2 blockers
[Review blockers]

⸻

100. Round entries

Eligible entries derived from canonical show state by default.

Manual modifications:

* require permission
* record reason
* clearly display divergence

⸻

Part XX

Jury

101. Jury overview

Jury · Grand Final
OPEN
62 / 66 submitted
Closes in 2h 41m
4 missing
[Notify 4]

⸻

102. Missing ballots

List:

Oland
Vendia
Averia
X
[Notify selected]

Bulk reminder command sends one idempotent operation with recipient records.

⸻

103. Ballot review

Display:

* delegation
* submission status
* submitted at
* points/ranking
* validation
* own-country restriction
* declaration
* revision
* integrity signals

⸻

104. Jury close preflight

Before close:

Grand Final Jury
62 / 66 ballots submitted
4 missing
0 unresolved integrity blockers
Closing will:
• reject new submissions
• freeze accepted ballot versions
• move jury to validation/finalization
[Close jury]

Missing ballots do not necessarily prevent close if rules allow it, but consequence must be explicit.

⸻

105. Jury declarations

Signed declarations immutable.

Correction creates a new version/record.

Missing required declaration becomes a task.

⸻

Part XXI

Televote

106. Televote overview

Before opening:

Ready to open

During:

OPEN
3,472 accepted votes
18 pending validation
0 critical integrity issues
08:41 remaining

After:

Closed
Validation in progress

⸻

107. Open televote

Tier 2 or Tier 3 according to show context.

Server verifies readiness immediately before transition.

Do not trust stale client readiness.

⸻

108. Close televote

Tier 3.

Preflight uses current server state.

Display:

* accepted votes
* pending validation
* critical integrity findings
* deadline
* consequence

⸻

109. Televote totals

For aggregate entry:

Grid/list supports:

* entry
* points
* source
* current value
* validation
* actor

Support bulk paste/import.

Run validation before commit.

⸻

110. Vote import validation

Check:

* all expected entries
* duplicate entry
* invalid number
* unexpected value
* impossible total where relevant
* stale show
* wrong edition

⸻

Part XXII

Voting integrity

111. Integrity queue

Do not list every ballot by default.

Group signals.

Example:

Possible coordinated cluster
143 ballots
High confidence signal
First seen 19:42
[Investigate]

⸻

112. Investigation detail

Show:

* signal explanation
* affected ballots
* evidence
* limitations
* relationship context
* historical comparison

Never phrase model/statistical signal as proven misconduct.

⸻

113. Integrity decision

Possible:

* accept ballots
* exclude ballots
* escalate case
* request further review

Bulk exclusion Tier 3.

Requires reason.

⸻

114. Anti-abuse

Move advanced anti-abuse controls under Integrity → Advanced.

Permission gate sensitive evidence.

⸻

115. Voting intelligence

Intelligence cards must answer a question.

Examples:

Support concentration unusually high
Voting relationship differs substantially from historical baseline

Each signal includes:

* explanation
* confidence
* comparison
* limitations
* relevant action

⸻

116. Voting analytics

Separate descriptive analytics from integrity enforcement.

Analytics:

* turnout
* distributions
* vote timing
* performance
* breakdowns

No red “suspicious” treatment merely because a number is unusual.

⸻

Part XXIII

Results

117. Results state machine

waiting_for_inputs
calculating
validation_required
ready_to_finalize
finalized
published

Exceptional:

blocked_integrity
superseded

⸻

118. Result version

Official result must reference explicit input versions:

type ResultVersion = {
  id: string;
  showId: string;
  juryVersion?: string;
  televoteVersion?: string;
  votingConfigVersion: number;
  calculationVersion: string;
  createdAt: string;
  createdBy: string;
  finalizedAt?: string;
  finalizedBy?: string;
};

⸻

119. Result workflow

Strict stages:

Inputs

Jury and public vote finalization.

Calculation

Deterministic calculation.

Validation

Totals, tie-breaks, exclusions.

Integrity

No unresolved blocking case.

Preview

Exact ranked result.

Finalize

Freeze official result version.

Publish

Publish that exact version.

⸻

120. Combined result explanation

Per entry:

Oland
Jury
184
Public
212
Combined
396
Rank
1

Tie-break explanation shown where used.

⸻

121. Result finalization

Tier 3.

Server creates immutable/frozen result version.

Subsequent changes require explicit replacement workflow.

Never silently mutate the finalized result.

⸻

122. Publish results

Tier 3.

Preflight:

SSC22 · Grand Final
Result version R7
Finalized 20:42
18 ranked entries
Public surfaces
✓ Results
✓ Edition page
✓ Home
✓ Push announcement
[Publish]

⸻

123. Publish receipt

Results published
20:47:11
Result version
R7
Operation
OP-...
[View public result]
[View receipt]

⸻

Part XXIV

Result integrity and backtesting

124. Result integrity checks

Mandatory:

* totals reconcile
* deterministic ranking
* no duplicate entrants
* correct input versions
* tie-breaks resolvable
* exclusions applied
* weights sum correctly
* no blocking integrity cases
* publication points to finalized version

⸻

125. Result backtest

Always visibly:

SIMULATION
NOT OFFICIAL

Backtest may vary:

* weights
* excluded ballots
* tie-break
* qualifier count

No direct Apply-to-production control.

⸻

Part XXV

Publication

126. Publication workspace

Rows:

* participants
* songs
* artist media
* running order
* show details
* jury results
* public vote
* combined results
* stories

State:

* Private
* Scheduled
* Public

⸻

127. Dependency explanation

Disabled publication action must explain why.

Bad:

Publish [disabled]

Preferred:

Results cannot be published
1 blocker
Result integrity case #024 unresolved
[Review case]

⸻

128. Public preview

Provide exact public rendering or authoritative preview mode.

Organizer must be able to answer:

What will users actually see?

before publication.

⸻

Part XXVI

Communications

129. Communications workspace

Sections:

* Drafts
* Scheduled
* Sent
* Delivery issues
* Templates

⸻

130. Composer

Fields:

* title
* content
* audience
* delivery channels
* schedule
* expiry where relevant
* importance
* deep link
* spoiler sensitivity

⸻

131. Audience

Canonical options:

* all users
* all delegations
* selected delegations
* juries
* organizers
* relevant affected users
* explicitly scoped custom audience

Recipient preview mandatory.

⸻

132. Notification preview

Render:

Push

In-app

before sending.

⸻

133. Delivery result

Sent
Delivered
62
Pending
2
Failed
2
[Retry failed 2]

Retry targets only failed deliveries.

⸻

Part XXVII

Storytelling and Anniversary

134. Storytelling

Editorial workflow:

draft
review
scheduled
published
archived

Content relationships:

* edition
* show
* country
* artist
* entry
* historical event

⸻

135. Story editor

Supports:

* title
* body
* hero asset
* associations
* schedule
* public preview
* revision history

⸻

136. Anniversary

Merge:

* Anniversary settings
* Anniversary dates

under:

Storytelling
→ Anniversary

Upcoming anniversaries may generate optional editorial tasks.

⸻

Part XXVIII

Production & Broadcast

137. Production workspace

Sections:

* Visual identity
* Scoreboard
* Broadcast presentation
* Rundown
* Reveal
* Versions

⸻

138. Broadcast configuration versioning

States:

draft
validated
active
superseded

Editing draft never alters active live design.

⸻

139. Activation

Workflow:

Edit
→ Preview
→ Validate
→ Activate

Activation during active show is Tier 3 when visible output changes materially.

⸻

140. Rollback

Keep previous active version.

Allow:

Rollback to previous version

with consequence preview.

⸻

Part XXIX

Organizer Live

141. Live shell

When a show is active, Live reduces unrelated UI.

Example:

LIVE CONTROL
SSC22 · Grand Final
NOW
12 · Oland
NEXT
13 · Vendia
SYSTEMS
Show ✓
Jury ✓
Televote Locked
Results Ready
NEXT OPERATION
Open televoting

⸻

142. Live action priority

At most one dominant operational action.

Other controls secondary.

Dangerous controls visually separated.

⸻

143. Live timeline

Every meaningful event:

20:01 Show marked live
20:43 Performance sequence completed
20:45 Televote opened
20:57 Televote extended +2 min
20:59 Televote closed

⸻

144. Broadcast Rundown

Cue model:

type RundownCue = {
  id: string;
  showId: string;
  order: number;
  type: string;
  label: string;
  plannedTime?: string;
  state:
    | "pending"
    | "ready"
    | "active"
    | "done"
    | "skipped";
  dependencyIds: string[];
};

⸻

145. Live rundown controls

* mark ready
* start
* complete
* skip
* delay
* insert emergency cue

Changes auditable.

⸻

146. Reveal Director

Modes:

Planning
Rehearsal
Armed
Live
Complete

Armed locks reveal sequence.

Editing requires explicit disarm.

⸻

Part XXX

Simulations and historical inspection

147. Simulation Lab

Use fully isolated simulation state.

Persistent banner:

SIMULATION
No production data will be changed.

⸻

148. Simulation scope

Simulate:

* confirmation
* entries
* voting
* results
* publication
* progression
* live state

⸻

149. Simulation isolation

Simulation writes must not target production canonical tables unless using a specifically designed isolated namespace impossible to confuse with official state.

Prefer dedicated isolated/local data for automated tests.

Never implement test simulation by cloning huge production datasets into automated browser sessions.

⸻

150. Time Machine

Read-only historical view.

No mutation controls.

Persistent indicator:

Historical state
14 Oct 2026 · 20:31:14

⸻

151. Time Machine diff

Compare two authoritative snapshots/events.

Useful during:

* incident analysis
* result disputes
* publication mistakes
* sync investigation

⸻

152. Voting Lab

Synthetic vote scenarios only.

Cannot publish or finalize official results.

⸻

Part XXXI

Operations and Incidents

153. Control Room

Control Room is not primary navigation.

It is an operational cross-domain workspace reached through Live or Control.

Sections:

* Current state
* Active issues
* Systems
* Team
* Timeline

⸻

154. Workflows
Workflow graph derives dependencies.

Example:

Entries verified
      ↓
Running order ready
      ↓
Voting configured
      ↓
Votes finalized
      ↓
Results finalized
      ↓
Publication

⸻

155. Blocker behavior

Blocked node shows actual blocker.

Example:

Results publication
BLOCKED
Integrity case #024 unresolved
[Review case]

⸻

156. Incident state machine

detected
declared
responding
monitoring
resolved
reviewed

⸻

157. Incident roles

Support:

* Incident Commander
* Operations Lead
* Communications Lead

For small incidents one person may hold multiple roles.

Current ownership always visible.

⸻

158. Incident declaration

Form:

* severity
* title
* impact
* affected systems
* commander
* immediate mitigation
* communication requirement

Declaration creates:

* incident ID
* timeline
* task group
* system banner where relevant

⸻

159. Incident workspace

Header:

SEV2
Public voting unavailable
Incident Commander
Arthur
Duration
12m
Current state
Mitigation in progress

Sections:

* Current status
* Impact
* Actions
* Timeline
* Systems
* Communications
* Follow-up

⸻

160. Incident resolution

Requires:

* resolution summary
* duration
* user impact
* remaining risk
* follow-up tasks

Post-incident review linked.

⸻

Part XXXII

Trust & Governance

161. Governance workspace

Available only to relevant capabilities.

Sections:

* Investigations
* Rulings
* Appeals
* Evidence
* Disclosure
* Identity
* Rules

⸻

162. Investigations

Case states:

new
triage
investigating
awaiting_response
decision_ready
resolved
appealed
closed

⸻

163. Investigation record

Contains:

* allegation/problem
* subjects
* applicable rules
* evidence
* activity timeline
* findings
* decision
* sanctions where applicable
* disclosure state
* appeal state

⸻

164. Evidence distinction

UI visually differentiates:

Automated signal

Submitted evidence

Verified fact

Organizer finding

Do not mix them into a single “evidence” list.

⸻

165. Rule rulings

Preclearance workflow:

Submitted
→ Reviewing
→ More information required
→ Decision

Outcomes:

* permitted
* permitted with conditions
* not permitted

⸻

166. Appeals

Appeal record references immutable original decision.

Possible outcomes:

* uphold
* vary
* overturn
* reconsider

⸻

167. Evidence lifecycle

collected
restricted
reviewed
retained
scheduled_for_deletion
deleted

Track access.

Deletion Tier 4 where sensitive/case-critical.

⸻

168. Disclosure

Before disclosure show exact fields/documents to be released.

Partial approval supported.

⸻

169. Identity break-glass

Tier 4.

Require:

* capability
* case/incident
* purpose
* recent authentication
* explicit confirmation

Temporary access should expire.

Every access audited.

⸻

Part XXXIII

Rules

170. Rules Manager

Lifecycle:

draft
review
validated
scheduled
published
superseded

⸻

171. Rule versioning

Published versions immutable.

Changes create new release.

Show semantic diff.

⸻

172. Validation

Before release:

* duplicate IDs
* broken internal references
* missing headings
* inconsistent dates
* malformed deep links
* conflicting effective versions

⸻

173. Interpretations

Structured:

type RuleInterpretation = {
  id: string;
  ruleId: string;
  question: string;
  interpretation: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  relatedCaseIds: string[];
  state: "draft" | "published" | "superseded";
};

⸻

174. Contextual rule injection

Entry, eligibility, voting and investigation workflows query relevant rules/interpretations.

Organizer does not manually search the full rulebook for every review.

⸻

Part XXXIV

Access & Permissions

175. Authorization model

Use capability-based access.

Display roles may provide presets.

Server authorization uses capabilities and scope.

⸻

176. Permission scope

Support:

* platform
* edition
* show
* domain/object where required

Example:

results.publish
Scope: SSC22

⸻

177. Access editor

User detail:

Preset

Effective capabilities

Scope

Sensitive privileges

History

⸻

178. Grant preview

Grant capability
User
Maria
Capability
results.publish
Scope
SSC22
This allows publication of official SSC22 results.
[Grant]

⸻

179. Least privilege

Do not show ordinary organizers irrelevant high-risk capabilities.

Examples:

* identity break-glass
* evidence deletion
* feature rollout
* global system settings

⸻

Part XXXV

Platform & Edition administration

180. Administration route

Retire generic “Administration” as product-level concept.

Replace with explicit platform groups.

Legacy route redirects.

⸻

181. All Editions

Groups:

* Active
* Upcoming
* Archived

Each card:

* edition
* host
* dates
* state
* readiness
* participant count
* visibility

⸻

182. Create edition

Wizard:

1. identity
2. dates/timezone
3. host
4. template/defaults
5. review
6. create

Do not expose low-level system configuration in initial creation.

⸻

183. Archive edition

Prefer Archive to Delete.

Archive preserves canonical historical state and makes routine mutation unavailable.

⸻

184. Delete edition

Tier 4.

Preflight lists affected:

* shows
* entries
* media
* ballots
* results
* stories
* audit references
* integrations

Type-name confirmation and reason required.

⸻

Part XXXVI

Feature Rollout

185. Feature rollout model

Each feature:

type FeatureRollout = {
  key: string;
  environment: string;
  state:
    | "off"
    | "internal"
    | "limited"
    | "on";
  audience?: string;
  owner?: string;
  updatedAt: string;
  updatedBy: string;
};

⸻

186. Rollout safety

Changing a flag that impacts critical contest behavior:

* Tier 3
* consequence preview
* audit
* rollback path

Emergency kill switch visually distinct.

⸻

Part XXXVII

Engagement & Community

187. Community moderation

Must not silently alter competitive data.

Actions:

* hide public identity
* restore identity
* remove public content where supported
* record reason

Display scope explicitly.

⸻

188. Predictions

Lifecycle:

draft
scheduled
open
locked
scored
published

Use show/result relationships rather than manual duplicate scoring when possible.

⸻

189. Fantasy SSC

Version:

* budget
* roster rules
* costs
* scoring
* lock time

Historical scores must remain reproducible from version used at lock.

⸻

Part XXXVIII

Command Assistant

190. Assistant scope

Command Assistant may:

* search
* summarize
* explain blockers
* identify relevant tools
* propose next steps
* prepare safe command draft

It may not independently execute Tier 3/4 operations.

⸻

191. Assistant example

Input:

Why can't I publish results?

Output:

Grand Final results cannot be published because Integrity Case #024 remains unresolved.
Jury finalized ✓
Televote finalized ✓
Calculation valid ✓
Integrity blocker ✗
[Open Case #024]

⸻

192. Assistant permissions

Assistant results filtered through same authorization as direct navigation.

No sensitive data leakage through natural-language search.

⸻

Part XXXIX

Product QA

193. Merge beta dashboards

Combine Beta 1, Beta 2 and Beta 3 under:

More
→ Product QA
→ Feedback Studies

Historical studies remain distinct datasets.

⸻

194. Feedback record

Store:

* study
* participant/tester
* device
* scenario
* response
* severity
* linked defect
* resolution status

⸻

195. Organizer Acceptance Test

Replace page-opening verification with scenario testing.

Mandatory scenarios defined later in release criteria.

⸻

196. QA coverage

Coverage matrix:

Capability
Scenario
Phone
Desktop
Keyboard
Two-admin
Offline/reconnect
Passed SHA

⸻

Part XL

Public UX observability

197. Public UX

Collect aggregate privacy-respecting signals:

* search success
* failed searches
* task completion
* route backtracking
* dead ends
* workflow abandonment
* error classes

⸻

198. Actionability

A metric without a plausible action should not dominate this workspace.

Example:

18% of users search “jury results” from Explore
Possible issue:
Results discoverability

⸻

Part XLI

System Health

199. System health projection

Top level:

Core
Healthy
Confirmations
Healthy
Voting
Degraded
Notifications
Healthy
Publication
Healthy

⸻

200. Health state

type HealthState =
  | "healthy"
  | "degraded"
  | "partial_outage"
  | "outage"
  | "unknown";

⸻

201. Degraded detail

Voting
DEGRADED
Impact
New public votes delayed.
Started
19:41
Last successful ingestion
19:40:57
[Open incident]

⸻

Part XLII

Delivery & Jobs

202. Job state

scheduled
queued
running
succeeded
retrying
failed
cancelled

⸻

203. Job record UI

Show business meaning first.

Bad:

cron notification-fanout #9213 failed

Preferred:

Jury reminder delivery failed
8 delegations not reached
[Retry failed 8]

Technical diagnostics expandable.

⸻

204. Retry

Server determines retry-safe subset.

Use same idempotency/dedupe keys.

Never accidentally duplicate deliveries already completed.

⸻

Part XLIII

System Settings

205. Settings groups

* Deadlines
* Notifications
* Maintenance
* Operational defaults
* Audit
* Integrations
* Advanced

⸻

206. Setting row

Displays:

* current value
* scope
* description
* last changed
* actor

High-risk settings explain consequences.

⸻

207. Maintenance

Activation requires:

* audience
* public message
* bypass behavior
* scope
* reason

Emergency platform-wide mode is Tier 4.

⸻

Part XLIV

Global audit architecture

208. Audit event

Target contract:

type OrganizerAuditEvent = {
  id: string;
  actorId: string;
  action: string;
  editionId?: string;
  showId?: string;
  subjectType?: string;
  subjectId?: string;
  beforeVersion?: string | number;
  afterVersion?: string | number;
  reason?: string;
  operationId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

⸻

209. Audit requirements

Tier 2–4 mutations always emit meaningful audit event.

Sensitive reads may also require audit.

Examples:

* sealed identity access
* protected evidence access

⸻

Part XLV

Search

210. Organizer Search

Search sources:

* editions
* shows
* countries
* delegations
* entries
* artists
* songs
* tasks
* tools
* incidents
* investigations
* rules

⸻

211. Search result groups

Objects
Actions
Tools
Help

⸻

212. Action search

Search may suggest:

Open Grand Final televote

Selecting it opens Televote workspace.

It does not immediately execute Open.

Tier 3/4 commands can never execute directly from search result selection.

⸻

Part XLVI

Notifications

213. Organizer notification classes

Required

Immediate/critical action.

Recommended

Important intervention.

Optional

Informational.

⸻

214. Notification deep links

Every actionable notification includes:

* edition
* subject
* route
* task/issue ID where applicable

Opening it lands directly on exact operational context.

⸻

215. Dedupe

Related condition uses stable dedupe key.

Example:

jury:SSC22:final:missing

Do not push 12 separate messages because the missing count changed from 5 to 4 to 3.

⸻

216. Resolved notification

When underlying task resolves elsewhere:

* badge clears
* stale action removed
* notification detail shows resolved state where opened

⸻

Part XLVII

Network, stale state and offline

217. Stale-state contract

Queries returning operational data expose:

serverTime
stateVersion

Client records last authoritative refresh.

⸻

218. Connectivity indicator

Only show when useful.

Example:

Connection lost
Showing state from 20:41

⸻

219. Dangerous operation while stale

Before Tier 2–4 command:

server revalidates state.

If incompatible:

This changed since you opened it.
Jury voting has already closed.
[View current state]

⸻

220. Offline drafts

Safe:
* message draft
* notes
* unsent editorial text
* local form progress where domain allows

Unsafe to fake offline success:

* publish
* voting state
* result finalization
* access changes
* integrity decisions

⸻

Part XLVIII

Responsive design

221. Phone

Primary target approximately 390 × 844 class.

Phone interaction:

* single-column
* cards instead of compressed tables
* bottom sheets
* sticky contextual actions when appropriate
* clear safe-area handling
* large tap targets
* no tiny overflow menus for essential operations

⸻

222. Tablet

Use:

* side navigation
* larger review sheets
* optional master-detail

⸻

223. Desktop

Use:

* side navigation
* denser lists
* master-detail
* comparison panels
* bulk actions
* keyboard support

Do not turn desktop into a fundamentally different product.

⸻

224. Dragging

Every drag feature requires accessible non-drag equivalent.

Includes:

* running order
* rundown
* any reorderable configuration

⸻

225. Target sizing

Meet WCAG 2.2 requirements at minimum.

For frequent mobile organizer controls, design larger comfortable targets rather than merely scraping the minimum.

⸻

Part XLIX

Accessibility

226. Status communication

Never communicate state solely through:

* red/green
* animation
* icon
* vibration

Always include text or programmatically available label.

⸻

227. Focus

Sticky nav/action bars must not hide focused elements.

Sheets trap and restore focus correctly.

⸻

228. Dynamic text

Test larger text sizes.

Critical action and context must remain visible and usable.

⸻

229. Reduced motion

Animations enhance transition but do not communicate unique required information.

⸻

Part L

Error model

230. Error contract

User-facing error returns:

type OrganizerError = {
  code: string;
  category:
    | "connection"
    | "validation"
    | "permission"
    | "state_changed"
    | "conflict"
    | "server";
  message: string;
  recoverable: boolean;
  nextAction?: string;
  operationId?: string;
};

⸻

231. Partial failure

Example:

Reminder completed with issues
12 delivered
2 failed
[Retry failed 2]

Do not render partial success as generic failure.

⸻

232. Technical details

Expandable:

* code
* operation ID
* correlation ID

Never display secrets, keys or privileged backend information.

⸻

Part LI

Performance and data efficiency

233. Projection-first loading

Overview, Tasks and delegation summary use aggregate projections.

Do not download entire tables to count states.

⸻

234. Query rules

Prefer:

* narrow selects
* server aggregation
* shared cache
* query deduplication
* sensible stale times
* event-based invalidation

Avoid:

* repeated full-table reads
* page-local duplicate edition queries
* unnecessary polling
* per-row N+1 fetches
* duplicate realtime subscriptions

⸻

235. Realtime

Use realtime for:

* live show
* voting transition
* important task resolution
* organizer conflicts
* result publication
* incident state

Do not realtime-subscribe to static archives and low-frequency configuration without purpose.

⸻

236. Supabase egress

Production egress is a correctness constraint.

Every new Organizer aggregate must be evaluated for:

* call frequency
* row count
* selected fields
* cacheability
* realtime duplication

⸻

Part LII

Production and testing isolation

237. Absolute automation rule

Automated:

* CI
* Playwright
* browser audit
* visual regression
* migration rehearsal
* automated QA
* screenshot tests
* crawler
* load testing

must not use production-hosted Solaris Supabase.

⸻

238. CI guards

Keep permanent checks that fail on hosted production Supabase configuration.

Local testing normally uses loopback/local Supabase.

No silent fallback.

⸻

239. New Organizer browser tests

Before enabling any new suite:

prove:

Supabase URL is local/isolated

If local backend startup fails:

FAIL

not:

fall back to production

⸻

Part LIII

Migration strategy

240. Migration principle

Do not create a mega-launch.

Migrate one operational layer at a time behind feature flags where needed.

Existing safe workflows remain available until equivalent V3 workflow passes acceptance.

⸻

241. Phase O0 — capability inventory lock

Before implementation:

Create machine-readable inventory:

type AdminCapabilityMigration = {
  legacyId: string;
  legacyRoutes: string[];
  classification:
    | "redesign"
    | "merge"
    | "contextualize"
    | "restrict"
    | "retire";
  targetDomain: string;
  targetRoute: string;
  ownerCapability: string;
  migrationStatus:
    | "planned"
    | "building"
    | "parity"
    | "cutover"
    | "retired";
};

No current admin feature may be omitted.

⸻

242. Phase O1 — shared architecture

Implement first:

* OrganizerContext
* OrganizerProjection
* OrganizerTask contract
* command envelope
* operation receipts
* state-version handling
* risk-tier component primitives
* audit primitives
* permission-aware navigation

No major screen redesign should duplicate these independently.

⸻

243. Phase O2 — Organizer shell

Implement:

* Overview
* Tasks
* Control
* Live
* More
* search
* edition switcher
* show switcher
* context lock

Keep existing routes accessible during transition.

⸻

244. Phase O3 — Overview and task engine

Connect real canonical state.

Required domains:

* confirmations
* entries
* media
* jury
* televote
* results
* publication
* system health

Prove stale/dead tasks cannot persist after underlying state resolution.

⸻

245. Phase O4 — Delegations & Confirmations

Migrate:

* Delegations
* Confirmation overview
* Requirements
* Responses
* Countries
* Rounds
* Calendar
* Access
* Submission history

Leave sync/settings diagnostics under legacy routes until system section exists.

⸻

246. Phase O5 — Entry & Media review

Build:

* Entry Review queue
* Entry Review workspace
* automated check contract
* relevant-rule integration
* revision comparison
* change request
* verification
* Media Review queue
* replacement flow

This phase creates the missing distinction between Entry Review and Running Order.

⸻

247. Phase O6 — Contest operations

Migrate:

* Shows
* running order
* lineup allocation
* progression
* participant status
* eligibility

Preserve existing domain behavior.

Replace direct consequential client mutations with commands.

⸻

248. Phase O7 — Voting foundation

Migrate:

* Voting overview
* Voting rules
* rounds
* jury
* declarations
* aggregate televote

Implement voting readiness.

⸻

249. Phase O8 — Voting integrity & analytics

Migrate:

* integrity review
* jury integrity
* anti-abuse
* voting intelligence
* analytics
* audit log
* voting integrations

⸻

250. Phase O9 — Results & Publication

Implement strict:

input
→ calculate
→ validate
→ integrity
→ preview
→ finalize
→ publish

Migrate:

* public vote results
* combined tools
* result integrity
* backtest
* result publication
* visibility controls

⸻

251. Phase O10 — Communications

Migrate:

* notices
* push delivery
* schedules
* delivery failures

Connect failed deliveries to Tasks.

⸻

252. Phase O11 — Production & Live

Migrate:

* Broadcast
* Theme
* Live controller
* Rundown
* Reveal Director

Add versions and rollback.

⸻

253. Phase O12 — Operations & Incidents

Migrate:

* Control Room
* Workflows
* Incidents

Connect system health and operational timeline.

⸻

254. Phase O13 — Governance

Migrate:

* Investigations
* Rulings
* Appeals
* Evidence
* Disclosure
* Identity
* Rules
* Interpretations

Apply stronger permission boundaries.

⸻

255. Phase O14 — Platform

Migrate:

* Access & Permissions
* Feature Rollout
* Editions
* System Health
* Delivery & Jobs
* System Settings
* integration diagnostics

⸻

256. Phase O15 — Engagement and editorial

Migrate:

* Storytelling
* Anniversary
* Predictions
* Fantasy SSC
* Community moderation

⸻

257. Phase O16 — Product QA

Merge:

* beta feedback
* acceptance test
* coverage
* public UX

⸻

258. Phase O17 — Specialist labs

Migrate/refine:

* Simulation Lab
* Time Machine
* Voting Lab
* Command Assistant

⸻

259. Phase O18 — legacy retirement

Only after capability parity:

* redirect legacy aliases
* remove duplicate visible navigation
* remove redundant client-side task derivations
* remove obsolete generic Administration route
* remove duplicate status/control surfaces
* remove direct critical client mutations replaced by commands

⸻

Part LIV

Route migration map

260. Primary current → target mapping

/admin/operations
→ Overview
/admin/tasks
/admin/action-center
/admin/action-centre
→ Tasks
/admin/countries
→ Control / Delegations
/confirmations/admin/*
→ Delegations / Confirmations
/admin/:slug
→ Control / Contest
/admin/shows/:slug
→ Contest / Shows
/admin/entries/:slug
→ Contest / Running Order
NEW
→ Contest / Entry Review
/admin/participant-status/*
→ Contest / Participants
/admin/lineup-sync/*
→ Contest / Progression
/admin/eligibility
→ Contest / Eligibility
/admin/media-assets
→ Contest / Media
/televoting/admin/*
/admin/jury/*
/admin/voting-system/*
/admin/televote/*
/admin/jury-integrity
→ Control / Voting
/admin/results*
→ Control / Results
/admin/publication/*
→ Control / Publication
/admin/communications
→ Control / Communications
/admin/design/*
/admin/edition-theme/*
→ Control / Production
/admin/control-room
→ Live / Operations
/admin/workflows
→ More or Control / Operations
/admin/incidents
→ Live / Incidents
/admin/results-reveal
→ Live / Reveal
/admin/broadcast-rundown
→ Live / Rundown
/admin/edition-simulator
→ More / Labs
/admin/time-machine
→ More / History
/admin/voting-lab
→ More / Labs
/admin/integrity-*
→ More / Governance
/admin/rules-manager
/admin/rule-interpretations
→ More / Governance / Rules
/admin/access-permissions
→ More / Platform / Access
/admin/editions
→ More / Platform / Editions
/admin/feature-rollout
→ More / Platform / Rollout
/admin/sync-health
→ More / System / Health
/admin/system-operations
→ More / System / Delivery
/admin/system
→ More / System / Settings

Legacy URLs may continue resolving during migration.

Visible product navigation uses target concepts.

⸻

Part LV

Testing strategy

261. Unit tests

Test:

* risk tier logic
* task ordering
* task derivation
* readiness calculation
* state machines
* permission resolution
* rule matching
* result calculations
* publication blockers
* retry targeting
* revision diff

⸻

262. Contract tests

Mandatory contracts:

* OrganizerProjection
* OrganizerTask
* OrganizerCommand
* OperationReceipt
* OrganizerError
* stateVersion
* capabilities
* health projection

⸻

263. State-machine tests

For every operational domain:

* valid transition succeeds
* invalid transition rejected
* stale transition rejected
* duplicate command idempotent
* unauthorized actor denied
* wrong edition denied

⸻

264. Integration tests

Minimum:

Confirmations

open → submit → review → changes → resubmit → accept

Entry

submit → review → changes → resubmit → verify

Media

upload → validate → review → replacement → approve

Jury

open → submit → remind → close → finalize

Televote

ready → open → ingest → close → validate → finalize

Results

inputs → calculate → validate → finalize → publish

Incident

declare → assign → update → resolve

⸻

265. Concurrency tests

Two organizer clients.

Test:

* both edit same running order
* both review same entry
* result finalizes while another has preview open
* permission revoked during active page
* show context changes remotely

No silent last-write-wins where dangerous.

⸻

266. Mobile tests

Critical flows on narrow viewport:

* task resolution
* entry review
* media review
* jury reminder
* running order change
* televote open/close
* result publication
* incident declaration

No horizontal desktop-table dependency.

⸻

267. Accessibility tests

Test:

* keyboard
* focus
* focus not obscured
* reduced motion
* text scaling
* drag alternatives
* target sizing
* screen-reader labels
* status not color-only

⸻

268. Network tests

Test:

* offline before action
* connection loss during command
* response lost after server success
* reconnect
* stale cache
* operation status lookup
* receipt recovery

⸻

269. PWA lifecycle

Test:

* background mid-review
* resume after voting state changed
* service worker update during draft
* old client against new state version

Critical work must survive or reconcile.

⸻

270. Visual tests

Use deliberately small reference set:

* Overview healthy
* Overview critical
* Tasks
* Delegation detail
* Entry review
* Media review
* Jury
* Televote live
* Results preflight
* Live Control
* Incident
* Consequence Sheet
* Conflict/reconciliation

Do not screenshot every admin page across endless viewport matrices on every commit.

⸻

Part LVI

Usability acceptance

271. Test rule

Tester receives scenario, not navigation instructions.

If tester cannot find the operation without being told the route, the design has failed.

⸻

272. Scenario A — jury

Prompt:

The Grand Final jury closes soon and four delegations have not submitted. Handle it.

Pass:

* identifies issue rapidly
* opens relevant state
* understands four missing
* sends reminder
* receives receipt
* Overview updates

⸻

273. Scenario B — entry resubmission

Prompt:

Oland corrected the song after a duration problem. Verify the correction.

Pass:

* finds resubmission
* sees revision diff
* listens/checks corrected asset
* understands old/new duration
* verifies
* task resolves

⸻

274. Scenario C — results blocked

Prompt:

Grand Final results are calculated but cannot be published. Find out why and continue as far as safely possible.

Pass:

* blocker visible
* direct link to blocker
* no hunt through multiple dashboards
* cannot bypass critical blocker accidentally

⸻

275. Scenario D — delivery failure

Prompt:

A required announcement failed for eight delegations.

Pass:

* sees affected count
* understands partial delivery
* retries only failed recipients
* no duplicate sends

⸻

276. Scenario E — running order

Prompt:

Move Oland from position 4 to position 7 and publish the corrected order.

Pass on phone and desktop.

Non-drag path works.

Preview accurately describes changes.

⸻

277. Scenario F — concurrent editing

Two organizers edit same high-value object.

Pass if:

* conflict detected
* changes understandable
* no silent overwrite
* safe resolution possible

⸻

278. Scenario G — incident

Prompt:

Public voting has stopped accepting votes during the Final.

Pass:

* incident can be declared
* impact visible
* roles clear
* mitigation actions available
* communications accessible
* timeline maintained

⸻

Part LVII

Quantitative success metrics

279. Operational metrics

Measure:
* time to identify highest-priority issue
* time to first correct action
* workflow completion time
* route backtracking
* dead-end rate
* accidental wrong-edition action attempts
* confirmation cancellations
* duplicated operations
* stale-state conflicts
* organizer support questions

⸻

280. Hunt metric

Key metric:

How often does the organizer manually search for a task Solaris already knows exists?

Target:

effectively zero

⸻

281. Error metric

Measure:

wrong action
wrong edition
wrong show
duplicate action
premature publish
unintended overwrite

Critical wrong-scope operations should be prevented, not merely measured.

⸻

282. Mobile parity metric

Critical workflow success on mobile must be comparable to desktop.

Phone is not considered complete merely because every feature technically renders.

⸻

Part LVIII

Release gates

283. Capability parity gate

Every legacy capability has:

* migration classification
* target owner
* target route
* parity evidence
* migration status

No unknown items.

⸻

284. Architecture gate

Pass if:

* canonical OrganizerContext exists
* organizer projections exist
* critical commands server-authoritative
* idempotency applied
* receipts available
* capability validation server-side
* state conflicts handled

⸻

285. UX gate

Pass if:

* top problem visible from Overview
* normal state quiet
* one primary action per operational context
* advanced controls progressively disclosed
* disabled operations explain blockers
* consequences shown before high-risk actions

⸻

286. Mobile gate

Pass if:

* all critical workflows usable one-handed where reasonably possible
* no desktop-table compression
* no drag-only requirement
* safe area correct
* keyboard/focus correct
* action targets accessible

⸻

287. Reliability gate

Pass if:

* duplicate submissions impossible
* uncertain command state reconcilable
* receipts recoverable
* stale state does not silently commit
* reconnect refreshes authoritative state

⸻

288. Permission gate

Pass if:

* search respects permissions
* routes respect permissions
* server commands respect permissions
* sensitive data does not leak through summaries
* least privilege applied

⸻

289. Production-safety gate

Pass only if automated verification proves:

* CI uses isolated/local Supabase
* Browser Audit uses isolated/local Supabase
* Playwright uses isolated/local Supabase
* no hosted production fallback
* production credentials absent from normal CI
* migration rehearsal isolated
* egress guards intact

Any regression is release-blocking.

⸻

290. Final CI gate

Final release evidence must come from the exact candidate commit SHA.

Required:

* quality
* typecheck
* unit tests
* contract tests
* migration rehearsal
* critical workflow tests
* selected browser interactions
* local Supabase safety guard
* accessibility checks
* production build

Do not claim success based on tests run on an earlier SHA.

⸻

Part LIX

Definition of Organizer V3 complete

Organizer V3 is complete only when:

Product

Organizer behaves as one coherent operating system.

Capability

Every valid current admin capability is preserved, redesigned, merged, contextualized, restricted or intentionally retired.

Navigation

The user experiences Overview · Tasks · Control · Live · More rather than dozens of unrelated destinations.

State

Canonical state drives all organizer projections.

Attention

Known problems surface automatically.

Tasks

Dead and duplicate tasks do not persist.

Context

Edition/show scope is unmistakable.

Reviews

Confirmation, Entry, Media and Integrity reviews have dedicated review workflows.

Voting

Jury and Televote state is operationally understandable.

Results

Official result lifecycle is deterministic, versioned, validated and safely published.

Live

Show operation prioritizes current and next actions.

Safety

High-consequence operations explain their consequence before commitment.

History

Important operations leave receipts and audit history.

Concurrency

Two organizers cannot silently destroy each other’s work.

Mobile

Critical workflows genuinely work on phone.

Accessibility

No important capability depends exclusively on drag, color, motion or tiny controls.

Permissions

Users see and can execute only appropriate capabilities.

Reliability

Critical commands are idempotent and recoverable.

Performance

Organizer loads projections rather than repeatedly downloading whole domains.

Infrastructure

Production Supabase is protected from automated test traffic.

QA

Critical scenarios objectively pass on the final candidate SHA.

⸻

Final intended Organizer experience

The organizer should not experience:

“Where the hell is the tool for this?”

or:

“Is this changing SSC21 or SSC22?”

or:

“Did that actually send?”

or:

“Why is Publish disabled?”

or:

“Why is a closed confirmation still telling me to act?”

or:

“Which of these twenty admin pages has the thing I need?”

The intended experience is:

Solaris shows me the problem before I search for it.

Solaris shows me the correct next action.

Solaris tells me exactly what that action will affect.

Solaris prevents me from operating on stale or wrong-scoped state.

Solaris remembers what happened afterward.

And when nothing is wrong, Solaris gets out of the way.

That is the implementation standard for Organizer V3.