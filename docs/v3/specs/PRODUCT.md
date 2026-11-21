SOLARIS STUDIO V3

COMPLETE MASTER PRODUCT, SCREEN, UX, SYSTEM, IMPLEMENTATION & RELEASE PLAN

Canonical Product Direction · Complete Screen Inventory · Public · Participant · Fan · Organizer · Navigation · Mobile · PWA · Loading · Design System · System Architecture · Supabase · Reliability · Migration · QA · Release

⸻

STATUS OF THIS DOCUMENT

This document is the master Solaris Studio V3 specification.

Its purpose is to bind the complete V3 programme into one coherent product and implementation contract.

It does not erase the more detailed canonical specifications.

The following remain authoritative where they are more specific about their own domain:

1. v3-plan.txt
2. Public side v3 (use this for v3 public implementation).txt
3. Chat 2a and chat 2b v3 plan.txt
4. Admin v3 (use this for admin v3 implementing).txt
5. V3 System plan (use this when u need to implement system stuff).txt
6. V3 bottom bar plan (use this for making the bottom page bar).txt
7. canonical critical implementation and production-safety instructions
8. later explicit project-owner instructions

This Master Plan owns:

* overall product coherence;
* complete screen coverage;
* visual-generation consistency;
* cross-product information architecture;
* relationship between Public and Organizer;
* relationship between UI and canonical backend state;
* loading, empty, error and transition experiences;
* product-wide redesign requirements;
* implementation sequencing;
* completion criteria;
* final V3 acceptance.

When requirements conflict:

1. newer explicit project-owner requirements win;
2. production safety, data integrity, privacy and security may never be weakened;
3. domain-specific canonical specifications win over generic guidance;
4. this master specification resolves cross-domain product ambiguity;
5. legacy behaviour never wins merely because it already exists.

⸻

PART I

V3 PRODUCT DEFINITION

1. What Solaris Studio V3 is

Solaris Studio V3 is the digital operating system of the Solaris Song Contest.

It is simultaneously:

* a public contest experience;
* a discovery platform;
* a participant workspace;
* a fan application;
* a live companion;
* a results and historical archive;
* an Organizer operating system;
* a reliable system of record for official contest operations.

These experiences must feel like one product.

They must not feel like:

* several websites sharing a database;
* V2 pages embedded in a V3 shell;
* an admin dashboard beside a fan website;
* old routes with navy backgrounds;
* a collection of unrelated tools.

⸻

2. The V3 generational requirement

Solaris Studio V3 must feel like a new generation of the product.

A user familiar with V2 should immediately perceive:

* a new information hierarchy;
* a new layout system;
* a more confident editorial style;
* substantially stronger mobile behaviour;
* less clutter;
* clearer user intent;
* more coherent entities;
* richer but more disciplined interaction;
* significantly better operational feedback.

A page is not redesigned merely because it has:

* new colours;
* a V3 header;
* rounded cards;
* a new font;
* the V3 bottom bar;
* gradients;
* Liquid Glass;
* new spacing.

A screen only reaches V3 parity when its information architecture, presentation hierarchy, interaction model, state model and responsive composition satisfy V3.

⸻

3. Product goal

The V3 experience should feel:

* premium;
* deliberate;
* fast;
* calm during normal operation;
* expressive during important contest moments;
* deeply mobile-native;
* understandable without documentation;
* trustworthy during consequential actions;
* editorial rather than database-driven on discovery surfaces;
* operational rather than decorative in Organizer.

The product should never feel like a generic Tailwind dashboard with contest data poured into it.

⸻

PART II

CORE PRODUCT LAWS

4. One canonical competition, many projections

There is one canonical contest state.

Public, Participant, Live, Results and Organizer are projections of the same underlying truth.

They may present different information according to:

* role;
* permission;
* publication state;
* spoiler preference;
* context;
* edition;
* show;
* workflow responsibility.

They may not independently invent competing truths.

⸻

5. Preserve correct behaviour, replace fragmented presentation

V3 does not mean rewriting all working domain logic.

For every existing capability determine:

* is the underlying domain behaviour correct?
* is it duplicated?
* is it unsafe?
* is it routed incorrectly?
* is it visually obsolete?
* is the information architecture obsolete?
* is the capability no longer useful?
* should it merge into another V3 concept?

Valid outcomes are:

* KEEP;
* REDESIGN;
* MERGE;
* MOVE;
* REDIRECT;
* RETIRE;
* INTERNAL-ONLY.

“Legacy route exists” is not a reason to preserve a standalone V3 screen.

⸻

6. No capability dumping

No root screen should become a list of everything Solaris can do.

Especially:

* Home is not a dashboard dumping ground.
* Explore is not a sitemap.
* Participate is not MySolaris renamed.
* Results is not a menu of analysis tools.
* Me is not another Task Center.
* Organizer More is not an admin junk drawer.

Use progressive disclosure.

⸻

7. Calm normal state, expressive important state

Everyday pages should primarily use:

* flat surfaces;
* clear typography;
* restrained depth;
* predictable hierarchy;
* compact lists where appropriate.

Expressive design is reserved for:

* edition heroes;
* major live states;
* result reveals;
* important publication moments;
* selected navigation interaction;
* major status changes.

If everything glows, nothing matters.

⸻

PART III

CANONICAL PUBLIC INFORMATION ARCHITECTURE

8. Permanent Public navigation

The five primary destinations are:

Home

What matters now

Explore

Discover Solaris

Participate

Your responsibilities and participation

Results

What happened

Me

Your Solaris identity

These distinctions are final.

⸻

9. Explore versus Results

Explore owns entities and stories

Including:

* editions;
* countries;
* delegations;
* artists;
* songs;
* shows;
* stories;
* archive;
* reference;
* Wiki/Encyclopedia successor;
* historical discovery.

Results owns outcomes and interpretation

Including:

* official rankings;
* jury result;
* televote result;
* combined result;
* scorecharts;
* country breakdown;
* relationships;
* Voting DNA;
* records;
* comparisons;
* analysis;
* simulations;
* replay.

The same capability must not float ambiguously between both.

⸻

10. Participate versus Me

Participate owns

* responsibilities;
* confirmation;
* entry submission;
* media;
* jury;
* relevant participant voting;
* required corrections;
* optional participation;
* task progression.

Me owns

* identity;
* role;
* delegation relationship;
* history;
* activity;
* receipts;
* following;
* saved content;
* preferences;
* account;
* devices;
* sessions.

MySolaris is not a separate V3 mental model.

Legacy MySolaris routes may redirect during migration.

⸻

PART IV

COMPLETE SCREEN COVERAGE RULE

11. What counts as a V3 screen

The V3 inventory includes more than URLs.

A V3 screen includes any substantially distinct:

* route;
* workspace;
* entity view;
* directory;
* workflow step;
* receipt;
* review state;
* focused task;
* live state;
* authentication state;
* error/recovery state;
* loading state;
* system transition;
* settings area;
* historical mode;
* Organizer operational workspace.

A feature is not complete because its happy-path route renders.

⸻

PART V

