Solaris Studio App V3

Complete Public, Fan & Participant Implementation Specification

Product · UX · Data · Architecture · Migration · Testing · Release

⸻

1. Status of this specification

This document is the implementation-ready extension for the entire non-Organizer Solaris Studio experience.

It covers:

* anonymous/public visitors
* authenticated fans
* country/delegation members
* HODs and delegation managers
* historical participants
* public participation
* fan engagement
* discovery
* archives
* results and analytics
* account and identity
* notifications
* PWA behavior
* all currently existing user-facing capabilities discovered from the real Solaris product

It supplements the canonical V3 blueprint.

Where this document is more specific about public, fan or participant implementation, this document wins.

Existing canonical V3 principles remain unchanged:

* V3 is not a backend rewrite.
* Working domain behavior should be preserved.
* Canonical server state remains authoritative.
* Home · Explore · Participate · Results · Me remains the primary public mental model.
* Critical submissions require authoritative server acknowledgement.
* Idempotency is mandatory for consequential submission.
* Multi-device conflicts must not silently overwrite newer work.
* Feature migration is incremental rather than a mega-launch.
* Production Supabase must never be used by automated testing.

⸻

Part I

Non-negotiable implementation doctrine

2. Capability parity before redesign

Implementation must begin with an exhaustive capability inventory.

No team may assume that the current V3 plan already lists every public feature.

Every existing user-facing capability must receive one explicit outcome:

REDESIGN
MERGE
CONTEXTUALIZE
RESTRICT
RETIRE

Nothing may remain:

UNKNOWN

at release.

⸻

3. Capability source of truth

The implementation inventory must be generated from all of:

src/routes/**
authenticated routes
navigation definitions
sitemap
search providers
notification types
deep-link definitions
feature flags
public APIs
participant APIs
database/domain entities
existing workflow tests
legacy redirects
PWA shortcuts
documentation
current production-visible behavior

Route scanning alone is insufficient.

Backend-only or notification-only capabilities still count.

⸻

4. Machine-readable Public Capability Registry

Create:

type PublicCapabilityMigration = {
  id: string;
  legacyRoutes: string[];
  legacyComponents: string[];
  backendOwners: string[];
  personas: PublicPersona[];
  authRequirement:
    | "public"
    | "optional"
    | "authenticated"
    | "delegation"
    | "hod";
  classification:
    | "redesign"
    | "merge"
    | "contextualize"
    | "restrict"
    | "retire";
  targetArea:
    | "home"
    | "explore"
    | "participate"
    | "results"
    | "me"
    | "live"
    | "auth"
    | "contextual";
  targetRoute: string;
  specificationStatus:
    | "discovered"
    | "mapped"
    | "specified"
    | "building"
    | "parity"
    | "cutover"
    | "retired";
  acceptanceScenarioId: string;
  migrationEvidence?: string;
};

Store the registry in version control.

⸻

5. Automated capability guard

CI must automatically detect new public capabilities.

At minimum inspect:

routes
navigation
feature flags
notification kinds
sitemap entries
PWA shortcuts

If a new feature appears without registry mapping:

FAIL
Unregistered Solaris capability detected:
src/routes/example-feature
Add this capability to the Public Capability Registry.

This turns “did we remember everything?” into an enforceable rule.

⸻

6. Design research requirements

All implementation should follow several evidence-backed principles.

Recognition instead of recall

Important actions and context remain visible.

Users should not have to remember:

* where voting lives
* what their delegation still owes
* which analysis tool contains a metric
* which menu contains saved content

NN/g recommends recognition rather than recall because visible contextual cues reduce user memory load. (Nielsen Norman Group)

Progressive disclosure

Frequently used functionality appears first.

Advanced analytics, archival tools and specialist controls remain discoverable but secondary.

This preserves Solaris’s extraordinary amount of functionality without turning every page into an aircraft cockpit. (Nielsen Norman Group)

Accessibility

Target WCAG 2.2 AA as minimum.

Dragging always has a simple pointer alternative.

Sticky surfaces must not obscure focused controls.

Pointer targets must satisfy WCAG requirements, while Solaris should retain its more comfortable ~44×44 target preference for primary mobile interactions. (W3C)

Authentication security

Authentication, session state and authorization must remain distinct.

Session identity must be renewed when privilege level changes, including anonymous → authenticated and role/capability changes. Server-side expiration remains authoritative. (OWASP Cheat Sheet Series)

Performance

Measure real-user performance.

Target at minimum:

LCP ≤ 2.5 s
INP ≤ 200 ms
CLS ≤ 0.1

at the 75th percentile for real users where practical.

Lab tests remain useful, but do not replace field measurement. (web.dev)

⸻

Part II

Personas and ViewerContext

7. Canonical personas

type PublicPersona =
  | "anonymous"
  | "fan"
  | "member"
  | "hod"
  | "historical_participant";

Organizer mode remains separate.

⸻

8. ViewerContext

Create one canonical viewer context:

type ViewerContext = {
  userId: string | null;
  authenticationState:
    | "anonymous"
    | "authenticated"
    | "refreshing"
    | "expired";
  memberships: MembershipSummary[];
  activeDelegationId?: string;
  capabilities: string[];
  language: string;
  timezone: string;
  spoilerMode:
    | "show"
    | "hide_until_reveal";
  accessibility: AccessibilityPreferences;
  installation:
    | "browser"
    | "standalone_pwa";
  contextVersion: number;
};

No feature independently re-derives role or delegation context.

⸻

9. Anonymous context

Anonymous users still receive:

* public contest state
* locale
* timezone
* spoiler preference if locally stored
* safe anonymous session state where necessary

Do not create privileged assumptions from anonymous session data.

⸻

10. Authentication transition

When anonymous → authenticated:

1. preserve return destination
2. preserve safe local preferences
3. preserve eligible incomplete public action context
4. authenticate
5. renew/regenerate authenticated session identity
6. fetch new ViewerContext
7. revalidate requested operation
8. return to original context if still valid

Example:

Grand Final
→ Vote
→ Sign in required
→ authentication
→ Grand Final voting
→ previous valid selection restored

If voting closed meanwhile:

Voting closed while you were signing in.
Your selection was not submitted.

⸻

11. Privilege change

When:

fan → delegation member
member → HOD
HOD → removed

refresh:

* session
* ViewerContext
* capabilities
* Journey
* Actions
* protected caches
* navigation

Never rely on stale client privilege.

⸻

Part III

Canonical Public API architecture

12. Preserve V3 focused projections

Do not create:

GET /everything-about-solaris

Build focused projections.

Canonical set:

AppBootstrap
CurrentContest
PublicHome
ExploreIndex
EntityProjection
Journey
Actions
Attention
LiveExperience
ResultsIndex
MeProjection
SearchProjection
NotificationProjection

⸻

13. AppBootstrap

Extend existing V3 model:

type AppBootstrap = {
  viewer: ViewerContext;
  primaryContext: {
    editionId?: string;
    showId?: string;
  };
  attentionSummary?: AttentionSummary;
  currentContest?: CurrentContestSummary;
  featureAvailability: Record<string, boolean>;
  serverTime: string;
  schemaVersion: number;
};

Keep lightweight.

⸻

14. PublicHome projection

type PublicHomeProjection = {
  experience: ExperienceState;
  now?: HomeNowItem;
  currentContest: CurrentContestCard;
  comingUp: HomeUpcomingItem[];
  latest: HomeUpdate[];
  personal?: HomePersonalSummary;
  live?: LiveSummary;
  optionalEngagement?: HomeEngagementSummary;
  serverTime: string;
  stateVersion: string;
};

Do not have Home components independently query every domain.

⸻

15. Explore projection

type ExploreProjection = {
  currentEdition?: EditionCard;
  featured: ExploreCollection[];
  countries: EntityCollection;
  artistsAndSongs: EntityCollection;
  shows: EntityCollection;
  stories: EntityCollection;
  archive: ArchiveSummary;
  personalized?: ExplorePersonalization;
  stateVersion: string;
};

⸻

16. EntityProjection

Standardize common public entities:

type PublicEntityType =
  | "edition"
  | "country"
  | "artist"
  | "song"
  | "show"
  | "story"
  | "rule"
  | "historical_event";

Every entity projection includes:

type PublicEntityProjection = {
  id: string;
  type: PublicEntityType;
  identity: EntityIdentity;
  canonicalUrl: string;
  visibility:
    | "public"
    | "restricted"
    | "unpublished";
  currentContext?: EntityCurrentContext;
  relationships: EntityRelation[];
  history?: EntityHistorySummary;
  follow?: FollowState;
  share?: ShareMetadata;
  updatedAt: string;
};

⸻

17. Result projections

Separate:

ResultSummary
OfficialResult
JuryResult
TelevoteResult
ScorechartProjection
CountryBreakdown
RelationshipAnalysis
VotingDNA
RecordsProjection
ResultLabInput
ReplayProjection
ComparisonProjection

A result page must not download every analysis dataset during initial render.

⸻

18. MeProjection

type MeProjection = {
  identity: UserIdentity;
  current: CurrentMembership[];
  history: HistoricalMembership[];
  activitySummary: ActivitySummary;
  followingSummary: FollowingSummary;
  savedSummary: SavedSummary;
  notificationSummary: NotificationSummary;
  accountSummary: AccountSecuritySummary;
};

⸻

Part IV

Universal mutation architecture

19. Critical user mutations

Use the canonical V3 pipeline:

intent
↓
authentication
↓
capability validation
↓
canonical-state validation
↓
idempotency check
↓
transaction / lock
↓
mutation
↓
receipt
↓
projection recompute
↓
realtime/event
↓
client reconciliation

The base V3 already establishes this pipeline.

⸻

20. Public command envelope

type UserCommand<T> = {
  command: string;
  editionId?: string;
  showId?: string;
  payload: T;
  expectedStateVersion?: string | number;
  idempotencyKey: string;
};

⸻

21. Critical operations requiring idempotency

At minimum:

confirmation submit
entry submit
entry resubmit
media finalization
jury submit
televote submit
prediction submit
Fantasy lock/submit
follow mutation where retries matter
account-sensitive operations

⸻

22. Operation response

type UserCommandResult<T> = {
  ok: boolean;
  operationId: string;
  receiptId?: string;
  result?: T;
  stateVersion: string | number;
  serverTime: string;
};

⸻

Part V

Public shell

23. Primary navigation

Remain:

Home
Explore
Participate
Results
Me

This is canonical.

⸻

24. Anonymous navigation

Anonymous visitor sees same mental architecture where meaningful.

If Participate has no currently anonymous action:

Participate

still explains available public opportunities rather than becoming a blank page.

Me becomes:

Sign in

with a public-account explanation.

Do not produce a completely different anonymous website.

⸻

25. Navigation state

Selected destination persists appropriately across:

* reload
* PWA resume
* deep-link entry
* back navigation

Back restores:

* list position
* filters
* selected tab where appropriate

⸻

26. Bottom-navigation behavior

Retain V3 expanded/compact behavior.

Compact mode is enhancement, not requirement.

Labels must remain where hiding them hurts discoverability or accessibility.

No essential interaction depends on long press or drag.

⸻

Part VI

Phase P0 — exhaustive capability freeze

27. Repository inventory

Before feature implementation:

recursively inventory:

src/routes/**

Classify each public/authenticated route.

Known current families already requiring classification include:

Home/index
Explore
Editions
Countries
Shows
Show Mode
Stories
Anniversary
Archive Games
Wiki
Encyclopedia
Guide
Library
Rules
Site Directory
Analysis
Compare
Scorecharts
Records
Relationships
Result Lab
Results
Voting DNA
Taste DNA
Pulse
Fantasy
Predictions
Prediction League
Televoting
Jury Voting
Participate
Next in Line
Confirmations
Me
Settings
Notifications
Auth
Country Hub
MySolaris

This list is not treated as exhaustive.

The automated inventory is.

⸻

28. Authenticated capability audit

Specifically map current country-hub:

HOD
Notices
Page Builder
Readiness
Theme

and current MySolaris capabilities such as:

Account
Activity
Country
Entry
History
Notices
Page Builder
Predictions
Saved
Tasks
Theme
Voting

into target V3 ownership.

No direct one-to-one screen preservation is required.

Capability preservation is.

⸻

29. Backend inventory

For each capability identify:

tables/views
RPCs
edge/server functions
storage buckets
notification triggers
permissions/RLS
realtime subscriptions
background jobs
receipts

⸻

30. Capability map artifact

Produce:

docs/v3/public-capability-registry.ts
docs/v3/public-capability-report.md

CI regenerates/checks report.

⸻

31. P0 exit gate

P0 completes only if:

all routes classified
all user-facing flags classified
all notification kinds classified
all public sitemap paths classified
all participant mutation endpoints classified
all known legacy redirects classified

⸻

Part VII

Phase P1 — shared design and interaction foundation

32. Implement common tokens first

Reuse canonical V3:

* semantic color
* typography
* spacing
* radii
* elevation
* glass/material levels
* motion
* reduced-motion variants
* reduced-transparency variants

Do not redesign every feature with custom styling.

⸻

33. Shared components

Implement/finish:

ActionCard
JourneyStep
EditionHero
EntityHero
CountryRow
SongRow
ArtistRow
ShowRow
ResultRow
StatusChip
Receipt
Sheet
Toast
SearchResult
EmptyState
ErrorState
OfflineState
Countdown
FollowButton
ShareButton

⸻

34. State coverage

Every shared component supports where relevant:

default
pressed
selected
loading
stale
offline
disabled
error
complete
locked

⸻

35. Accessibility primitive tests

Before feature migration test:

* keyboard
* focus visible
* focus not obscured
* screen reader naming
* dynamic text
* reduced motion
* reduced transparency
* pointer target sizes
* non-drag alternatives

⸻

Part VIII

Phase P2 — identity, auth and sessions

36. Consolidate auth shell

All authentication routes use one system:

Sign in
Invite acceptance
Recovery
Expired session
Access revoked
Return after authentication

⸻

37. Return intent

Create:

type AuthReturnIntent = {
  route: string;
  editionId?: string;
  showId?: string;
  action?: string;
  safeDraftRef?: string;
  expiresAt: string;
};

Never store sensitive command payloads directly inside return URLs.

⸻

38. Session expiry during workflow

If auth expires while:

* editing entry
* ranking jury
* confirming participation

preserve safe draft state.

After reauthentication:

1. fetch latest canonical state
2. compare revision
3. resolve conflict
4. continue

Do not simply reset the form.

⸻

39. Device/session management

Me → Account includes:

* current device
* other active sessions
* approximate last activity
* revoke session
* security history where appropriate

Server invalidation authoritative.

⸻

Part IX

Phase P3 — canonical public projections

40. Build projection services

Implement:

getAppBootstrap
getPublicHome
getCurrentContest
getJourney
getActions
getExploreIndex
getEntity
getLiveExperience
getResultsIndex
getMe

⸻

41. Query discipline

Projection endpoints must:

* select minimal columns
* aggregate server-side
* avoid N+1
* cache static data
* not independently refetch edition identity everywhere

Production egress is part of correctness, not an optional performance hobby.

⸻

42. Cache families

Example:

public:edition:{id}
public:country:{id}
public:show:{id}
public:result:{showId}:{resultVersion}
viewer:journey:{userId}:{editionId}
viewer:me:{userId}

Invalidate through domain events.

⸻

Part X

Phase P4 — Home

43. Preserve stable Home skeleton

Always:

Context
Now
Current Contest
Coming Up
Latest

Personalization only changes contents and emphasis.

Never completely rearrange Home for every contest state.

⸻

44. Implement Home experience resolver

Input:

ViewerContext
CurrentContest
Journey
Actions
Attention
Live state

Output:

HomeExperience =
  | "calm"
  | "action_required"
  | "urgent"
  | "show_day"
  | "live"
  | "voting"
  | "results"
  | "post_edition";

⸻

45. Home action budget

Maximum:

1 dominant action
2 secondary actions

Extra responsibilities link to Participate.

⸻

46. Anonymous Home

Anonymous prioritizes:

* current contest
* Live
* upcoming
* public vote
* results
* latest content

Do not show empty personal-task containers.

⸻

47. Fan Home

May add:

* followed-country update
* prediction/Fantasy state
* saved content continuation

Only one secondary personalization region.

⸻

48. HOD Home

Required delegation responsibilities outrank fan engagement.

Never show:

Make predictions!

above:

Entry correction required

⸻

Part XI

Phase P5 — Explore

49. Explore root

Implement:

Search
Current edition
Discover
Archive
More

⸻

50. Editorial ranking

Use rules-based ranking.

Inputs may include:

* current edition relevance
* current show
* recent publication
* editorial priority
* followed entities

Do not create a black-box engagement-maximization feed.

⸻

51. Collection component

Each collection defines:

type ExploreCollection = {
  id: string;
  title: string;
  type: string;
  items: EntityCard[];
  route?: string;
  reason?: string;
};

Limit root clutter.

⸻

Part XII

Phase P6 — Search

52. Search index

Index public:

* editions
* countries
* artists
* songs
* shows
* stories
* rules
* public tools
* wiki/encyclopedia content where retained

Authenticated index may additionally expose permitted private destinations.

⸻

53. Search response

type SearchProjection = {
  query: string;
  suggestions: SearchSuggestion[];
  groups: {
    editions: SearchResult[];
    countries: SearchResult[];
    music: SearchResult[];
    content: SearchResult[];
    tools: SearchResult[];
  };
};

⸻

54. Search quality

Implement:

* normalization
* typo tolerance
* prefix search
* aliases
* historical names
* debounced/cancelled request
* ranking
* query result limits

⸻

55. Spoiler filtering

Search result snippets must obey spoiler policy.

Never leak winner through:

SSC22 winning country Oland...

when user hides results.

⸻

Part XIII

Phase P7 — Edition entity

56. Edition state-aware projection

Support:

planning/public preview
upcoming
pre-show
show day
live
voting
results available
completed
archived
cancelled

⸻

57. Edition hierarchy

Header:

* artwork
* edition
* host
* state
* next meaningful event

Sections:

Overview
Participants
Songs
Schedule
Stories
Results

⸻

58. Live edition

While active:

Live becomes dominant.

No need to force navigation automatically.

⸻

59. Archived edition

Remove stale action CTAs.

Prioritize:

* winner
* participants
* songs
* shows
* results
* historical content

⸻

Part XIV

Phase P8 — Country

60. Country projection

type CountryProjection = {
  identity: CountryIdentity;
  currentParticipation?: CountryParticipation;
  currentEntry?: EntryPublicSummary;
  currentResult?: ResultSummary;
  history: CountryEditionHistory[];
  votingProfile?: VotingProfileSummary;
  stories: StorySummary[];
  follow: FollowState;
};

⸻

61. Country states

Support:

participating
not participating
withdrawn
disqualified
future
historical only

⸻

62. Historical identity

Country identity changes must not rewrite history incorrectly.

Allow edition-specific:

* display name
* flag
* historical identity

while retaining canonical country lineage.

⸻

Part XV

Phase P9 — Artist and Song

63. Artist entity

Implement first-class artist page:

* identity
* photo
* biography
* country relationship
* songs
* editions
* results
* stories

⸻

64. Song entity

Implement:

* title
* artist
* country
* edition
* credits
* media
* show appearances
* result
* analysis links
* stories

⸻

65. Publication safety

Unpublished entries must not leak through:

* entity endpoint
* search
* Open Graph
* sitemap
* preload
* HTML source
* API error messages

⸻

Part XVI

Phase P10 — Shows and public Live

66. Public Show

State model:

upcoming
starting_soon
live
paused
delayed
voting
results_pending
complete
cancelled

⸻

67. Show sections

* overview
* running order
* broadcast
* voting
* updates
* result

⸻

68. LiveExperience projection

type LiveExperience = {
  show: ShowSummary;
  state: ShowState;
  currentPerformance?: PerformanceSummary;
  nextPerformance?: PerformanceSummary;
  progress?: {
    current: number;
    total: number;
  };
  voting: PublicVotingState;
  updates: LiveUpdate[];
  broadcast?: BroadcastLink;
  freshness: {
    stateVersion: string;
    updatedAt: string;
  };
};

⸻

69. Truthfulness rule

If Solaris does not know the exact current performance because broadcast state is manual/external:

do not fabricate certainty.

Show:

Show live

rather than an invented “Now performing” state.

⸻

70. Live reconnect

On reconnect:

* fetch authoritative snapshot
* reconcile event stream
* update current/next
* explain significant missed state if relevant

⸻

Part XVII

Phase P11 — Participate shell

71. Responsibility model

Participate has:

Responsibilities
Needs attention
Next
Optional now
Completed

⸻

72. Journey derivation

Server derives:

type JourneyProjection = {
  editionId: string;
  responsibilities: JourneyStep[];
  optionalParticipation: OptionalParticipation[];
  completed: JourneyStep[];
};

⸻

73. Required beats optional

Ordering:

1. blocked required
2. urgent required
3. active required
4. upcoming required
5. optional
6. completed

⸻

74. Dead task prevention

An action disappears/changes automatically when canonical condition changes.

Examples:

* confirmation submitted
* round closed
* requirement waived
* jury submitted
* entry verified

⸻

Part XVIII

Phase P12 — Confirmation

75. Full state machine

unavailable
upcoming
open
draft
submitted
under_review
correction_required
resubmitted
completed
closed
waived

⸻

76. Confirmation draft

Server-backed revisioned draft where applicable.

type ConfirmationDraft = {
  id: string;
  revision: number;
  serverRevision: number;
  updatedAt: string;
};

⸻

77. Deadline close race

If deadline passes while open:

* preserve draft locally/server-side as policy allows
* disable final submission
* fetch authoritative status
* explain closure

Never show “submitted” without receipt.

⸻

78. Reopen

If organizer reopens confirmation:

Participate resurfaces task.

User sees:

Confirmation reopened
Reason:
Updated information required.

⸻

Part XIX

Phase P13 — Entry submission

79. Entry editor sections

Song
Artist
Credits
Metadata
Media
Review

⸻

80. Entry canonical draft

type EntryDraft = {
  entryId: string;
  revision: number;
  serverRevision: number;
  status: EntryState;
  lastSavedAt: string;
  changedFields: string[];
};

⸻

81. Field validation

Validation contract includes:

required
format
length
file requirement
rule-dependent validation
warning
blocking error

Do not rely only on client validation.

⸻

82. Autosave

Autosave safe draft changes.

UI states:

Saving…
Saved
Saved offline
Conflict

Never:

Submitted

during autosave.

⸻

83. Entry submission

Flow:

Edit
→ Review
→ Validate
→ Submit
→ server acknowledgement
→ receipt

⸻

84. Changes required

Task includes exact issue.

Opening focuses the affected section.

Example:

Artist image needs replacement
Submitted:
900 × 500
Required:
minimum width 1200 px

⸻

85. Resubmission

Show:

Changed
Artist image
Unchanged
Song
Credits
Audio

Then:

Review changes
→ Resubmit

⸻

Part XX

Phase P14 — Media

86. Upload pipeline

queued
uploading
processing
validating
accepted
failed
quarantined
replacement_required

⸻

87. Resumability

Where infrastructure allows:

support safe retry/resume.

A retry must not create multiple logical assets.

⸻

88. Upload progress

Show actual progress where available.

Never animate fake linear progress indefinitely.

⸻

89. Processing

Separate:

Upload complete
Processing…

so users understand their device has finished transmitting.

⸻

Part XXI

Phase P15 — Jury

90. Preserve strong existing V3 architecture

Jury remains:

Overview
Ranking
Review
Submit
Receipt

⸻

91. Draft revisioning

Maintain existing:

draft_id
revision
updated_at
device_id/session_id
server_revision

⸻

92. Cross-device conflict

Do not automatically merge ranking changes.

Show newest revision and offer:

Review newest
Restart from newest

⸻

93. Accessible ranking

Support:

* drag
* move up/down
* select position
* keyboard

Drag never exclusive.

⸻

94. Submission uncertainty

If network dies:

Checking submission status…

Resolve by idempotency/operation key.

Do not invite duplicate resubmit before status is known.

⸻

Part XXII

Phase P16 — Public Televote

95. Voting availability

Projection defines:

locked
upcoming
open
submitted
extended
closed
results_published

⸻

96. Eligibility

Server determines eligibility.

Client displays reason when user cannot vote.

⸻

97. Voting interaction contract

According to configured voting system:

* select
* rank
* allocate points
* validate

Do not hardcode a single selection model across all shows.

⸻

98. Review

Before final submit:

show all selected votes clearly.

⸻

99. Final submission

Use idempotent server command.

Return receipt.

⸻

100. Already submitted

Reopening shows:

✓ Vote received

with receipt/status.

Do not accidentally offer a second vote unless voting rules explicitly permit editing/resubmission.

⸻

101. Extension

Canonical close time updates via realtime/event.

Countdown derives from server-relative time.

⸻

Part XXIII

Phase P17 — Next in Line and side participation

102. Audit Next in Line

Determine current actual capability.

Map into:

Participate → Optional participation

or a dedicated edition-context feature.

⸻

103. Side-participation rule

All side competitions use the same:

availability
deadline
draft
submission
receipt
history

foundation where possible.

Do not reinvent form infrastructure.

⸻

Part XXIV

Phase P18 — Fantasy

104. Fantasy domain

Implement canonical states:

unavailable
upcoming
open
draft
submitted
locked
live_scoring
settled
archived

⸻

105. Fantasy onboarding

Explain briefly:

* goal
* budget
* roster rules
* scoring
* deadline

Then:

Build team

Do not require users to read a novel before playing.

⸻

106. Roster builder

Display:

* remaining budget
* roster requirements
* eligible entries
* costs
* current selection

Validation immediate.

⸻

107. Lock

Server-authoritative deadline.

After lock:

roster becomes read-only unless rules explicitly provide correction.

⸻

108. Live scoring

Derived from versioned scoring rules and official contest state.

If results change/correct:

recompute with explicit scoring-version handling.

⸻

109. Fantasy leaderboard

Support:

* overall
* user position
* friends/community scope if actually supported
* historical editions

⸻

Part XXV

Phase P19 — Predictions and Prediction League

110. Capability reconciliation

Audit both current products.

Decide:

MERGE

unless they have genuinely different user jobs.

⸻

111. Prediction states

upcoming
open
submitted
locked
scoring
scored
archived

⸻

112. Prediction types

Use configuration rather than separate one-off UIs where practical.

Examples:

* qualifier selection
* winner
* placement
* categorical prediction

⸻

113. Scoring

Scoring configuration versioned.

Historical prediction score remains reproducible.

⸻

114. Leaderboard

Explain:

* points
* position
* scoring basis

No mysterious score.

⸻

Part XXVI

Phase P20 — Pulse

115. Audit first

Do not redesign based on name.

Document current:

* purpose
* data
* user actions
* audience
* dependencies
* historical use

⸻

116. Classification

After audit choose:

REDESIGN
MERGE
RETIRE

If retained, generate full Feature Implementation Contract before implementation.

This pattern applies to every capability discovered after this plan is written.

⸻

Part XXVII

Phase P21 — Taste DNA

117. Audit current capability

Determine whether it represents:

* user taste profile
* prediction/preferences
* result analysis
* recommendation engine
* voting history

⸻

118. Relationship with Voting DNA

Explicitly separate:

Taste DNA
= user's preference/taste model

from:

Voting DNA
= contest/country voting pattern analysis

if that reflects actual current behavior.

If not, merge.

⸻

Part XXVIII

Phase P22 — Following and Saved

119. Follow model

Canonical:

type Follow = {
  userId: string;
  entityType: string;
  entityId: string;
  notificationLevel:
    | "none"
    | "important"
    | "all";
};

⸻

120. Followable objects

Only enable for meaningful entities discovered by product requirements.

Potential:

* country
* artist
* edition

Do not add follow buttons to everything because databases contain IDs.

⸻

121. Saved content

MySolaris currently exposes Saved.

Map into:

Me → Saved

or:

Me → Following & Saved

based on actual current semantics.

⸻

Part XXIX

Phase P23 — Notifications and Notices

122. Unified notification architecture

Distinguish:

personal notification
official delegation notice
system announcement
content/follow update

⸻

123. Notification contract

type UserNotification = {
  id: string;
  type: string;
  deliveryClass:
    | "required"
    | "recommended"
    | "optional";
  title: string;
  body: string;
  route?: string;
  subject?: {
    type: string;
    id: string;
  };
  expiresAt?: string;
  dedupeKey: string;
  spoilerSensitive: boolean;
  resolvedAt?: string;
};

⸻

124. Why this?

Important notifications support:

Why am I seeing this?

with clear cause.

⸻

125. Delegation notices

Country Hub / MySolaris notices should become one canonical delegation-notice capability rather than duplicated surfaces if semantics overlap.

⸻

Part XXX

Phase P24 — Results root

126. Result first

Opening Results shows official result immediately.

Not:

choose from 14 analysis tools

⸻

127. Main modes

Combined
Jury
Televote

⸻

128. Personal context

If relevant:

Your result
Oland · 1st · 312

without dominating public result.

⸻

129. Spoiler protection

Before reveal:

SSC22 results are available
[Reveal]

No winner leaks through:

* heading
* image alt text
* metadata
* notifications
* search
* cached Home
* social preview shown inside app

⸻

Part XXXI

Phase P25 — Scorecharts

130. Shared analysis context

Every analysis tool receives:

type ResultAnalysisContext = {
  editionId: string;
  showId: string;
  resultVersionId: string;
  mode?: string;
};

⸻

131. Scorechart desktop

Support dense interactive representation.

⸻

132. Scorechart mobile

Do not shrink desktop visualization into illegible confetti.

Provide:

* simplified view
* drill-down
* entry filter
* accessible tabular alternative

⸻

133. URL state

Filters/selections should be shareable where sensible.

⸻

Part XXXII

Phase P26 — Country breakdown and Relationships

134. Country breakdown

Allow:

* source country
* recipient
* points
* jury/public mode
* edition/show context

⸻

135. Relationships

Every relationship metric includes:

metric definition
sample range
editions included
minimum sample
interpretation
limitations

No unexplained:

Relationship: 87

⸻

Part XXXIII

Phase P27 — Voting DNA

136. Voting DNA

Define dimensions from actual current implementation.

Every derived score:

* reproducible
* versioned if formula changes
* explained
* historically scoped

⸻

137. Insufficient data

Show:

Not enough data yet

rather than statistically dubious output.

⸻

Part XXXIV

Phase P28 — Records

138. Records taxonomy

Classify:

* edition
* country
* artist/song
* result
* voting
* participation

⸻

139. Record provenance

Every record links to underlying historical result/source.

⸻

Part XXXV

Phase P29 — Compare

140. Compare architecture

Audit existing feature and migrate valid dimensions.

Potential comparison entities:

country ↔ country
edition ↔ edition
result ↔ result

only when data meaningfully supports comparison.

⸻

141. Comparison selection

Prefer visible entity selection rather than requiring exact names from memory.

⸻

Part XXXVI

Phase P30 — Result Lab

142. Simulation isolation

Persistent:

SIMULATION
Official results are unchanged.

⸻

143. Simulation parameters

Only expose meaningful supported adjustments.

⸻

144. Result Lab URL/share

Simulation configuration may be encoded/shareable safely if data volume and sensitivity allow.

Never write simulation into official result tables.

⸻

Part XXXVII

Phase P31 — Replay

145. Replay model

Where retained, replay should reconstruct result/reveal progression from immutable historical events.

Do not fake historical sequence from current ranking alone if actual reveal data exists.

⸻

Part XXXVIII

Phase P32 — Stories

146. Story directory

Support:

* current
* edition-related
* country-related
* historical

⸻

147. Story detail

Includes:

* artwork
* publication time
* content
* related entities
* related stories
* share

⸻

148. Spoiler-aware story previews

If content includes unrevealed result information:

mark/suppress preview according to spoiler policy.

⸻

Part XXXIX

Phase P33 — Wiki and Encyclopedia

149. Capability audit

Determine genuine difference.

If both perform essentially historical/reference lookup:

merge under one clear archive/reference product.

⸻

150. Reference article

Implement:

* title
* hierarchy
* table of contents
* internal links
* entity links
* search
* related articles
* canonical URL

⸻

151. Historical routing

Old Wiki/Encyclopedia URLs redirect to equivalent V3 content where merged.

Preserve external links.

⸻

Part XL

Phase P34 — Archive

152. Archive root

Provide:

Editions
Countries
Songs
Artists
Shows
Stories
Reference
Games

according to retained capabilities.

⸻

153. Historical context lock

Archived screens clearly show edition/time context.

Never display current Participation CTA while browsing a 2022 edition.

⸻

Part XLI

Phase P35 — Archive Games

154. Inventory every game

Each game gets own registry child capability.

⸻

155. Shared game shell

Provide:

* rules
* start
* progress
* score
* finish
* retry
* share where relevant
* accessible controls

⸻

Part XLII

Phase P36 — Anniversary

156. Anniversary surface

Audit current feature then build retained experience around:

* milestone
* timeline
* stories
* historic moments
* special artwork
* relevant archive links

⸻

157. Temporary-event behavior

When anniversary period ends:

content remains discoverable through archive without hijacking current Home.

⸻

Part XLIII

Phase P37 — Guide and Help

158. Contextual help

Prefer:

?
How this works

inside relevant workflows.

⸻

159. Guide root

Retain searchable Guide only when useful.

Topics:

* participating
* voting
* account
* Fantasy/predictions
* results
* rules

Do not require Guide reading for normal operation.

⸻

Part XLIV

Phase P38 — Library

160. Audit semantics

Determine what current Library actually owns.

Do not implement based on its label alone.

⸻

161. Target classification

Map to:

* Saved
* Archive
* Media/reference
* or another correct destination

then preserve capability rather than route.

⸻

Part XLV

Phase P39 — Rules

162. Public rulebook

Implement:

* current edition/version
* table of contents
* search
* rule anchors
* deep links
* effective date
* previous versions

⸻

163. Contextual linking

Entry/Jury/Confirmation warnings deep-link directly to relevant rule.

⸻

Part XLVI

Phase P40 — Me

164. Me root

Canonical sections:

Identity
Current
History
Activity
Following & Saved
Preferences
Account

⸻

165. Identity

Display:

* user identity
* delegation
* role

Avoid exposing implementation role codes.

⸻

166. Current

Show active membership/edition relationships.

⸻

167. History

Past:

* editions
* countries
* roles

⸻

168. Activity

Canonical history of meaningful user actions:

* submissions
* receipts
* voting participation where policy permits
* game participation where useful

⸻

169. Following & Saved

Merge current MySolaris saved/follow state coherently.

⸻

Part XLVII

Phase P41 — Preferences

170. Notification preferences

Per category where valuable.

Avoid dozens of meaningless toggles.

⸻

171. Spoilers

Global preference:

Show immediately
Hide until reveal

⸻

172. Language

Persist server-side for authenticated users and locally for anonymous visitors.

⸻

173. Accessibility

Store user-selectable options only where they supplement OS/browser settings.

Never override platform accessibility preferences unexpectedly.

⸻

Part XLVIII

Phase P42 — Account

174. Account page

Sections:

Security
Devices & sessions
Privacy
Access
Account actions

⸻

175. Logout

Server invalidates current authenticated session.

Cookie deletion alone is insufficient security architecture.

⸻

176. Revoke other session

Require reasonable authentication assurance.

Reflect revoked session promptly.

⸻

Part XLIX

Phase P43 — Country Hub

177. Country Hub purpose

Country Hub capabilities should migrate into V3 participation/delegation experience rather than remain a miniature second app.

Current capabilities require explicit mapping:

HOD
Notices
Page Builder
Readiness
Theme

⸻

178. HOD management

If participant-facing HOD profile/configuration exists:

place under:

Me
→ Delegation

or:

Participate
→ Delegation

depending on user job.

⸻

179. Delegation readiness

If readiness is informational for HOD:

surface within Participate Journey.

Avoid duplicate readiness dashboard.

⸻

180. Country page builder

Treat as a content-authoring workflow.

State model:

draft
preview
published

with versioning.

⸻

181. Country theme

If retained:

* constrained design tokens
* accessible contrast validation
* preview
* versioned publish

Never permit delegation theme customization to break app-wide accessibility/layout.

⸻

Part L

Phase P44 — Notifications deep links

182. Deep-link resolver

All internal deep links pass through current-state resolution.

Conceptual:

resolveDeepLink({
  destination,
  viewer,
  currentState
})

⸻

183. Stale action link

Example:

old jury push opened after close:

Jury voting has closed.
Your ballot was submitted ✓
[View receipt]

not stale ranking editor.

⸻

Part LI

Phase P45 — PWA

184. Installation

Provide installation education only when useful.

Do not bombard every browser visitor with install banners.

⸻

185. Standalone startup

Restore:

* route
* viewer context
* cached shell

then validate server state.

⸻

186. Service-worker update

Never activate destructive UI update during:

* entry editing
* jury ranking
* confirmation
* vote review

Prompt when safe.

⸻

187. Offline browsing

Cache safe public/static content.

Show quiet:

Offline

⸻

188. Offline critical workflows

Draft where safe.

Final mutations remain pending/not submitted until acknowledged by server.

⸻

Part LII

Phase P46 — SEO and public sharing

189. Public metadata

Each indexable page defines:

title
description
canonical URL
Open Graph
sitemap inclusion
index/noindex

⸻

190. Protected pages

Never expose private data through SSR metadata or social previews.

⸻

191. Renames

Maintain redirects for renamed:

* countries
* editions
* features
* merged Wiki/reference routes

⸻

Part LIII

Phase P47 — performance architecture

192. Bundle strategy

Route-split advanced tools.

Initial Home should not download:

* Result Lab
* Fantasy builder
* Wiki editor code
* advanced scorechart libraries

because those exist somewhere in Solaris.

⸻

193. Image delivery

Use appropriate:

* dimensions
* responsive sources
* lazy loading
* focal crops
* modern formats where infrastructure permits

Do not destroy flag/image fidelity.

⸻

194. Analysis data

Large result datasets:

* paginate
* aggregate
* lazy load
* cache by immutable result version

⸻

195. Field performance

Collect privacy-respecting real-user:

* LCP
* INP
* CLS
* route transition timing
* critical command latency

Lab testing alone cannot capture all real interaction and layout behavior. (web.dev)

⸻

Part LIV

Phase P48 — privacy

196. Data inventory

Every capability documents:

data collected
purpose
visibility
retention
deletion/anonymisation

⸻

197. Public/private projection separation

Never rely solely on frontend hiding.

Private participant fields must not be selected into public payloads.

⸻

Part LV

Phase P49 — accessibility

198. WCAG baseline

Release target:

WCAG 2.2 AA

⸻

199. Drag alternatives

Mandatory for:

* Jury
* any game reorder
* custom ranking tools

⸻

200. Focus

Bottom navigation, sticky CTA and sheets must not obscure keyboard focus.

⸻

201. Status announcements

Dynamic events:

draft saved → polite
submission succeeded → polite
critical closure → assertive where appropriate

Avoid entire-page rereads.

⸻

Part LVI

Phase P50 — responsive

202. Required viewport classes

Test:

320–374
375–430
431–520
tablet portrait
tablet landscape
desktop
wide desktop

⸻

203. Phone rule

No desktop table compression.

Transform data to:

* cards
* drilldowns
* horizontal visualization only when genuinely required

⸻

Part LVII

Migration

204. No mega-launch

Use feature flags for major slices.

Suggested flags:

v3_public_shell
v3_home
v3_explore
v3_participate
v3_results
v3_me
v3_live
v3_fan_engagement
v3_archive

⸻

205. Strangler migration

Legacy route:

/old-feature

may temporarily render under new shell.

Then:

old data
→ new projection
→ new experience
→ parity verification
→ redirect
→ old UI removal

⸻

206. Feature cutover requirement

Do not cut over until:

* data parity
* capability parity
* URL/deep-link handling
* auth handling
* mobile
* accessibility
* acceptance scenario

all pass.

⸻

207. Legacy route retirement

Preserve redirect if:

* bookmarked
* indexed
* externally shared
* linked from notifications/history

⸻

Part LVIII

Testing architecture

208. Component tests

Cover all shared variants.

⸻

209. Contract tests

Mandatory:

ViewerContext
AppBootstrap
CurrentContest
PublicHome
Journey
Action
Attention
EntityProjection
LiveExperience
Result projections
MeProjection
Notification
Receipt

⸻

210. State-machine tests

For each domain test:

valid transition
invalid transition
expired state
stale version
duplicate command
unauthorized command

⸻

211. Workflow tests

Mandatory:

anonymous browsing
sign in and return
confirmation
entry
entry correction
media replacement
jury
televote
Fantasy
prediction
following
Live
result reveal
account/session

⸻

212. Cross-feature journey tests

Examples:

Google
→ Edition
→ Country
→ Follow
→ sign in
→ Country restored
Push
→ entry correction
→ upload
→ resubmit
→ receipt
→ Participate cleared
Home
→ Live
→ Vote
→ Receipt
→ Results
→ Scorechart

⸻

213. Anonymous tests

Verify:

* no private leaks
* public pages usable
* auth prompts contextual
* sign-in returns correctly
* SEO rendering valid

⸻

214. Multi-device tests

At minimum:

* Jury conflict
* Entry conflict
* notification resolved elsewhere
* session revoked elsewhere
* vote already submitted elsewhere

⸻

215. Network uncertainty tests

For every critical command:

1. send command
2. server commits
3. response disappears
4. client reconnects
5. operation is reconciled
6. duplicate is not created

⸻

216. Time-bound tests

Test:

* deadline while form open
* televote extension
* voting closes
* results publish
* show delayed
* edition transitions

Use controlled server time.

⸻

217. Accessibility automation plus manual verification

Automated accessibility tests are necessary but insufficient.

Manually test representative workflows with:

* keyboard
* VoiceOver/screen reader
* large text
* reduced motion

⸻

218. Visual regression

Small deliberate golden set.

Include:

Home calm
Home required action
Home live
Explore
Edition
Country
Participate
Entry correction
Jury
Televote
Results
Scorechart mobile
Me
Auth return
Offline
Reconciliation error

Do not screenshot every route × viewport × state on every commit.

⸻

Part LIX

Supabase and test safety

219. Permanent absolute rule

Automated:

* CI
* browser tests
* Playwright
* migration rehearsal
* screenshot testing
* QA crawlers

must never use production Supabase.

⸻

220. Local test backend

Normally:

127.0.0.1:54321

or another explicitly isolated environment.

⸻

221. Fail closed

If local Supabase unavailable:

FAIL TEST

Never:

fallback to production

⸻

222. Capability-crawl safety

The new capability inventory CI may inspect repository files.

It must not browse every production route to discover features.

Discovery should be static/repository based.

⸻

Part LX

Feature-level Definition of Done

223. Every feature must satisfy all fields

Before parity:

Capability registry mapping ✓
Purpose ✓
Persona behavior ✓
Route ownership ✓
Canonical data ✓
State machine ✓
Projection/API ✓
Mutations ✓
Authentication behavior ✓
Loading ✓
Empty ✓
Errors ✓
Offline ✓
Stale state ✓
Mobile ✓
Desktop ✓
Accessibility ✓
Notifications ✓
Deep links ✓
Spoiler policy ✓
Performance ✓
Migration ✓
Tests ✓
Acceptance scenario ✓

No “N/A” without written justification.

⸻

Part LXI

Acceptance scenarios

224. Anonymous explorer

Prompt:

Find Oland's SSC21 entry and then find the final result.

Pass without knowing Solaris navigation.

⸻

225. Anonymous live viewer

Find tonight's live show and see who is currently performing.

If current performance unavailable authoritatively, interface explains live state honestly.

⸻

226. Fan

Follow Oland and make sure you will get important updates without result spoilers.

⸻

227. HOD

Find everything your delegation still needs to finish for SSC22.

No route knowledge.

⸻

228. Entry correction

The organizer says your artist image is invalid. Fix it.

User sees exact problem and direct correction.

⸻

229. Jury conflict

Start ranking on phone, alter on desktop, resume phone.

Pass if no work silently disappears.

⸻

230. Public vote uncertainty

Submit vote while network response is interrupted.

Pass if system reconciles rather than duplicating vote.

⸻

231. Fantasy

Create a valid Fantasy team before the deadline.

Rules and invalid roster constraints understandable without manual.

⸻

232. Predictions

Submit predictions and later understand exactly how your score was calculated.

⸻

233. Results nerd

Compare Oland's jury and public performance and investigate its historical voting relationships.

Analysis is discoverable without cluttering primary Results view.

⸻

234. Archive

Find SSC14, its winner and a country that participated.

⸻

235. Saved/history

Find a receipt from a previous edition.

⸻

236. Auth deep link

Logged-out user opens protected task link.

After sign-in they return to exact task if still valid.

⸻

Part LXII

Metrics

237. Core public metrics

Measure:

* Home → meaningful action time
* search success
* search reformulation
* Explore dead ends
* task completion
* submission failures
* duplicate operations
* deep-link failures
* auth-return failures
* feature hunt rate
* performance
* mobile completion rate

⸻

238. Hunt metric

Most important:

How often does someone manually search for something Solaris already knows they need?

Target:

effectively zero

⸻

239. Discovery metric

For archive/analysis features:

measure ability to find feature through ordinary hierarchy without prior route knowledge.

⸻

240. Critical-flow reliability

Target:

no ambiguous submission success
no silent draft overwrite
no duplicate official submit
no private/public leak

⸻

Part LXIII

Release sequence

241. Recommended implementation order

P0 Capability Registry
↓
P1 Shared UI
↓
P2 Auth / ViewerContext
↓
P3 Projections
↓
P4 Home
↓
P5 Explore
↓
P6 Search
↓
P7–P10 Core public entities
↓
P11 Participate shell
↓
P12–P16 Critical submissions
↓
P17 Side participation
↓
P18–P23 Fan features
↓
P24–P31 Results + advanced analysis
↓
P32–P39 Content / archive / rules
↓
P40–P44 Me / Country Hub / notifications
↓
P45–P50 PWA / SEO / performance / accessibility
↓
migration / cutover
↓
parity audit
↓
final acceptance

The exact PR boundaries may differ.

Dependencies must not.

⸻

Part LXIV

Release gates

242. Capability gate

Every discovered public capability mapped.

Zero unknown capabilities.

⸻

243. Persona gate

Pass all:

anonymous
fan
member
HOD
historical participant

⸻

244. Critical submission gate

Confirmation, Entry, Media, Jury and Televote:

* authoritative
* idempotent
* recoverable
* receipted

⸻

245. Auth gate

Pass:

* anonymous → authenticated
* invite
* session expiry
* role change
* protected deep link
* logout
* session revocation

⸻

246. Discovery gate

Users can find:

* current edition
* country
* song
* show
* archive
* public rules
* advanced results tools

without knowing route names.

⸻

247. Engagement gate

Every retained:

* Fantasy
* prediction
* Pulse
* Taste DNA
* Archive Game
* following/saved capability

has feature-level acceptance evidence.

⸻

248. Results gate

All retained analysis tools:

* use canonical result version
* explain derived metrics
* work on mobile
* remain shareable/deep-linkable where intended
* cannot mutate official result

⸻

249. Accessibility gate

No critical operation relies only on:

* drag
* color
* motion
* hover
* tiny targets

⸻

250. Performance gate

Real-user monitoring exists for core public routes.

Performance regressions investigated before release.

⸻

251. Privacy gate

Public endpoints/search/metadata cannot expose unpublished/private participant data.

⸻

252. Infrastructure gate

Automated test configuration proves isolated/local Supabase before execution.

No production fallback.

This remains release-blocking.

⸻

253. Exact-SHA gate

Final evidence comes from exact release candidate SHA.

Required final evidence:

typecheck
lint
unit tests
contract tests
state-machine tests
migration rehearsal
workflow tests
accessibility tests
selected browser tests
production build
capability parity report
local-Supabase guard

⸻

Part LXV

Final capability-parity review

254. Re-run discovery

At end of implementation rerun the same P0 discovery against final repository.

Compare:

initial capabilities
final capabilities

Any new feature added during V3 development must also be classified.

⸻

255. Zero-orphan requirement

Release fails if any of these exists without V3 ownership:

public route
authenticated participant route
navigation item
notification
PWA shortcut
searchable tool
public sitemap page
user mutation API
feature flag
valid legacy workflow

⸻

256. Intentional retirement record

Retired capability requires:

reason
data handling
replacement
redirect
migration
approval
test

“No longer linked from navigation” is not retirement.

It is hiding evidence.

⸻

Part LXVI

Definition of complete Public V3

The public, fan and participant side of Solaris V3 is complete only when:

Capability

Every real capability has explicit V3 ownership.

Public browsing

Anonymous users can fully browse permitted Solaris content without a degraded second-class architecture.

Authentication

Signing in enhances the current journey rather than restarting it.

Home

Shows what matters now.

Explore

Makes the huge Solaris world discoverable without becoming a directory dump.

Entities

Edition, Country, Artist, Song, Show and Story behave as one coherent entity system.

Participate

Shows official responsibilities before optional fun.

Confirmation

No duplicates, dead tasks or ambiguous submissions.

Entry

Draft, revision, correction and resubmission are safe across devices.

Media

Upload and replacement states are explicit.

Jury

Drafts survive interruption and conflicts cannot silently destroy work.

Televote

Voting is authoritative, idempotent and receipted.

Fan systems

Fantasy, Predictions, Pulse, Taste DNA and every other retained engagement system have deliberate V3 experiences rather than legacy leftovers.

Live

Reflects authoritative show state without inventing information.

Results

Official results remain primary while advanced analysis remains richly discoverable.

Archive

Historical Solaris is comprehensible without stale current actions.

Me

Identity, history, activity, saved content, preferences and account management have clear ownership.

Notifications

Every important notification has a reason, destination and resolved state.

PWA

Install, cold start, resume, updates and offline behavior protect critical work.

Accessibility

Critical functionality works with keyboard, screen reader, large text and non-drag controls.

Performance

Core public experiences meet realistic performance expectations on actual devices and networks.

Privacy

Private participant data never leaks through public interfaces.

Reliability

No consequential operation can succeed ambiguously.

Infrastructure

No automated verification touches production Supabase.

Evidence

All release gates pass on the exact release candidate SHA.

⸻

Final implementation principle

Do not implement Solaris V3 by working through a hand-written list and eventually reaching the bottom.

Implement it through a closed capability loop:

CURRENT SOLARIS
        ↓
CAPABILITY DISCOVERY
        ↓
CAPABILITY REGISTRY
        ↓
V3 OWNERSHIP
        ↓
FEATURE IMPLEMENTATION CONTRACT
        ↓
SHARED V3 ARCHITECTURE
        ↓
IMPLEMENTATION
        ↓
FEATURE ACCEPTANCE
        ↓
CAPABILITY PARITY
        ↓
RE-SCAN PRODUCT
        ↓
ZERO ORPHANS
        ↓
RELEASE

That loop remains part of Solaris permanently.

Therefore when somebody adds a strange new feature six months later, V4 does not eventually discover it living behind /super-duper-statistics-thing with three users and its own design system.

Solaris knows it exists from the moment it enters the product.