GLOBAL SHELL AND TRANSITION SURFACES

12. Required app-level surfaces

V3 must explicitly design:

1. cold launch;
2. PWA launch;
3. warm launch;
4. session restore;
5. route navigation;
6. skeleton loading;
7. background refresh;
8. offline mode;
9. reconnect;
10. service-worker update;
11. authentication return;
12. maintenance;
13. degraded service;
14. permission resolution;
15. feature unavailable;
16. 404/not found;
17. stale deep link;
18. global search;
19. notifications;
20. Live entry state.

These are part of the product.

They are not developer placeholders.

⸻

PART VI

LOADING EXPERIENCE

13. Remove legacy TSBC launch branding

The current TSBC-logo loading presentation must not remain as the V3 launch experience.

V3 uses Solaris Studio identity.

The first meaningful frame of V3 must already belong to V3.

⸻

14. Cold start

Cold start should show:

* V3 background/material;
* Solaris identity;
* minimal brand treatment;
* shell as soon as practical.

Do not use:

* long splash animations;
* fake progress bars;
* unrelated legacy logos;
* rotating marketing copy;
* multi-stage loading theatre.

⸻

15. Warm start

When cached content exists:

1. render it immediately;
2. restore shell and tab state;
3. refresh canonical state in the background;
4. show a subtle updating state only when needed.

Do not replace already-rendered content with a fullscreen loader.

⸻

16. Skeletons

Skeleton geometry must reflect the real component.

Examples:

Participant skeleton

* flag/image placeholder;
* country;
* status;
* short metadata.

Song skeleton

* artwork;
* title;
* artist;
* media-action geometry.

Result skeleton

* ranking-row geometry;
* score areas.

One generic rectangular skeleton reused everywhere is insufficient.

⸻

PART VII

NAVIGATION SYSTEM

17. Public bottom navigation

Mobile Public navigation uses:

* Home;
* Explore;
* Participate;
* Results;
* Me.

Organizer uses:

* Overview;
* Tasks;
* Control;
* Live;
* More.

⸻

18. Instagram-parity requirement

The floating mobile tab bar must intentionally match the approved current Instagram iPhone floating navigation reference in observable:

* silhouette;
* proportions;
* horizontal inset;
* vertical placement;
* icon spacing;
* selected lens;
* minimization;
* press response;
* drag behaviour;
* page-swipe synchronisation;
* spring feeling;
* material density.

Solaris changes:

* destinations;
* symbols;
* slightly richer Apple-like glass material.

Solaris does not arbitrarily redesign the geometry.

⸻

19. Liquid Glass scope

Liquid Glass is primarily a navigation/control material.

Do not turn all content into translucent capsules.

Normal content remains primarily flat.

Glass may appear selectively where hierarchy genuinely benefits from it.

⸻

20. Expanded and compact navigation

The bar supports:

* expanded/resting state;
* minimized scroll state;
* instant press feedback;
* selected-lens movement;
* directional stretch;
* edge resistance;
* direct lens dragging where enabled.

Compact state must preserve usable touch geometry.

⸻

21. Whole-page tab swipe

Top-level navigation supports Instagram-style horizontal gesture transitions where safe.

One continuous interaction value drives:

* page movement;
* lens movement;
* icon interpolation;
* deformation;
* release destination.

Do not animate independent systems chasing one another.

Nested horizontal content receives priority where appropriate.

⸻

22. Bottom obstruction rule

Every scrollable Public screen must include sufficient safe obstruction space for the floating navigation.

No:

* button;
* row;
* footer;
* card;
* form field;
* result;
* text

may become permanently inaccessible underneath the bottom bar.

This is a shared shell contract, not individual random padding.

⸻

PART VIII

TOP APP CHROME

23. Mobile top chrome

Mobile headers must remain compact enough that content still owns the screen.

Do not permanently occupy large vertical space with:

* logo;
* giant title;
* five utility buttons;
* nested sticky headers.

Actions should use:

* contextual headers;
* compact controls;
* overflow menus;
* scroll-aware treatment

where appropriate.

⸻

24. Sticky obstruction

Sticky chrome must never cover content while scrolling.

This applies particularly to:

* Rules;
* search;
* entity tabs;
* participant workflows;
* settings;
* Organizer tabs.

⸻

PART IX

HOME

25. Permanent Home structure

Home always follows:

1. Context
2. Now
3. Current Contest
4. Coming Up
5. Latest

Optional secondary content appears below.

⸻

26. Home content budget

Maximum normal Home density:

* one dominant action;
* two secondary actions;
* one current-contest hero;
* three upcoming items;
* three latest items;
* one secondary personalization area.

Additional responsibilities link to Participate.

⸻

27. Home states

Implement explicitly:

* calm;
* action required;
* urgent;
* show day;
* live;
* voting;
* results available;
* post-edition;
* anonymous;
* fan;
* HOD/delegation;
* spoiler-protected.

The layout remains structurally recognizable across states.

⸻

PART X

EXPLORE

28. Explore root

Order:

Search

Universal Solaris search.

Current Edition

Large editorial hero.

Discover

* Countries
* Songs & Artists
* Shows
* Stories

Archive

* Editions
* Reference
* Wiki/Encyclopedia successor where retained

More

* archive games where retained;
* anniversary;
* advanced discovery;
* specialist historical experiences.

⸻

29. Explore visual direction

Explore may use:

* stronger artwork;
* larger typography;
* carefully curated horizontal collections;
* editorial cards;
* richer imagery.

It must not become an infinite engagement feed.

It must not dump every database row onto one page.

⸻

PART XI

EDITIONS

30. Edition is a living event hub

Edition top:

* artwork;
* edition identity;
* host;
* state;
* next meaningful event;
* live treatment where applicable.

Primary sections:

* Overview
* Participants
* Songs
* Schedule
* Stories
* Results

⸻

31. Edition Overview content budget

Overview must never render the entire participant or song collection.

Default preview budgets:

Participants

Show approximately:

* 6–8 participants.

Then:

View all participants

Songs

Show approximately:

* 4–6 songs.

Then:

View all songs

Schedule

Show:

* next 2–3 meaningful items.

Stories

Show:

* 1–3 relevant stories.

Results

Show:

* locked state;
* summary;
* podium;
* winner

depending on current publication/spoiler state.

⸻

32. Participants section

The full participant collection belongs in the dedicated Participants section.

It may support:

* country search;
* region;
* status;
* alphabet grouping;
* compact row presentation.

A deliberately opened directory may be long.

Overview may not.

⸻

33. Songs section

Songs must provide useful music interaction.

Each published song row may expose:

* artwork;
* title;
* artist;
* country;
* relevant edition context;
* Spotify;
* YouTube;
* other published media provider links.

Do not display fake disabled provider buttons when no URL exists.

Use provider-agnostic media modelling.

⸻

34. Edition states

Support:

* planning;
* preview;
* upcoming;
* pre-show;
* show day;
* live;
* voting;
* results available;
* completed;
* archived;
* cancelled.

Archived editions prioritize historical truth rather than current participation actions.

⸻

PART XII

COUNTRY AND DELEGATION PUBLIC ENTITIES

35. Country discovery

Countries directory must be genuinely redesigned.

Avoid the old pattern:

flag + country code + region + chevron repeated forever

as the entire visual concept.

Possible V3 hierarchy:

* current/relevant countries first where useful;
* search;
* meaningful filtering;
* rich compact rows;
* recent entry context;
* historical discovery;
* strong flag identity.

⸻

36. Country detail

Header:

* canonical 3:2 flag;
* country name;
* follow state;
* current edition state.

Sections:

* Current
* Entries
* Results
* History
* Voting Profile

⸻

37. Historical identity

Country history must preserve edition-specific:

* name;
* flag;
* historical identity

without rewriting historical contests when present-day identity changes.

⸻

PART XIII

SONG AND ARTIST ENTITY SYSTEM

38. Songs & Artists discovery

Explore → Songs & Artists opens a dedicated discovery surface.

It must not route to an Edition Overview as a substitute.

The root can include:

* current-edition songs;
* featured artists;
* recent reveals;
* historical music;
* search;
* filters;
* edition discovery.

⸻

39. Song entity

Song detail supports:

* title;
* artist;
* country;
* edition;
* artwork;
* credits;
* media;
* Spotify;
* YouTube;
* other media providers;
* show appearances;
* result;
* analysis;
* related stories;
* artist profile;
* country link.

Unpublished information must remain protected.

⸻

40. Artist entity

Artist detail supports:

* identity;
* image;
* biography;
* country relationship;
* songs;
* editions;
* results;
* stories.

⸻

PART XIV

SHOWS AND PUBLIC LIVE

41. Shows directory

Shows must become a V3 discovery experience rather than a legacy grouped list.

Useful hierarchy may include:

* current/upcoming;
* recent;
* edition context;
* historical;
* show type;
* state.

⸻

42. Show detail

Show can expose:

* identity;
* time;
* state;
* entries;
* running order;
* voting;
* result;
* stories;
* broadcast link where published.

⸻

43. Live Mode

Live Mode is intentionally entered.

It includes:

* current performance;
* current position;
* next performer;
* running order;
* updates;
* voting;
* show details.

⸻

44. Live failure states

Support explicitly:

* delayed;
* technical pause;
* changed running order;
* skipped performance;
* interrupted show;
* delayed voting;
* extended voting;
* delayed result;
* cancellation.

The architecture cannot assume broadcasts behave perfectly.

⸻

PART XV

STORIES, REFERENCE AND ARCHIVE

45. Stories

Implement:

Story directory

Supports:

* current;
* edition-related;
* country-related;
* historical.

Story detail

Includes:

* artwork;
* publication time;
* content;
* related entities;
* related stories;
* sharing.

⸻

46. Reference

Audit Wiki and Encyclopedia.

If they solve essentially the same user job:

MERGE.

V3 Reference should support:

* clear article hierarchy;
* contents;
* internal links;
* entity links;
* search;
* related articles;
* canonical URLs.

Legacy bookmarks redirect safely.

⸻

47. Archive

Archive root may expose:

* Editions
* Countries
* Songs
* Artists
* Shows
* Stories
* Reference
* Games

according to actual retained capability.

Archived content always displays historical context clearly.

⸻

48. Anniversary

Retain anniversary capability around:

* milestones;
* timeline;
* stories;
* historic moments;
* special art;
* archive linking.

When an anniversary event ends it remains historically discoverable without permanently taking over Home.

⸻

PART XVI

RULES AND HELP

49. Rules root

Rules V3 should preserve the strong redesigned concept.

Include:

* official regulations;
* current version;
* effective date;
* previous versions;
* search;
* quick answers;
* rulebook;
* relevant rules;
* clarifications;
* situation checking where supported.

⸻

50. Rules search redesign

Avoid excessive nested rounded containers.

Search should be one visually clear search surface.

Suggestions and common questions sit beneath it.

Do not create:

giant outer card
inside another card
containing another rounded search pill
containing another rounded icon region.

We have sufficiently discovered border-radius.

⸻

51. Contextual help

Prefer contextual:

* ?
* “How this works”
* relevant rule link

inside workflows.

Guide remains only where useful as a searchable reference.

⸻

PART XVII

RESULTS

52. Results root

Opening Results shows the official result first.

It must not begin with a catalogue of analysis tools.

Primary modes:

* Combined
* Jury
* Televote

Personal context may appear secondarily.

⸻

53. Result reveal

First meaningful post-publication view may use an expressive reveal:

* edition transition;
* winner;
* country;
* points;
* podium.

Later visits open normally.

Do not replay the dramatic sequence every time somebody checks the scoreboard.

⸻

54. Analysis hierarchy

After official result:

Explore this result

* Scorechart
* Jury vs Televote
* Country breakdown

More analysis

* Relationships
* Voting DNA
* Records
* Compare
* Result Lab
* Replay
* simulations

⸻

55. Scorechart

Desktop may be dense.

Mobile must provide a purpose-built representation:

* simplified summary;
* drilldown;
* entry filter;
* accessible table alternative.

Never shrink a desktop matrix until the labels become microscopic confetti.

⸻

56. Result Lab

Persistent:

SIMULATION

Official results are unchanged.

Simulation must never mutate canonical results.

⸻

PART XVIII

SPOILER PROTECTION

57. Global spoiler preference

Options:

* Show results immediately
* Hide until I reveal them

This affects:

* Home;
* Edition;
* Results;
* notifications;
* push;
* search;
* following;
* stories;
* cached previews;
* metadata where relevant.

No winner leak through:

* heading;
* alt text;
* push title;
* image;
* search snippet;
* social preview;
* stale cache.

⸻

PART XIX

PARTICIPATE

58. Participate mission

Answer:

What am I responsible for, and what can I participate in?

Structure:

Responsibilities / Journey

Official obligations.

Action Center

* Needs attention
* Next
* Optional now
* Completed

⸻

59. Responsibility priority

Official responsibilities always outrank optional fan participation.

Examples:

Required:

* Confirmation
* Entry
* Media
* Jury

Optional:

* Televote where public;
* Fantasy;
* Predictions;
* side games.

Do not show “Make predictions!” above “Entry correction required”.

⸻

PART XX

CONFIRMATION

60. Participant flow

1. Overview
2. Decision
3. Details
4. Review
5. Submit
6. Receipt

⸻

61. Confirmation states

Support:

* unavailable;
* upcoming;
* open/not started;
* draft;
* submitted;
* completed;
* closed;
* correction required;
* reopened;
* canonical confirmation already exists.

⸻

62. Duplicate prevention

If a valid canonical confirmation exists:

do not show another active task.

Closed/superseded rounds do not leave dead todo items.

⸻

PART XXI

ENTRY

63. Entry states

* unavailable
* draft
* submitted
* under review
* changes required
* verified
* withdrawn

⸻

64. Entry editor

Sections:

* Song
* Artist
* Credits
* Metadata
* Media

Support:

* autosave;
* offline-safe draft where valid;
* explicit submission review;
* correction instructions;
* revision comparison;
* resubmission.

⸻

PART XXII

MEDIA

65. Upload state machine

* queued
* uploading
* processing
* validating
* accepted
* failed
* quarantined
* replacement required

UI distinguishes local upload completion from server processing.

Retry may never create duplicate canonical assets.

⸻

PART XXIII

JURY

66. Jury flow

1. overview;
2. ranking;
3. validation;
4. review;
5. submit;
6. reconciliation if uncertain;
7. receipt.

Ranking must have non-drag alternatives.

⸻

67. Submission uncertainty

If the request may have committed but the response disappears:

show:

Checking submission status…

Use operation/idempotency state.

Do not immediately invite a duplicate submit.

⸻

68. Cross-device conflict

Never silently overwrite a newer ballot revision.

Offer:

* newest version;
* comparison;
* safe continuation.

⸻

PART XXIV

TELEVOTE

69. States

* locked;
* upcoming;
* open;
* submitted;
* extended;
* closed;
* results published.

Flow:

Select → Review → Submit → Server confirms → Receipt.

Time derives from canonical server-relative time.

⸻

PART XXV

FAN AND SIDE PARTICIPATION

70. Shared optional-participation foundation

Where possible reuse:

* availability;
* deadline;
* draft;
* submission;
* receipt;
* history.

Do not invent separate form infrastructure for every little side game.

⸻

71. Fantasy

Support:

* onboarding;
* roster builder;
* budget;
* deadline;
* lock;
* live scoring;
* leaderboard;
* historical editions.

⸻

72. Predictions

Support:

* configured prediction types;
* submission;
* locking;
* scoring;
* leaderboard;
* historical reproducibility.

Prediction League merges unless a genuinely distinct user job exists.

⸻

73. Audit-first legacy capabilities

Before retaining as standalone screens:

* Pulse;
* Taste DNA;
* Next in Line;
* Archive Games;
* Library;
* Site Directory;
* miscellaneous historical tools.

Classify:

* REDESIGN;
* MERGE;
* RETIRE.

⸻

PART XXVI

NOTIFICATIONS

74. Notification types

Distinguish:

* personal notification;
* delegation notice;
* system announcement;
* followed-content update.

Each important notification may explain:

Why am I seeing this?

⸻

75. Notifications UX

Notifications must not expose internal architecture explanations as ordinary product copy.

Avoid copy like:

Notifications are never the source of truth.

That is a system doctrine, not useful normal-user content.

Present:

* Latest;
* Required/Important;
* notices;
* preferences.

⸻

76. Notification deep links

All notification links resolve current state.

Example:

old jury reminder after close:

Jury voting has closed
Your ballot was submitted ✓
View receipt

Not:

stale ranking editor.

⸻

PART XXVII

ME

77. Me root

Sections:

* Identity
* Current
* History
* Activity
* Following & Saved
* Preferences
* Account

⸻

78. Identity

Show:

* user;
* delegation;
* understandable role.

Do not expose implementation role codes.

⸻

79. History

Past:

* editions;
* countries/delegations;
* roles;
* meaningful participation.

Historical membership must remain historically correct.

⸻

80. Activity

Includes:

* submissions;
* receipts;
* relevant voting participation;
* game participation where appropriate.

⸻

PART XXVIII

PREFERENCES

81. Notification settings

Use meaningful category controls.

Avoid dozens of toggles.

⸻

82. Quiet hours

The current visual treatment resembling one giant segmented time pill must be redesigned.

Use two clear time controls:

From

23:00

Until

08:00

Use locale-appropriate display consistently.

The relationship between label and value must be visually unambiguous.

⸻

83. Accessibility

Respect OS/browser settings for:

* Reduced Motion;
* Reduced Transparency;
* large text;
* screen reader;
* contrast.

User-level options supplement them.

They do not unexpectedly override them.

⸻

PART XXIX

ACCOUNT AND SECURITY

84. Account sections

* Security
* Devices & Sessions
* Privacy
* Access
* Account Actions

⸻

85. Sessions

Show:

* current device;
* other sessions;
* approximate last activity;
* revoke action;
* security history where appropriate.

Server invalidation is authoritative.

⸻

PART XXX

ORGANIZER PRODUCT

86. Organizer is a separate operational mode

Organizer changes:

* shell;
* navigation;
* information density;
* priorities;
* information architecture;
* actions;
* risk treatment.

It is not Public with extra admin buttons.

⸻

87. Organizer navigation

Overview

What needs attention now?

Tasks

What work remains?

Control

Manage contest systems.

Live

Operate the current show.

More

Specialist, historical and platform administration.

⸻

PART XXXI

ORGANIZER OVERVIEW

88. Hierarchy

1. Context
2. Needs attention
3. Next
4. Readiness
5. Recent meaningful changes
6. Domain summaries

Maximum initial issue count:

approximately 3–5.

Normal state remains quiet.

⸻

PART XXXII

ORGANIZER TASKS

89. Unified queue

Primary filters:

* Mine
* Required
* Blocking
* Due soon
* All

Domains:

* Delegations
* Entries
* Media
* Voting
* Integrity
* Publication
* Communications
* System

Tasks expose meaningful action directly.

⸻

PART XXXIII

ORGANIZER DELEGATIONS

90. Delegation workspace

Sections:

* Attention
* Countries
* Confirmations
* Access
* History

Delegation detail includes:

* Overview
* Confirmation
* Entry
* Media
* Voting
* Access
* Communications
* History

Avoid reloading identity independently in every subsection.

⸻

PART XXXIV

ORGANIZER CONFIRMATIONS

91. Workspace

Merge:

* overview;
* requirements;
* responses;
* country responses;
* rounds;
* calendar;
* history.

Integration diagnostics belong under advanced/system tooling.

⸻

92. Review workflow

Organizer can:

* inspect response;
* compare revisions;
* accept;
* request changes;
* escalate;
* waive where valid;
* reopen where authorised.

No arbitrary freeform status dropdown.

⸻

93. Rounds

Round wizard:

1. purpose;
2. eligible delegations;
3. opens;
4. closes;
5. late policy;
6. reminders;
7. review;
8. create.

States:

* Draft
* Scheduled
* Open
* Closed
* Archived

Extend and reopen are explicit transitions.

⸻

PART XXXV

ORGANIZER CONTEST

94. Contest workspace

Contains:

* Shows
* Entry Review
* Running Orders
* Progression
* Eligibility

⸻

95. Show administration

Show detail includes:

* entries;
* running order;
* voting;
* publication;
* broadcast;
* readiness.

Create-show wizard only asks configuration relevant to selected show type.

⸻

PART XXXVI

ENTRY REVIEW

96. First-class review workspace

Entry Review is independent from Running Order.

Queue:

* Needs Review
* Resubmitted
* Changes Required
* Verified
* Withdrawn
* All

Search:

* country;
* artist;
* song.

⸻

97. Review detail

Show:

* identity;
* revision;
* review state;
* automated checks;
* media previews;
* relevant rules;
* changed fields.

Organizer may:

* request changes;
* verify;
* compare revisions.

⸻

PART XXXVII

ORGANIZER MEDIA

98. Media queue

States:

* uploading;
* processing;
* validation failed;
* needs review;
* approved;
* replacement required;
* quarantined.

Technical validation is not equivalent to editorial approval.

⸻

PART XXXVIII

RUNNING ORDER AND PROGRESSION

99. Running-order architecture

Separate:

* entries;
* allocations;
* positions;
* draft changes;
* published order.

Drag may be supported.

It is not the sole interaction.

⸻

100. Publish preflight

Show exact changes and validation before publication.

⸻

101. Progression

Preview qualifier movement.

Conflicts are explicitly resolved.

Never silently overwrite manual official corrections.

⸻

PART XXXIX

ORGANIZER ELIGIBILITY

102. Eligibility

States may include:

* Eligible
* Needs Review
* Blocked

Automated checks are evidence/signals.

They do not automatically proclaim misconduct.

Human decisions record:

* conclusion;
* rule;
* reason;
* evidence;
* actor;
* impact.

⸻

PART XL

ORGANIZER VOTING

103. Voting Overview

Show:

* Jury;
* Televote;
* Integrity;
* Results.

Primary action corresponds to the valid next transition.

⸻

104. Voting configuration

Display human-readable rules.

Do not make organizers mentally decode raw JSON/numeric configuration.

⸻

105. Jury operations

Support:

* completion status;
* missing ballots;
* reminders;
* ballot review;
* declaration;
* close preflight.

⸻

106. Televote operations

Support:

* readiness;
* open;
* live monitoring;
* close;
* validation;
* aggregate input/import;
* import validation.

⸻

PART XLI

INTEGRITY

107. Integrity queue

Group meaningful signals.

Do not show every ballot by default.

⸻

108. Investigation detail

Show:

* explanation;
* affected ballots;
* evidence;
* limitations;
* relationship context;
* historical comparison.

Never phrase a statistical signal as proven misconduct.

⸻

PART XLII

ORGANIZER RESULTS

109. Official workflow

Strict stages:

1. Inputs
2. Calculation
3. Validation
4. Integrity
5. Preview
6. Finalize
7. Publish

⸻

110. Finalization

Finalization freezes explicit result-version inputs.

Subsequent correction uses a new controlled workflow.

No silent mutation of finalized results.

⸻

111. Publish preflight

Before publication show:

* exact version;
* rankings;
* public destinations;
* notifications;
* blockers.

Organizer should know exactly what users will see.

⸻

PART XLIII

PUBLICATION

112. Publication workspace

Control publication for:

* participants;
* songs;
* artist media;
* running orders;
* show details;
* jury results;
* televote;
* combined results;
* stories.

States:

* Private
* Scheduled
* Public

Disabled publication explains why.

⸻

PART XLIV

COMMUNICATIONS

113. Communications workspace

Sections:

* Drafts
* Scheduled
* Sent
* Delivery Issues
* Templates

Composer defines:

* title;
* content;
* audience;
* channels;
* schedule;
* expiry;
* importance;
* deep link;
* spoiler sensitivity.

Recipient preview is mandatory.

⸻

PART XLV

ORGANIZER STORYTELLING

114. Story editor

Supports:

* title;
* body;
* hero;
* associations;
* schedule;
* preview;
* revision history.

Anniversary administration belongs here.

⸻

PART XLVI

PRODUCTION AND BROADCAST

115. Production workspace

Sections:

* Visual Identity
* Scoreboard
* Broadcast Presentation
* Rundown
* Reveal
* Versions

Editing draft never mutates active live presentation.

Workflow:

Edit → Preview → Validate → Activate.

⸻

PART XLVII

ORGANIZER LIVE

116. Live shell

Reduce unrelated UI.

Show:

* current show;
* Now;
* Next;
* systems;
* next operation;
* incidents;
* timeline.

Only one dominant operational action at a time.

⸻

117. Broadcast Rundown

Cue states:

* pending;
* ready;
* active;
* done;
* skipped.

Actions:

* ready;
* start;
* complete;
* skip;
* delay;
* emergency cue.

⸻

118. Reveal Director

Modes:

* Planning
* Rehearsal
* Armed
* Live
* Complete

Armed state locks reveal sequence.

Editing requires explicit disarm.

⸻

PART XLVIII

SIMULATION AND HISTORICAL INSPECTION

119. Simulation Lab

Persistent:

SIMULATION

No production state will be changed.

⸻

120. Time Machine

Read-only historical view.

No mutation controls.

Allows authoritative historical inspection and snapshot comparisons.

⸻

PART XLIX

INCIDENTS AND CONTROL ROOM

121. Control Room

Sections:

* Current State
* Active Issues
* Systems
* Team
* Timeline

Not primary navigation.

Reached from operational context.

⸻

122. Incidents

States:

* detected
* declared
* responding
* monitoring
* resolved
* reviewed

Incident workspace includes:

* status;
* impact;
* actions;
* timeline;
* systems;
* communications;
* follow-up.

⸻

PART L

GOVERNANCE

123. Governance workspace

Permission-aware sections:

* Investigations
* Rulings
* Appeals
* Evidence
* Disclosure
* Identity
* Rules

⸻

124. Evidence distinctions

Visually distinguish:

* automated signal;
* submitted evidence;
* verified fact;
* organizer finding.

Do not blur these categories.

⸻

125. Break-glass identity access

Tier 4.

Requires:

* capability;
* reason;
* case/incident context;
* recent authentication;
* explicit confirmation;
* audit.

Temporary access expires.

⸻

PART LI

RULES MANAGEMENT

126. Rule lifecycle

* draft
* review
* validated
* scheduled
* published
* superseded

Published versions are immutable.

Changes create new releases.

⸻

PART LII

ACCESS AND PERMISSIONS

127. Capability-based model

Authorization uses:

* capability;
* scope;
* canonical server identity.

Possible scopes:

* platform;
* edition;
* show;
* domain/object.

⸻

128. Grant/revoke preview

High-impact permission changes show:

* user;
* capability;
* scope;
* consequences.

Least privilege is the default.

⸻

PART LIII

PLATFORM ADMINISTRATION

129. Editions

Explicit surfaces:

* Active
* Upcoming
* Archived

Create Edition uses a guided wizard.

Archive is preferred to Delete.

Delete is Tier 4 and shows affected data.

⸻

PART LIV

FEATURE ROLLOUT

130. Feature rollout

States:

* off
* internal
* limited
* on

Critical rollout changes require:

* consequence preview;
* audit;
* rollback.

Emergency kill switch is visually distinct.

⸻

PART LV

SYSTEM ARCHITECTURE

131. Canonical owner per domain

Every durable domain has exactly one canonical owner.

At minimum:

* identity;
* accounts;
* sessions;
* memberships;
* capabilities;
* countries;
* historical country identity;
* editions;
* shows;
* runtime show state;
* running order;
* confirmations;
* entries;
* media;
* jury;
* televote;
* voting configuration;
* integrity;
* results;
* publications;
* notifications;
* stories;
* rules;
* following;
* saved;
* Fantasy;
* predictions;
* tasks;
* receipts;
* audit;
* incidents;
* feature rollout;
* jobs.

No competing truth fields.

⸻

PART LVI

DATABASE INTEGRITY

132. Important invariants belong in the system

Use appropriate:

* NOT NULL;
* foreign keys;
* unique indexes;
* partial unique indexes;
* CHECK constraints;
* enum/constrained state;
* state-transition commands.

Do not rely on React conditionals to preserve official contest integrity.

⸻

133. Historical data

Prefer archive over deletion for official historical data.

Especially:

* results;
* ballots;
* entries;
* published rules;
* receipts.

⸻

PART LVII

COMMAND ARCHITECTURE

134. Consequential operation pipeline

All critical Public and Organizer mutations follow:

intent
→ authenticate
→ actor resolution
→ capability check
→ scope check
→ canonical state load
→ transition validation
→ expected-version validation
→ idempotency
→ transaction/lock
→ canonical write
→ operation record
→ domain events
→ commit
→ projections
→ async consequences
→ receipt
→ realtime invalidation.

⸻

135. No critical browser writes

Examples requiring authoritative command architecture:

* confirmation submit/reopen;
* entry submit/verify;
* jury submit/close;
* televote open/close;
* result finalize/publish;
* ballot exclusion;
* sensitive permission grant;
* production activation.

⸻

PART LVIII

IDEMPOTENCY AND RECONCILIATION

136. Idempotency

Critical operations remain safe under:

* double taps;
* retries;
* timeout;
* refresh;
* reconnect;
* concurrent request;
* stale client.

Same key + same request returns prior result.

Same key + different semantic request is rejected.

⸻

137. Unknown outcome

If the response disappears:

the client reconciles against operation state.

Never tell users “failed” when the server may already have committed the operation.

⸻

PART LIX

EVENTS AND CONSEQUENCES

138. Domain events

Events describe completed facts.

Examples:

* confirmation.submitted
* confirmation.changes_requested
* entry.submitted
* entry.verified
* media.replacement_requested
* jury.ballot_submitted
* televote.opened
* result.finalized
* result.published
* incident.declared

Commands request.

Events describe what happened.

⸻

139. Transactional outbox

Canonical mutation, operation record and outbox event commit together.

Async consumers must be retry-safe and idempotent.

Duplicate delivery may not create:

* duplicate notification;
* duplicate task;
* duplicate publication;
* duplicate projection mutation.

⸻

140. Consequence registry

Every consequential event maps explicitly to:

* projection changes;
* tasks;
* notifications;
* publication effects;
* realtime effects;
* analytics;
* audit;
* background consumers.

Frontend code may display consequences.

It must not secretly own them.

⸻

PART LX

PROJECTIONS

141. Projection doctrine

Core projections are:

* focused;
* efficient;
* rebuildable;
* verifiable;
* reconcilable.

Avoid loading entire tables client-side to calculate counters.

⸻

142. Rebuildability

A projection that can become incorrect but cannot be deterministically rebuilt is not production-ready.

Provide where applicable:

* invalidation;
* rebuild;
* reconciliation;
* lag detection;
* source comparison.

⸻

PART LXI

AUTH AND PRIVACY

143. Unified auth shell

Use one consistent system for:

* sign in;
* invite;
* recovery;
* expired session;
* revoked access;
* return after authentication.

⸻

144. Return intent

After authentication return users to the original meaningful context when still valid.

Do not lose safe drafts.

⸻

145. Frontend hiding is not security

Private data must not enter unauthorised payloads.

This includes:

* API;
* search;
* SSR;
* metadata;
* cached snippets;
* notifications.

⸻

PART LXII

OFFLINE AND MULTI-DEVICE

146. Offline browsing

Use cached safe public content.

Display quiet offline state.

⸻

147. Offline editing

Draft where explicitly safe.

Show:

Saved offline

Official final mutation remains pending until acknowledged.

⸻

148. Multi-device

Server canonical state wins.

Never silently overwrite a newer revision.

Reconcile:

* Entry;
* Jury;
* Confirmation;
* notifications;
* vote submission;
* session revocation.

⸻

PART LXIII

RESPONSIVE DESIGN

149. Device classes

Support:

* small phone;
* standard phone;
* large phone;
* tablet portrait;
* tablet landscape;
* desktop;
* wide desktop.

Phone is the primary reference for Public V3.

Organizer critical workflows must also be genuinely usable on phone.

⸻

150. Mobile rules

No:

* compressed desktop tables;
* unreachable floating CTAs;
* bottom-nav obstruction;
* top-chrome obstruction;
* drag-only actions;
* tiny touch targets;
* kilometre-long Overview dumps.

⸻

151. Desktop

Desktop is the same product concept.

Possible composition:

Sidebar | Main workspace | Context panel

Do not create an entirely different conceptual product.

⸻

PART LXIV

ACCESSIBILITY

152. Baseline

Target WCAG 2.2 AA.

Support:

* VoiceOver/screen reader;
* keyboard;
* visible focus;
* large text;
* Reduced Motion;
* Reduced Transparency;
* minimum interaction geometry;
* non-colour status communication.

⸻

153. Gesture alternatives

Drag, swipe and long press always have a usable alternative where required.

Long press is never essential.

⸻

PART LXV

COMPLETE V3 STATE CONTRACT

154. Every feature covers applicable states

At minimum:

* default;
* pressed;
* selected;
* loading;
* empty;
* stale;
* updating;
* offline;
* disabled;
* locked;
* complete;
* error;
* retry;
* degraded;
* permission changed;
* conflict;
* pending;
* uncertain operation;
* reconciliation;
* deadline passed;
* state changed elsewhere;
* spoiler hidden.

No “N/A” without explicit justification.

⸻

PART LXVI

SCREEN INVENTORY AS RELEASE CONTRACT

155. Public screen families

Release inventory must track at minimum:

Shell/System

* launch;
* auth;
* loading;
* offline;
* error;
* maintenance;
* search;
* notifications.

Home

all canonical Home experience states.

Explore

* root;
* Editions;
* Countries;
* Songs & Artists;
* Shows;
* Stories;
* Archive;
* Reference;
* Anniversary;
* retained Games.

Entities

* Edition;
* Country;
* Delegation;
* Song;
* Artist;
* Show;
* Story;
* Reference article.

Participate

* Journey;
* Confirmation;
* Entry;
* Media;
* Jury;
* Televote;
* optional participation.

Results

* official result;
* Jury;
* Televote;
* Scoreboard;
* Scorechart;
* Country breakdown;
* Relationships;
* Voting DNA;
* Records;
* Compare;
* Result Lab;
* Replay.

Me

* identity;
* Current;
* History;
* Activity;
* receipts;
* Following & Saved;
* Preferences;
* Account;
* Devices/Sessions.

⸻

156. Organizer screen families

At minimum:

* Overview;
* Tasks;
* Delegations;
* Confirmations;
* Contest;
* Shows;
* Entry Review;
* Media;
* Running Order;
* Progression;
* Eligibility;
* Voting;
* Jury;
* Televote;
* Integrity;
* Results;
* Publication;
* Communications;
* Storytelling;
* Production;
* Live;
* Simulations;
* Time Machine;
* Control Room;
* Incidents;
* Governance;
* Rules;
* Permissions;
* Editions Administration;
* Feature Rollout;
* Engagement;
* Product QA;
* UX observability;
* System Health;
* Jobs;
* Settings;
* Audit;
* Search;
* Organizer notifications.

Every retained user-facing route must map into this inventory or have an explicit migration classification.

⸻

PART LXVII

LEGACY MIGRATION

157. Legacy classification

Every legacy route/capability receives:

* current route;
* current purpose;
* V3 owner;
* target screen;
* migration decision;
* redirect;
* state;
* evidence.

⸻

158. Known convergence

MySolaris

→ Participate + Me

Country Hub

→ Participate / Me / Delegation

Wiki + Encyclopedia

→ Reference where jobs overlap

Library

→ Saved / Archive / correct owner

Analysis root

→ Results hierarchy

Legacy Action Center

→ Organizer Tasks

Generic Administration

→ explicit Organizer domains

TSBC launch

→ Solaris V3 launch

⸻

PART LXVIII

VISUAL QUALITY GATE

159. Reskin detection

A screen automatically fails V3 visual acceptance if it primarily preserves:

* same legacy layout;
* same list hierarchy;
* same composition;
* same information density;
* same interaction

and changes only:

* background;
* colours;
* corners;
* typography;
* shell.

The audit question is:

If the colours were removed, would this still obviously be the old screen?

If yes, it needs redesign.

⸻

PART LXIX

PAGE LENGTH AND CONTENT DENSITY

160. Root-page budget

Root and Overview pages summarize.

Directories and dedicated detail collections contain the complete data.

This applies across:

* Edition;
* Country;
* Results;
* Organizer Overview;
* Participate;
* Me;
* Explore.

⸻

161. Avoid scroll marathons

Do not render:

* all 66 countries;
* all participants;
* all songs;
* all shows;
* all stories;
* all analysis tools;
* all organizer metrics

onto an Overview simply because the backend returned them.

Use:

* previews;
* bounded collections;
* filtering;
* dedicated detail sections;
* “View all”.

⸻

PART LXX

PRODUCTION SAFETY

162. Absolute Supabase test rule

Automated:

* CI;
* Playwright;
* browser audits;
* screenshot testing;
* QA crawls;
* migration rehearsals

must never hit production hosted Supabase.

Use isolated/local infrastructure.

If local/test infrastructure is unavailable:

FAIL CLOSED.

Never silently fall back to production.

⸻

163. Egress correctness

Supabase egress is a correctness constraint.

Implement:

* projection endpoints;
* minimal columns;
* server aggregation;
* sensible caching;
* event-driven invalidation;
* bounded background work;
* no N+1 route storms.

⸻

PART LXXI

IMPLEMENTATION OWNERSHIP

164. Canonical lanes

SYSTEM

Owns:

* Supabase migrations;
* domain ownership;
* commands;
* events;
* outbox;
* projections;
* reconciliation;
* authorization;
* observability;
* reliability;
* recovery.

PUBLIC 2A

Owns:

* Explore;
* Edition;
* Country;
* Artist;
* Song;
* Show;
* Live;
* Stories;
* Archive;
* Reference;
* Rules;
* Results;
* analysis tools.

PUBLIC 2B

Owns:

* Participate;
* Confirmation integration;
* Entry;
* Media;
* Jury integration;
* Televote;
* Me;
* identity;
* account;
* fan products;
* notifications;
* following.

ORGANIZER

Owns Organizer operational application.

NAVIGATION

Owns:

* shell;
* bottom navigation;
* swipe;
* gestures;
* navigation memory;
* PWA shell;
* safe-area contracts;
* app transitions.

QA / INTEGRATOR

Owns:

* broad integration;
* generated reports;
* regression;
* exact-SHA release certification.

⸻

PART LXXII

IMPLEMENTATION METHOD

165. Start every run from reality

Before editing:

1. fetch current main;
2. record SHA;
3. inspect relevant open V3 PRs;
4. inspect CI;
5. inspect registries;
6. inspect current implementation;
7. inspect Supabase where needed;
8. compare existing state against canonical requirement.

Do not implement from stale conversation assumptions.

⸻

166. Vertical slices

A meaningful feature implementation should include where applicable:

* schema/invariant;
* migration;
* authorization;
* command;
* projection;
* frontend;
* loading;
* empty;
* error;
* offline;
* reconciliation;
* mobile;
* accessibility;
* tests;
* observability.

Do not intentionally defer every hard piece to “later”.

⸻

167. Root-cause fixes

For every defect:

1. determine cause;
2. search siblings;
3. fix the class;
4. add regression protection;
5. verify affected domains.

Never weaken a guard merely to make CI green.

⸻

PART LXXIII

PRIORITY ORDER

168. P0 Production safety

* production isolation;
* auth;
* privacy;
* database integrity;
* critical workflow correctness.

169. P1 Shared architecture

* commands;
* receipts;
* events/outbox;
* projections;
* consequences;
* reconciliation;
* migrations.

170. P2 Critical contest workflows

* Confirmation;
* Entry;
* Media;
* Jury;
* Televote;
* Results;
* corresponding Organizer controls.

171. P3 Organizer operations

* Overview;
* Tasks;
* Control;
* Live;
* Publication;
* Communications;
* exceptions.

172. P4 Core Public V3

* Home;
* Explore;
* Participate;
* Results;
* Me;
* entities;
* essential support routes.

173. P5 Long-tail parity

* archive;
* games;
* reference;
* side participation;
* specialist analysis;
* low-frequency Organizer tools.

174. P6 Polish

Only after substantive blockers:

* micro-animation;
* minor optical tuning;
* low-impact beautification.

Navigation parity remains required because it has an explicit canonical acceptance requirement, not because shiny things are inherently virtuous.

⸻

PART LXXIV

TESTING

175. Level 1

Fast:

* types;
* lint;
* unit;
* invariants;
* registry checks;
* focused component/command tests.

176. Level 2

Affected workflow:

* integration;
* targeted Playwright;
* responsive;
* migration;
* domain workflow.

177. Level 3

Milestone:

* Browser Audit;
* selected visual regression;
* full migration rehearsal;
* parity reports;
* broader integration.

178. Level 4

Release SHA only:

* all canonical CI;
* migration rehearsal;
* security;
* production isolation;
* accessibility;
* responsive evidence;
* full-contest rehearsal;
* recovery evidence;
* final release report.

⸻

PART LXXV

REQUIRED VISUAL REGRESSION SET

179. Public golden set

At minimum:

* Launch
* Home calm
* Home action
* Home live
* Explore
* Edition Overview
* Edition Participants
* Edition Songs
* Country
* Song
* Artist
* Show
* Rules
* Participate
* Entry correction
* Jury
* Televote
* Results
* Scorechart mobile
* Me
* Notifications
* Notification Settings
* Auth return
* Offline
* Reconciliation error

⸻

180. Organizer golden set

At minimum:

* Overview
* Tasks
* Delegation detail
* Confirmation review
* Entry review
* Voting Overview
* Jury
* Televote
* Result preflight
* Publication
* Live
* Incident
* Governance
* System Health
* high-risk confirmation sheet.

⸻

PART LXXVI

PERFORMANCE

181. Targets

Internal targets include:

* warm shell perceived render < ~500 ms;
* input acknowledgement < ~100 ms;
* tab acknowledgement < ~100 ms;
* major motion near 60 fps;
* cached root content immediate;
* negligible layout shift.

Responsiveness wins over unnecessary blur fidelity.

⸻

PART LXXVII

SCREEN-LEVEL DEFINITION OF DONE

182. Every screen must answer

Before parity:

* Purpose defined?
* Persona defined?
* Route ownership defined?
* Canonical data source defined?
* Loading designed?
* Empty designed?
* Error designed?
* Offline behaviour defined?
* Stale behaviour defined?
* Mobile usable?
* Desktop usable?
* Accessibility verified?
* Deep link valid?
* Publication/spoiler policy correct?
* Performance acceptable?
* Legacy migration classified?
* Tests exist?
* Acceptance scenario passes?

A pretty route is not parity.

⸻

PART LXXVIII

CAPABILITY STATUS MODEL

183. Machine-readable status

Track capabilities using objective states such as:

* missing;
* mapped;
* foundation;
* implementing;
* implemented;
* integrated;
* tested;
* parity;
* cutover;
* certified;
* blocked;
* retired;
* merged.

Never use “looks done”.

⸻

PART LXXIX

FINAL PUBLIC ACCEPTANCE

184. Public V3 passes only when

Navigation

The five-area model is coherent.

Home

Immediate context and actions are understandable.

Explore

Discovery feels editorial and genuinely redesigned.

Entities

Edition, Country, Artist, Song, Show and Story work as one coherent system.

Participate

Official obligations outrank optional play.

Results

Official result is primary and analysis is progressively disclosed.

Me

Identity and history are distinct from tasks.

Mobile

No overlapping navigation, broken headers or desktop compression.

Loading

No legacy TSBC loader or unnecessary fullscreen loading.

Legacy

No accidental V2 pages appear merely inside V3 chrome.

Long-tail

Small routes, settings, errors and archive tools are classified.

⸻

PART LXXX

FINAL ORGANIZER ACCEPTANCE

185. Organizer V3 passes only when

* top problem is visible quickly;
* current edition/show context is unmistakable;
* Tasks surfaces known work automatically;
* commands operate canonical backend state;
* risky actions show consequences;
* no critical function requires desktop;
* all critical operations produce recoverable evidence;
* errors differentiate permission/user/stale/API/storage/realtime problems;
* production control and historical tools are safely separated.

⸻

PART LXXXI

FINAL SYSTEM ACCEPTANCE

186. System V3 passes only when

* every major domain has one canonical owner;
* critical commands are authoritative;
* constraints protect invariants;
* idempotency covers retry-sensitive actions;
* events/outbox deliver consequences safely;
* projections rebuild/reconcile;
* authorization is server-side;
* audit is meaningful;
* receipts are recoverable;
* historical truth is reproducible;
* migrations are rehearsed;
* production test isolation is proven;
* recovery is rehearsed;
* release evidence belongs to the exact candidate SHA.

⸻

PART LXXXII

RELEASE BLOCKERS FROM CURRENT VISUAL AUDIT

187. Known Public blockers

The currently observed defects must be treated as explicit V3 closure items:

Countries

Legacy composition / reskin.

Shows

Legacy composition / reskin.

Wiki

Legacy surface inside V3 shell.

Songs & Artists

Incorrect destination to edition page and missing canonical discovery surface.

Edition

Needs stronger V3 hierarchy and bounded Overview collections.

Participants

Must not produce an Overview scroll marathon.

Songs

Must not produce an Overview scroll marathon.

Published Spotify/YouTube/media links must be surfaced appropriately.

Delegation detail

Promising V3 structure but identity/visual presentation remains incomplete.

Notifications

Over-carded and internal-system language exposed to users.

Notification Settings

Quiet Hours controls require genuine mobile input redesign.

Rules

Strong new concept, but search composition and sticky layout need correction.

Top Chrome

Too vertically expensive and may obstruct scrolling content.

Bottom Navigation

Strong V3 concept, but content obstruction must be eliminated.

Loading

Legacy TSBC logo must be replaced by Solaris V3 launch experience.

⸻

PART LXXXIII

DESIGN REVIEW TEST

188. The one-question test

For each migrated screen ask:

If I removed the new V3 colours, would the screen still clearly feel structurally different from Solaris V2?

If no:

the redesign is not complete.

⸻

PART LXXXIV

FINAL RELEASE PHILOSOPHY

189. No fake completion

V3 is not complete because:

* all routes compile;
* the V3 nav exists;
* screenshots look blue;
* a capability report says “implemented”;
* a PR merged;
* Browser Audit passed once;
* one viewport works.

V3 is complete when:

product design, domain behaviour, system integrity, responsive experience, accessibility, migration, recovery, testing and release evidence all agree that the new product actually exists.

⸻

PART LXXXV

DEFINITION OF SOLARIS STUDIO V3 COMPLETE

Solaris Studio V3 is complete only when all of the following are true:

PRODUCT

It behaves as one coherent application.

GENERATION

It visibly and structurally feels like a new generation rather than a V2 reskin.

PUBLIC

Every retained Public capability has been mapped, redesigned or intentionally merged/retired.

SCREEN INVENTORY

All primary, secondary, tiny, rare, system and transition screens have an explicit disposition.

MOBILE

The iPhone experience is first-class.

NAVIGATION

The canonical floating Instagram-parity navigation meets its visual and interaction specification.

DISCOVERY

Explore offers real entity discovery rather than directories dumped into cards.

MUSIC

Song and Artist are first-class entities with published media linking.

EDITIONS

Edition acts as a hub, not a kilometre-long database page.

PARTICIPATION

Official responsibilities are trustworthy, resumable and recoverable.

RESULTS

Official outcomes are primary and deeper analysis is coherent.

ME

Personal identity, history and settings form one clear space.

ORGANIZER

Organizer controls the real canonical contest system.

SYSTEM

There is one canonical truth per domain.

RELIABILITY

Retries, network uncertainty and multi-device use do not create duplicate official state.

HISTORY

Official contest truth remains reproducible.

PRIVACY

Private state never leaks through alternate surfaces.

ACCESSIBILITY

Critical workflows meet their accessibility contract.

PERFORMANCE

The app feels immediate enough for normal use.

TEST SAFETY

No automated test traffic reaches production Supabase.

MIGRATION

Legacy routes and data have explicit safe cutover paths.

QA

Critical cross-product journeys pass.

RELEASE

Final evidence is produced on the exact final candidate SHA.

Only then may Solaris Studio V3 be declared complete.

Until then, V3 remains in implementation, regardless of how photogenic the navigation bar has become.