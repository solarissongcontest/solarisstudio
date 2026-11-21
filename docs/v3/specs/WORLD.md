SOLARIS STUDIO V3

TERRA SOLARIS GOVERNANCE, POLITICS & INTERNATIONAL INSTITUTIONS

Canonical Implementation Master Plan v1.0

Status: Implementation-ready project-source specification
Scope: Solaris Studio V3 / Terra Solaris world systems
Intended authority: Canonical for the Terra Solaris Governance subsystem once adopted into Project Sources
Supersedes: Earlier brainstorming and draft Terra Solaris governance plans
Does not replace: Existing canonical V3 System, Public, Organizer, Navigation/PWA, release-readiness, production-safety, Archive, notification, authorization or certification specifications

⸻

0. PURPOSE

This specification defines exactly how Solaris Studio shall implement the political, governmental, international, institutional and historical systems of the Terra Solaris roleplay world.

The goal is to evolve Solaris Studio from a system that primarily operates the Solaris Song Contest into a system that also provides the authoritative digital operating environment for the wider Terra Solaris world.

The system shall support:

* persistent countries;
* country ownership/control;
* Heads of Delegation;
* fictional governments and officials;
* domestic political systems;
* international organizations;
* GUARD;
* UNITY;
* future international unions;
* international membership;
* representatives and proxies;
* institutional offices;
* terms based on SSC editions;
* elections and campaigns;
* assemblies;
* sessions;
* agendas;
* proposals and bills;
* amendments;
* voting;
* resolutions and formal decisions;
* statements;
* charters and rulebooks;
* treaties and protocols;
* archives;
* institutional historical records;
* private member workspaces;
* private institutional chat;
* sanctions;
* enforcement;
* investigations;
* mediation;
* the UNITY Ethics Committee;
* the International Terra Solaris Court;
* union recognition through UNITY;
* world history;
* following;
* push and in-app notifications;
* institutional responsibilities in Participate;
* identity/history in Me;
* country editing through MySolaris;
* public discovery through Explore;
* desktop web;
* mobile web;
* installed PWA;
* tablet;
* accessibility;
* offline/read-only behavior;
* migration and historical backfill;
* security;
* audit;
* release certification.

The result shall be one coherent Terra Solaris world system rather than unrelated GUARD pages, UNITY pages, lore pages, chats and rulebook PDFs.

⸻

1. CORE PRODUCT PRINCIPLE

Solaris Studio shall structure official canon, not every piece of roleplay.

Freeform roleplay remains freeform.

Participants may continue to:

* discuss politics in DMs;
* negotiate on Instagram;
* roleplay conversations;
* write stories;
* create lore through Page Builder;
* conduct informal diplomacy outside Solaris.

Solaris becomes authoritative when something becomes:

* official;
* actionable;
* constitutionally meaningful;
* capability-changing;
* historically meaningful;
* institutionally binding;
* a formal publication;
* a formal vote;
* a law/resolution;
* a membership action;
* a leadership action;
* a Court action;
* an archival record.

Example:

Informal DM negotiation: not required to be recorded.

GUARD proposal submitted by DM: must be registered in Solaris before formal institutional processing.

GAG vote: Solaris is authoritative.

Government lore: may be authored through Page Builder.

Current head of state: structured canonical fact.

Roleplay argument between states: informal.

Formal Court case: Solaris is authoritative.

This principle is mandatory.

Do not turn Terra Solaris into bureaucratic form-filling for ordinary roleplay.

⸻

2. SOURCE AND AUTHORITY HIERARCHY

When implementing this plan, use the following precedence:

1. Newer explicit instructions from the Solaris Studio project owner.
2. This adopted Terra Solaris Governance specification.
3. Newer canonical Solaris V3 authority/release addenda.
4. Canonical V3 System specification.
5. Canonical V3 Public specification.
6. Canonical V3 Organizer specification.
7. Canonical Navigation/PWA specifications.
8. Existing correct repository architecture and canonical domain ownership.
9. Revised GUARD/UNITY constitutional text.
10. Existing older GUARD/UNITY documents where not superseded.
11. External research only as implementation guidance, never as Terra Solaris canon.

External research must never silently override fictional constitutional decisions.

⸻

3. IMPLEMENTATION MINDSET

Before modifying the repository:

1. fetch latest main;
2. inspect active relevant PRs;
3. inspect current migrations;
4. inspect current capability ownership;
5. inspect current Supabase state when required;
6. determine whether any part of this plan has already been implemented;
7. reuse correct systems;
8. extend canonical owners;
9. implement the next safe dependency.

Do not:

* recreate existing systems because this specification uses a different conceptual name;
* create duplicate country ownership;
* create duplicate notification infrastructure;
* create duplicate Task Engine infrastructure;
* create duplicate archive truth;
* create duplicate rulebook truth;
* create duplicate capability engines;
* create browser-only authoritative mutations;
* weaken RLS to make UI work;
* hardcode GUARD/UNITY behavior throughout the frontend;
* create one enormous implementation PR;
* spend excessive effort on visual polish before authoritative workflows exist.

⸻

4. EXISTING SOLARIS SYSTEMS THAT MUST BE REUSED

The current repository already owns several concepts required by this specification.

These must be extended rather than replaced.

4.1 Current country authority

Existing:

public.country_accounts

Canonical meaning:

current real Solaris user controlling a country.

Existing guarantees include one country per account and one account per country.

Do not create a new competing current_country_controller table.

⸻

4.2 Country public profile

Existing:

* public.country_profiles
* public.country_profile_sections
* public.country_media

These already own lightweight Terra Solaris public profile information such as:

* capital;
* government type;
* leader;
* demonym;
* languages;
* currency;
* motto;
* population;
* established date;
* summary;
* custom sections;
* media.

Extend this model.

Do not create a second current government_profile source.

⸻

4.3 Persistent HoD/person identity

Existing:

* public.delegation_people
* public.delegation_hod_assignments
* public.country_hod_edition_claims

Use delegation_people or its canonical successor as the durable real-person identity for:

* historical HoDs;
* international officeholders;
* representatives;
* election candidates;
* proxies;
* historical country controllers.

Do not use auth.users.id as the only historical identity.

A deleted login must not erase a former GUARD Chairperson from history.

⸻

4.4 Following

Existing:

public.fan_follows

Existing notification levels:

* none
* important
* all

Extend this system to support Terra Solaris organizations.

Do not create world_follows.

⸻

4.5 Participation Task Engine

Existing task states:

* completed
* available
* needs_attention
* upcoming
* waiting
* problem
* finished

Existing importance:

* required
* recommended
* optional
* informational

Extend the Task Engine with institutional subjects and task kinds.

Do not create world_tasks.

⸻

4.6 Existing V3 infrastructure

Reuse:

* capability engine;
* ViewerContext;
* operations;
* idempotency;
* expected-version handling;
* domain-event/outbox infrastructure;
* receipts;
* consequence handling;
* notification delivery;
* reconciliation;
* audit;
* archive infrastructure;
* search infrastructure;
* responsive shell;
* floating mobile navigation;
* PWA lifecycle;
* offline/degraded states;
* production isolation.

⸻

5. TERMINOLOGY

Use the following canonical terms.

Country

Persistent sovereign Terra Solaris nation.

Not edition-scoped.

⸻

Country controller

The one real Solaris user currently controlling the country.

Normally the same real person as the active HoD.

⸻

HoD

Head of Delegation.

SSC-facing identity of the country controller for participating editions.

⸻

Lore person

Fictional character within Terra Solaris.

Examples:

* President;
* Prime Minister;
* monarch;
* minister;
* judge.

A lore person is not automatically a Solaris account.

⸻

Organization

International institution such as:

* GUARD;
* UNITY;
* future recognized unions.

⸻

Organ

Institutional sub-body.

Examples:

* General Assembly of GUARD;
* UNITY General Assembly;
* UNITY Ethics Committee.

⸻

Office

Persistent institutional position.

Examples:

* GUARD Chairperson;
* GUARD Deputy Chairperson;
* UNITY Secretary-General.

⸻

Office term

Time-bound holding of an office by a real person.

⸻

Representative

Real Solaris person authorized to represent a country in an organization.

⸻

Session

Formal meeting of an institutional organ.

⸻

Measure

Generic technical term for a formal legislative/procedural item.

UI labels may use:

* Proposal;
* Bill;
* Motion;
* Draft Resolution;
* Charter Amendment.

⸻

Resolution

Adopted formal institutional output.

⸻

Decision

Formal institutional action that is not necessarily a resolution.

⸻

Document

Continuing legal/institutional work such as:

* Charter;
* Rulebook;
* Treaty;
* Protocol.

⸻

Document version

Specific effective version of a document.

⸻

Artifact

Rendered representation such as:

* Solaris-native HTML;
* PDF export.

⸻

6. CANONICAL INSTITUTIONAL TIME

Terra Solaris political time uses SSC editions.

Canonical conversion:

4 Terra Solaris years = 2 SSC editions.

Public leadership term display:

SSC 22–23

Do not primarily display:

2026–2028

unless useful supplementary real-world metadata exists.

Office configuration stores:

default_term_length_editions

Normal:

* GUARD Chairperson: 2
* UNITY Secretary-General: 2

Other offices may use different values.

Term length must never be globally hardcoded to 2.

⸻

7. COUNTRY CONTROL

There is exactly one current real controller for each country.

country_accounts remains current authority.

A country’s controller remains authoritative even when that country does not participate in the current SSC edition.

Example:

Oland skips SSC 24.

Oland still:

* exists;
* has a government;
* belongs to organizations;
* retains its representative;
* may hold GUARD office;
* may vote internationally;
* may participate in Court cases.

Edition participation must never determine whether the country exists politically.

⸻

8. COUNTRY CONTROL TRANSFER

When Solaris assigns a new HoD/controller:

the new account becomes the country’s current authority.

The transition command must atomically:

1. validate new owner;
2. validate country;
3. close old historical control term;
4. preserve old person’s historical identity;
5. transfer current country_accounts ownership using the existing account-management architecture;
6. create a new control-history term;
7. update current HoD mappings where appropriate;
8. reconcile organization representation;
9. revoke previous current capabilities;
10. grant new current capabilities;
11. invalidate private-space access as appropriate;
12. reconcile tasks;
13. reconcile notifications;
14. emit domain event;
15. create audit record;
16. return receipt.

Logical command:

world_transfer_country_control_v1

Implementation should reuse existing country-account administrative RPCs where they already safely implement account transfer.

⸻

9. COUNTRY CONTROL HISTORY

Add historical relation only.

Recommended table:

public.world_country_control_terms

Columns:

* id uuid pk
* country_id uuid not null
* person_id uuid not null
* user_id uuid null
* started_at timestamptz not null
* ended_at timestamptz null
* start_edition_id uuid null
* end_edition_id uuid null
* source text not null
* reason_started text null
* reason_ended text null
* created_at timestamptz
* revision bigint

Rules:

* person_id is durable identity.
* user_id is optional current login linkage.
* deletion of auth user must not delete historical term.
* at most one open historical control term per country.
* current authority still comes from country_accounts, not this history table.

⸻

10. REAL PEOPLE VS LORE PEOPLE

Do not combine them.

Real person

Use canonical persistent participant/HoD person model.

Can:

* log in if linked to account;
* hold real organization office;
* cast institutional ballot;
* manage private spaces;
* submit official proposal.

Lore person

Add:

public.world_lore_people

Fields:

* id;
* country_id;
* name;
* native_name;
* biography;
* image;
* birth/death metadata;
* public summary;
* status;
* created_by_country;
* revision.

Lore persons may hold fictional domestic offices.

They do not receive authorization capabilities.

⸻

11. COUNTRY GOVERNMENT EXTENSION

Keep country_profiles as lightweight Overview source.

Add structured child modules for advanced politics.

Recommended tables:

* world_government_systems
* world_domestic_offices
* world_domestic_office_terms
* world_political_parties
* world_legislatures
* world_legislative_chambers
* world_cabinets
* world_ministries
* world_domestic_elections
* world_domestic_measures
* world_domestic_laws

Only countries using advanced roleplay need populate them.

Empty modules must not clutter public UI.

⸻

12. ORGANIZATIONS

Add:

public.world_organizations

Columns:

* id;
* slug unique;
* official_name;
* short_name;
* type;
* description;
* emblem_url;
* banner_url;
* accent_token;
* founded_at;
* founded_edition_id;
* recognized_at;
* recognition_authority_id;
* status;
* public_visibility;
* current_document_id;
* created_at;
* updated_at;
* revision.

Statuses:

* proposed;
* recognized;
* active;
* suspended;
* dissolved;
* historical.

Initial records:

* GUARD
* UNITY

⸻

13. GUARD CANONICAL IDENTITY

Official name:

Global Union for Allied Resilience and Defence

Short name:

GUARD

Spelling:

Defence

The older “Response and Defense” wording in the existing PDF is superseded for current identity.

Historical source imports may record that wording as historical source text.

⸻

14. UNITY

Official organization:

UNITY

UNITY represents the broad international institution of recognized sovereign Terra Solaris countries.

All recognized countries are normally members automatically.

A country may voluntarily withdraw.

An extreme expulsion is possible through the defined General Assembly process.

⸻

15. ORGANIZATION ORGANS

Add:

public.world_organization_organs

Fields:

* id;
* organization_id;
* slug;
* name;
* short_name;
* type;
* description;
* visibility;
* status;
* sort_order;
* revision.

Seed:

GUARD

gag

General Assembly of GUARD.

UNITY

general-assembly

UNITY General Assembly.

ethics-committee

UNITY Ethics Committee.

Do not create a separate UNITY Council.

Existing references to UNITY Council are interpreted as General Assembly unless a future constitutional revision creates a new distinct body.

The old “internal UNITY peaceful group” is not a separate organ.

Use the mediation system.

⸻

16. ORGANIZATION MEMBERSHIP

Add:

public.world_organization_memberships

Represents:

Country ↔ Organization

Columns:

* id;
* organization_id;
* country_id;
* membership_type;
* status;
* joined_at;
* joined_edition_id;
* ended_at;
* ended_edition_id;
* admission_measure_id;
* termination_measure_id;
* termination_reason;
* created_at;
* revision.

Statuses:

* member;
* observer;
* associate;
* suspended;
* withdrawn;
* expelled;
* former.

Constraint:

one active membership relationship per organization/country.

Never delete concluded membership history.

⸻

17. UNITY AUTOMATIC MEMBERSHIP

When a country becomes canonically recognized as sovereign:

UNITY membership should be created automatically unless:

* country previously withdrew and has not rejoined;
* country has a special excluded status;
* country was expelled and not reinstated.

A country that voluntarily leaves UNITY does not immediately auto-rejoin merely because it remains recognized.

Re-entry requires explicit reinstatement/rejoin action.

⸻

18. GUARD MEMBERSHIP

GUARD membership is voluntary.

Admission:

1. application;
2. GAG consideration;
3. vote;
4. exact two-thirds approval;
5. membership activation.

Voluntary withdrawal:

* no vote;
* immediate after confirmed country-controller action.

Expulsion:

* GAG vote;
* exact two-thirds approval.

⸻

19. REPRESENTATIVES

Add:

public.world_organization_representations

Columns:

* id;
* organization_id;
* country_id;
* person_id;
* user_id nullable;
* role;
* voting_authority boolean;
* starts_at;
* ends_at;
* start_edition_id;
* end_edition_id;
* source;
* revision.

Rules:

* one active ordinary voting representative per country per organization;
* current country controller is default representative unless explicitly changed;
* historical representative uses durable person_id;
* user linkage is optional/current.

⸻

20. PROXIES

Add:

public.world_representation_proxies

Fields:

* id;
* representation_id;
* proxy_person_id;
* proxy_user_id;
* session_id;
* valid_from;
* valid_until;
* reason;
* status;
* requested_by;
* approved_by;
* approved_at;
* revoked_at;
* revision.

Statuses:

* requested;
* approved;
* rejected;
* expired;
* revoked.

Proxy rules:

* proxy must be explicitly approved;
* proxy is session/date scoped;
* proxy automatically expires;
* proxy never becomes permanent representation;
* proxy does not create second country vote;
* proxy ballot is recorded as acting for the represented country.

⸻

21. OFFICES

Add:

public.world_organization_offices

Fields:

* id;
* organization_id;
* organ_id nullable;
* slug;
* title;
* office_type;
* appointment_method;
* default_term_length_editions;
* succession_policy;
* display_priority;
* active;
* revision.

Initial offices:

GUARD:

* Chairperson
* Deputy Chairperson

UNITY:

* Secretary-General
* Deputy Secretary-General

⸻

22. OFFICE TERMS

Add:

public.world_office_terms

Columns:

* id;
* office_id;
* holder_person_id;
* holder_user_id nullable;* represented_country_id nullable;
* start_edition_id;
* end_edition_id;
* started_at;
* scheduled_end_at;
* actual_end_at;
* term_kind;
* predecessor_term_id nullable;
* succession_reason nullable;
* status;
* revision.

Term kinds:

* full;
* acting;
* interim;
* partial;
* renewed.

Statuses:

* scheduled;
* active;
* ended;
* removed;
* resigned.

Historical term must survive auth-account deletion.

Only one active holder per single-holder office.

⸻

23. GUARD CHAIRPERSON

Full term:

2 editions.

Candidate must be valid under GUARD rules.

Candidate chooses Deputy during campaign.

Chairperson is the primary executive/administrative leader.

Normal capabilities include:

* organization profile management;
* organization content management;
* GUARD statement publication;
* session management;
* agenda management;
* membership application handling;
* execution of approved admission;
* execution of approved expulsion;
* temporary enforcement;
* representative administration;
* proposal registration;
* procedural proposal review;
* voting administration;
* resolution publication;
* document management;
* private-space management;
* audit access.

Chairperson cannot:

* bypass GAG admission vote;
* bypass GAG expulsion vote;
* alter concluded vote result;
* silently rewrite resolution history;
* exercise SSC Owner break-glass power.

⸻

24. GUARD DEPUTY CHAIRPERSON

The Deputy is selected by the Chairperson candidate during the campaign.

It is not a separately elected office.

The Deputy is a helping hand.

Deputy normally receives:

* profile/content editing;
* agenda management;
* session administration;
* document administration;
* statements;
* room administration;
* representative administration;
* proposal registration;
* operational workflow management.

Deputy must not independently:

* execute expulsion;
* execute admission without required authority;
* impose major irreversible sanction;
* exercise SSC Owner emergency authority;
* change constitutional identity;
* remove Chairperson;
* modify concluded official history.

⸻

25. GUARD SUCCESSION

If Chairperson:

* resigns;
* is removed;
* becomes unavailable;
* loses eligibility;

then:

1. Deputy becomes Acting Chairperson;
2. acting office term is created;
3. acting capability bundle becomes active;
4. new election task is created;
5. election occurs;
6. Acting Chairperson term ends when successor assumes office.

Do not silently convert Deputy’s existing term into full Chairperson term.

⸻

26. UNITY SECRETARY-GENERAL

Full term:

2 editions.

Candidate chooses Deputy during campaign.

Secretary-General is:

* administrative head;
* public institutional leader;
* meeting authority;
* mediator;
* Court authority under current canon.

Capabilities:

* profile/content;
* sessions;
* agenda;
* statements;
* document publication;
* execution of General Assembly resolutions;
* classification of substantive/procedural matters;
* mediation;
* sanctions execution where authorized;
* Court administration;
* judgment issuance;
* reconsideration decisions;
* space management;
* audit access.

Secretary-General does not replace General Assembly legislative authority.

⸻

27. UNITY DEPUTY SECRETARY-GENERAL

Selected by Secretary-General candidate during campaign.

No separate GA confirmation.

Receives broad administrative helper capabilities.

Cannot independently:

* expel members;
* issue final Court judgment unless acting as SG;
* exercise SSC Owner emergency authority;
* make major constitutional decisions;
* override General Assembly.

⸻

28. CAPABILITY ARCHITECTURE

Titles are not authorization.

Never implement:

if (role === "chairperson")

Use capability checks scoped to organization/object.

Recommended capability namespace:

Organization

* world.organization.view_private
* world.organization.profile.manage
* world.organization.branding.manage
* world.organization.settings.manage

Membership

* world.membership.apply
* world.membership.review
* world.membership.introduce
* world.membership.execute_admission
* world.membership.withdraw
* world.membership.execute_expulsion
* world.membership.suspend

Representation

* world.representation.manage
* world.proxy.request
* world.proxy.approve

Office

* world.office.manage
* world.office.term.assign
* world.office.term.transition

Sessions

* world.session.create
* world.session.manage
* world.session.attendance.manage

Agenda

* world.agenda.manage

Measures

* world.measure.submit
* world.measure.register_external
* world.measure.review_procedural
* world.measure.schedule
* world.measure.withdraw
* world.amendment.submit

Voting

* world.vote.admin
* world.vote.cast
* world.vote.certify

Publication

* world.statement.publish
* world.resolution.publish
* world.document.publish

Spaces

* world.space.create
* world.space.manage
* world.space.message
* world.space.moderate

Ethics

* world.ethics.case.manage
* world.ethics.finding.issue

Court

* world.court.case.file
* world.court.case.respond
* world.court.case.manage
* world.court.order.issue
* world.court.judgment.issue
* world.court.reconsideration.decide

Emergency

* world.emergency.intervene

Capabilities must include organization/country/organ/object scope.

⸻

29. ORGANIZATION POLICY CONFIGURATION

Do not hardcode every constitutional rule into UI.

Add reusable policy records.

Recommended:

world_voting_rules

world_election_rules

world_membership_policies

world_space_policies

Each active vote/election must freeze a policy snapshot when opened.

Later rulebook changes must not change an already-open or historical vote.

⸻

30. VOTING RULE MODEL

public.world_voting_rules

Fields:

* id;
* organization_id;
* key;
* label;
* ballot_type;
* secrecy;
* quorum_numerator;
* quorum_denominator;
* threshold_kind;
* threshold_numerator;
* threshold_denominator;
* denominator_policy;
* abstention_allowed;
* ballot_change_policy;
* publication_mode;
* tie_policy;
* active.

Never store only "67%".

Use exact fractions.

⸻

31. CANONICAL THRESHOLD MATH

Simple majority

Pass if:

AYE > denominator / 2

Equivalent integer-safe form:

AYE * 2 > denominator

⸻

Two-thirds

Pass if:

AYE * 3 >= denominator * 2

Do not implement literal 67%.

⸻

Three-fourths

Pass if:

AYE * 4 >= denominator * 3

⸻

Unanimous

Pass if:

AYE = denominator

⸻

32. ABSTENTIONS

GUARD and UNITY canonical policy:

ABS counts in the approval denominator.

Example:

8 AYE
2 NAY
5 ABS

denominator = 15.

AYE share = 8 / 15.

Do not silently use UN-style “present and voting.”

⸻

33. QUORUM

GUARD:

50%.

UNITY:

50%.

Quorum calculation:

valid ballots including abstentions / frozen eligible electorate

must be at least:

1/2.

Integer-safe:

valid_ballots * 2 >= eligible_voters.

⸻

34. ELIGIBLE VOTER SNAPSHOT

When a vote opens:

create:

public.world_vote_eligibility

Fields:

* vote_id;
* country_id;
* representation_id;
* eligible;
* reason;
* snapshotted_at.

This snapshot is authoritative.

Membership changes after opening do not silently change the electorate.

If eligibility must change during an open vote:

use explicit administrative command:

world_override_vote_eligibility_v1

with:

* reason;
* authority;
* audit;
* reconciliation.

⸻

35. VOTE TYPES

Support:

* recorded roll-call;
* restricted roll-call;
* aggregate-only;
* secret election.

Do not use the same ballot storage pattern for secret elections and public legislative votes.

⸻

36. RECORDED BALLOTS

For ordinary institutional votes:

private.world_ballots

Fields:

* id;
* vote_id;
* country_id;
* representation_id;
* proxy_id nullable;
* choice;
* cast_at;
* operation_id;
* receipt_id.

Unique:

vote_id + country_id

unless a voting rule explicitly allows revision.

Default GUARD/UNITY legislative policy:

locked after cast.

Changing a vote requires an explicit reopen/correction command with audit, not direct row update.

⸻

37. SECRET BALLOTS

Secret elections must not store choice together with country/user identity.

Use separate structures:

private.world_secret_vote_participation

* vote_id;
* country_id;
* issued;
* cast;
* receipt_id.

private.world_secret_ballots

* id;
* vote_id;
* anonymous_token_hash;
* choice;
* cast_at.

Flow:

1. verify authorized country;
2. verify not already participated;
3. issue one-time token;
4. submit anonymous ballot;
5. mark participation;
6. invalidate token;
7. store no country/user on choice row;
8. return participation receipt.

This provides application-level ballot secrecy.

Do not claim cryptographic end-to-end anonymity.

Admin/database operators may remain technically capable of correlation through infrastructure metadata.

True cryptographic voting is outside v1.

⸻

38. ELECTION DOMAIN

Add:

world_elections

world_election_candidates

world_election_rounds

world_election_endorsements

Election states:

* planned;
* nominations;
* campaign;
* voting;
* runoff;
* certified;
* concluded;
* cancelled.

Candidate record includes:

* candidate_person_id;
* country_id;
* deputy_person_id;
* platform;
* campaign content;
* eligibility state.

⸻

39. GUARD CHAIRPERSON ELECTION

Use current constitutional process.

Round One:

* secret ballot;
* all eligible GUARD member countries;
* 50% quorum;
* unanimous support produces immediate victory;
* abstention prevents unanimity.

If no unanimous winner:

Round Two:

* top two candidates;
* secret ballot;
* 50% quorum;
* simple majority;
* abstentions count in denominator.

Persistent tie:

SSC Owner resolves under GUARD emergency/election authority.

All candidate/round/result metadata remains archived.

Secret ballot choices do not become roll-call history.

⸻

40. UNITY SECRETARY-GENERAL ELECTION

The current Charter provides:

* secret ballot;
* SG election;
* candidacy endorsement threshold;
* SG certification.

The revised Charter must define final winner mechanics before Solaris autonomously certifies a UNITY SG election.

Implementation requirement:

world_election_rules must require an explicit configured winner rule.

The system must refuse to open an election with an incomplete rule.

Do not invent winner logic in frontend code.

⸻

41. SESSIONS

Add:

public.world_sessions

Fields:

* id;
* organization_id;
* organ_id;
* title;
* sequence_number;
* edition_id;
* starts_at;
* ends_at;
* venue_type;
* venue_label;
* external_url nullable;
* status;
* chair_person_id;
* quorum_rule_snapshot;
* visibility;
* revision.

Statuses:

* scheduled;
* open;
* recessed;
* concluded;
* cancelled;
* archived.

⸻

42. GUARD SESSION VENUE

The official GUARD Instagram group chat may remain meeting venue.

A Solaris session can record:

venue_type = external

venue_label = "Official GUARD Instagram group chat"

Solaris manages:

* agenda;
* attendance;
* proposal records;
* votes;
* decisions;
* minutes;
* archive.

Solaris does not need to replace Instagram.

⸻

43. UNITY SESSIONS

UNITY should support:

* regular sessions at least monthly;
* immediate sessions when a bill/proposal requires consideration;
* emergency sessions.

The contradictory phrase “annually, at least once a month” must be corrected in revised Charter text.

Canonical intent:

at least monthly, and additionally as needed.

⸻

44. ATTENDANCE

Add:

world_session_attendance

Fields:

* session_id;
* country_id;
* representation_id;
* status;
* proxy_id nullable;
* recorded_at.

Statuses:

* present;
* absent;
* proxy.

Do not include “excused” in v1 unless added constitutionally later.

⸻

45. AGENDAS

Add:

world_agenda_items

Fields:

* id;
* session_id;
* position;
* item_type;
* title;
* description;
* subject_type;
* subject_id;
* sponsor_country_id;
* state;
* created_at;
* revision.

States:

* draft;
* scheduled;
* active;
* postponed;
* completed;
* withdrawn.

Agenda reordering must use server command and revision checks.

⸻

46. FORMAL MEASURES

Add:

public.world_measures

Fields:

* id;
* organization_id;
* organ_id;
* identifier;
* measure_type;
* title;
* short_title;
* sponsor_country_id;
* category_code;
* intake_id nullable;
* source_channel;
* state;
* current_version_id;
* session_id nullable;
* submitted_at;
* registered_at;
* concluded_at;
* visibility;
* revision.

Unique:

organization_id + identifier.

⸻

47. MEASURE TYPES

Supported:

* proposal;
* bill;
* motion;
* draft_resolution;
* membership_application;
* membership_expulsion;
* charter_amendment;
* rule_amendment;
* union_recognition;
* procedural_motion;
* sanction_motion;
* other.

UI displays institution-appropriate labels.

⸻

48. GUARD PROPOSAL IDENTIFIER

Preserve:

GAG.[Year].[Sequence].[Country Code].[Topic Code].[Short Title]

Example format remains structurally unchanged.

Historical IDs are immutable.

Country rename does not rewrite identifier.

Topic code rename does not rewrite identifier.

⸻

49. GUARD TOPIC CODES

Seed topic code registry using known GUARD codes.

Store code registry in data, not frontend switch statements.

Recommended:

world_measure_categories

Fields:

* organization_id;
* code;
* label;
* active;
* effective dates.

Historical inactive codes remain resolvable.

⸻

50. EXTERNAL PROPOSAL INTAKE

A bill may arrive:

* through Solaris;
* through DM;
* through Instagram;
* by another accepted channel.

Add:

private.world_measure_intakes

Fields:

* id;
* organization_id;
* submitted_by_country_id;
* submitted_by_person_id nullable;
* source_channel;
* received_by_person_id;
* received_at;
* raw_title;
* raw_text;
* raw_attachments;
* source_note;
* registered_measure_id nullable;
* hash;
* created_at.

The intake preserves provenance.

It is not itself the formal proposal.

Formal proposal derives from intake.

⸻

51. PROPOSAL SUBMISSION WORKFLOW

Solaris submission:

draft
→ submitted
→ procedural_review
→ registered
→ scheduled
→ under_debate
→ voting
→ final state.

External:

intake_received
→ Chairperson registers
→ same canonical workflow.

⸻

52. PROCEDURAL REVIEW

Chairperson may verify:

* sponsor eligibility;
* required fields;
* malformed text;
* duplicate submission;
* invalid category;
* missing explanation;
* technically impossible document format.

Chairperson may:

Return for correction.

Chairperson may not:

reject because they oppose the political content.

Returned proposals remain historical records of the submission workflow.

⸻

53. MEASURE STATES

Canonical:

* draft;
* submitted;
* procedural_review;
* needs_correction;
* registered;
* scheduled;
* under_debate;
* voting;
* adopted;
* rejected;
* withdrawn;
* superseded;
* repealed;
* archived.

State transition must occur only through server-authoritative commands.

⸻

54. MEASURE VERSIONS

Add:

public.world_measure_versions

Fields:

* id;
* measure_id;
* version_number;
* title;
* full_text;
* summary;
* created_by_person_id;
* created_at;
* reason;
* supersedes_version_id;
* content_hash;
* publication_state.

Never overwrite old proposal text.

⸻

55. AMENDMENTS

Add:

world_measure_amendments

Fields:
* id;
* measure_id;
* sponsor_country_id;
* target_provision_id nullable;
* current_text;
* proposed_text;
* reasoning;
* state;
* related_vote_id;
* incorporated_version_id;
* submitted_at.

States:

* proposed;
* accepted;
* rejected;
* withdrawn;
* superseded.

Accepted amendment creates a new measure version.

⸻

56. PROVISION IDENTITY

For structured legal texts, use persistent provision IDs.

Example:

guard-charter:membership-admission

Display numbering may change:

Version 1: Article 4
Version 2: Article 5

Deep link identity remains stable.

Do not use visible article number as the database identity.

⸻

57. VOTE OPEN COMMAND

Logical RPC:

world_open_vote_v1

Inputs:

* measure/subject;
* expected subject revision;
* voting rule ID;
* opens_at;
* closes_at;
* publication mode.

Server:

1. authorizes;
2. validates state;
3. freezes voting-rule snapshot;
4. freezes eligible electorate;
5. creates vote;
6. changes subject state;
7. creates tasks;
8. sends required notifications;
9. emits event;
10. returns receipt.

⸻

58. CAST BALLOT COMMAND

Logical:

world_cast_ballot_v1

Inputs:

* vote ID;
* expected vote revision;
* choice;
* idempotency key.

Server:

1. authenticate;
2. resolve current country;
3. resolve representation/proxy;
4. verify eligibility snapshot;
5. verify vote open;
6. verify ballot policy;
7. insert ballot atomically;
8. create receipt;
9. resolve user’s vote task;
10. emit event.

⸻

59. VOTE CERTIFICATION

Logical:

world_certify_vote_v1

Server:

1. lock vote;
2. ensure close condition;
3. count eligible electorate;
4. calculate quorum;
5. calculate exact threshold;
6. determine result;
7. store immutable result snapshot;
8. mark certified;
9. transition subject;
10. generate resolution/decision if configured;
11. archive result;
12. reconcile tasks;
13. publish notifications;
14. emit events;
15. return receipt.

Must be idempotent.

⸻

60. VOTE RESULT SNAPSHOT

Add immutable:

world_vote_results

Fields:

* vote_id;
* electorate_count;
* valid_ballot_count;
* aye_count;
* nay_count;
* abstain_count;
* quorum_met;
* threshold_met;
* outcome;
* rule_snapshot;
* certified_at;
* certified_by;
* result_hash.

Historical results must remain reproducible.

⸻

61. PUBLICATION MODE

Each vote rule defines:

* public_roll_call
* member_roll_call
* aggregate_public
* secret

Default v1:

Ordinary GUARD/UNITY legislative votes

Public:

* aggregate result.

Authorized organization members:

* roll-call after close where policy allows.

Elections

Secret.

Public:

* turnout;
* result;
* candidate totals where allowed;
* no country-choice mapping.

⸻

62. RESOLUTIONS

Add:

public.world_resolutions

Fields:

* id;
* organization_id;
* identifier;
* source_measure_id;
* adopted_version_id;
* title;
* text;
* adopted_at;
* effective_at;
* status;
* vote_id;
* revision.

Statuses:

* adopted;
* effective;
* superseded;
* repealed;
* expired.

Resolution is separate from draft proposal.

⸻

63. DECISIONS

Add:

public.world_decisions

For formal non-resolution acts:

* appointments;
* procedural decisions;
* scheduling decisions;
* administrative rulings;
* union recognition result;
* Court-adjacent administrative act.

Do not force every formal act into world_resolutions.

⸻

64. STATEMENTS

Add:

public.world_statements

Types:

* organization;
* officeholder.

Fields:

* organization_id;
* issuing_office_id nullable;
* issuing_person_id nullable;
* title;
* body;
* published_at;
* current_version_id;
* visibility.

Chairperson, Deputy, SG and Deputy SG may publish according to capabilities.

⸻

65. STATEMENT VERSIONING

Add:

world_statement_versions

Never silently rewrite published text.

Correction:

* new version;
* correction reason;
* previous remains accessible;
* current page displays correction note.

⸻

66. DOCUMENT MODEL

Use three conceptual layers.

Work

The continuing legal/institutional document.

Example:

GUARD Rulebook

Table:

world_documents

⸻

Version

Specific effective text.

Example:

GUARD Rulebook effective SSC 22

Table:

world_document_versions

⸻

Artifact

Rendered format.

Example:

* Solaris-native reader;
* PDF export.

Table:

world_document_artifacts

⸻

67. DOCUMENT TYPES

Support:

* charter;
* rulebook;
* annex;
* treaty;
* protocol;
* procedural rules;
* report;
* minutes;
* communiqué;
* other.

⸻

68. DOCUMENT VERSION FIELDS

world_document_versions

* id;
* document_id;
* version_number;
* effective_from;
* effective_to;
* title;
* structured_content;
* plain_text;
* published_at;
* superseded_by;
* source_description;
* content_hash.

Previous versions permanent.

⸻

69. RULEBOOK UX

Primary format:

Solaris-native structured reader.

Features:

* current version;
* effective edition;
* search;
* table of contents;
* provision anchors;
* deep links;
* related provisions;
* previous versions;
* amendment history.

PDF is secondary export.

The old GUARD/UNITY PDFs are source material for migration, not mandatory final presentation.

⸻

70. TREATIES

Add treaty support.

world_treaties

Fields:

* document_id;
* treaty_type;
* opened_at;
* effective_at;
* terminated_at;
* status.

world_treaty_parties

Fields:

* treaty_id;
* country_id;
* role;
* signed_at;
* ratified_at;
* withdrew_at;
* status.

Treaties appear on:

* country International page;
* organization Documents;
* global Archive.

⸻

71. ORGANIZATION ARCHIVE

Every organization has permanent Archive.

Permanent records include:

* concluded measures;
* adopted resolutions;
* rejected measures;
* withdrawn measures where required;
* votes/results;
* elections;
* leadership terms;
* membership decisions;
* official statements;
* rulebook versions;
* treaties;
* formal sanctions;
* final investigations;
* Court judgments where relevant.

Do not treat ordinary working chat as automatically equivalent to an official archival record.

⸻

72. RECORD CLASSIFICATION

Every governance object has:

record_class

Possible:

* working;
* official;
* permanent.

Working:

* draft;
* temporary note;
* ordinary unpinned chat.

Official:

* submitted proposal;
* filed Court pleading;
* published statement.

Permanent:

* concluded proposal;
* resolution;
* certified election;
* judgment;
* leadership term;
* membership decision.

Promotion is explicit/derived.

⸻

73. ARCHIVE CORRECTIONS

Historical records are never silently rewritten.

Use:

world_record_corrections

Fields:

* target_type;
* target_id;
* correction_type;
* explanation;
* previous_value;
* corrected_value;
* authorized_by;
* created_at.

Public record shows:

Corrected on [date]

where appropriate.

⸻

74. GLOBAL TERRA SOLARIS ARCHIVE

Route:

/world/archive

Categories:

* legislation;
* proposals;
* resolutions;
* treaties;
* elections;
* leadership;
* organizations;
* membership;
* Court;
* sanctions;
* documents;
* major events.

Filters:

* country;
* organization;
* edition;
* year;
* type;
* category;
* sponsor;
* outcome;
* officeholder;
* identifier.

⸻

75. GUARD HISTORICAL IMPORT

Import every historical GAG record present in source material.

Preserve:

* exact identifier;
* known outcome;
* source document;
* import timestamp.

If no proposal text exists:

text_availability = unavailable

UI:

Full text unavailable.

Do not infer title from abbreviation.

Do not fabricate sponsor details beyond what identifier reliably encodes.

⸻

76. HISTORICAL COUNTRY IDENTITY

Do not show today’s identity blindly on old records if historical identity differs.

Implementation:

1. audit current repository historical country identity ownership;
2. if existing canonical history supports Terra Solaris world records, extend it;
3. otherwise add historical country identity versions.

Never create another current country identity source.

Historical version may store:

* official name;
* short code;
* flag;
* region;
* effective period.

Archive rendering resolves identity at event time.

Identifiers remain unchanged.

⸻

77. WORLD HISTORY

Add derived world historical-event projection.

world_history_events

Fields:

* id;
* event_type;
* occurred_at;
* edition_id;
* country_ids;
* organization_ids;
* title;
* summary;
* source_type;
* source_id;
* provenance;
* visibility.

Formal events should normally be generated from domain events.

Example:

organization.membership.admitted
→ world history event.

Manual lore events:

allowed.

Must be marked:

source_type = editorial

so they are not confused with automatically derived institutional records.

⸻

78. PRIVATE SPACES

Add:

world_spaces

Fields:

* id;
* organization_id;
* organ_id nullable;
* name;
* description;
* visibility_policy;
* history_policy;
* status;
* created_by;
* revision.

Visibility policies may depend on:

* organization membership;
* office;
* organ membership;
* committee membership;
* country;
* specific user override;
* explicit capability.

⸻

79. SPACE HISTORY POLICIES

Supported:

* from_join
* all_member_history
* custom

Defaults:

General member room

all_member_history

Leadership room

from_join

Committee/investigation room

from_join

Highly sensitive custom room

from_join

A newly admitted member must not automatically see historical confidential leadership/committee chat.

⸻

80. FORMER MEMBER ACCESS

When membership ends:

* live private-space access stops immediately;
* member capabilities are revoked;
* unread private data disappears;
* private search results disappear;
* private chat remains stored;
* former member does not gain continued room access by URL.

Official archival records explicitly available to former members may be accessed through Archive separately.

⸻

81. CHAT

Add lightweight persistent text chat.

Tables:

private.world_space_messages

private.world_space_message_revisions

private.world_space_reactions

private.world_space_attachments

Features:

* messages;
* replies;
* reactions;
* attachments;
* pinned messages;
* timestamps;
* editing;
* moderation;
* search.

Not v1:

* voice;
* video;
* bots;
* Discord-scale permissions;
* public community servers.

⸻

82. MESSAGE EDITING

Edited message must preserve revision metadata.

User-visible:

edited

Moderator redaction:

* replaces visible body;
* preserves audit metadata;
* does not expose removed text to unauthorized users.

⸻

83. CHAT RETENTION

Default:

ordinary private chat is retained while the organization exists unless explicitly deleted/redacted under policy.

It is not automatically part of public historical Archive.

Messages explicitly promoted/pinned as official record may become permanent institutional records.

Do not hard-delete whole organizational history as side effect of membership changes.

⸻

84. FOLLOWING

Extend existing fan_follows.

Add:

organization

to supported entity types.

Do not replace:

none | important | all.

⸻

85. FOLLOW CATEGORY PREFERENCES

Add child table:

fan_follow_categories

Fields:

* follow_id;
* category;
* enabled.

Organization categories:

* statements;
* resolutions;
* leadership;
* sessions;
* documents;
* proposals;
* membership.

⸻

86. DEFAULT FOLLOW BEHAVIOR

Important

Notify:

* official statements;
* major resolutions;
* leadership changes.

Do not default-notify ordinary followers for:

* every proposal;
* ordinary agenda changes;
* routine membership changes.

All

Notify all eligible public event categories.

⸻

87. REQUIRED ROLE NOTIFICATIONS

Role responsibilities bypass optional Follow settings.

Examples:

* vote closes;
* Court response due;
* proxy approval;
* proposal correction;
* leadership transition;
* investigation response.

These use canonical notification/task architecture.

⸻

88. SENSITIVE NOTIFICATION CONTENT

Private push notifications must not leak confidential content on a lock screen.

For sensitive event:

Push:

GUARD
You have a new leadership update.

Inside authenticated Solaris:

show full content.

⸻

89. TASK ENGINE EXTENSION

Add task kinds:

* institutional_vote
* institutional_session
* court_response
* proxy_request
* proposal_correction
* membership_action
* ethics_response
* leadership_transition

Extend task subject/context:

* country;
* organization;
* organ;
* Court case;
* measure;
* vote.

Do not create another state model.

⸻

90. GUARD MEMBERSHIP APPLICATION

Submission fields:

* official state designation;
* government system;
* motivation;
* intended military/financial/technical contributions;
* commitment to international obligations.

Submission may occur:

* in Solaris;
* externally to Chairperson.

External submissions get intake record.

⸻

91. GUARD ADMISSION

Flow:

application
→ Chairperson introduces to GAG
→ vote
→ 50% quorum
→ exact 2/3 approval
→ membership created
→ representation created
→ member capabilities granted
→ spaces available
→ notifications/tasks reconciled
→ history event
→ archive record.

⸻

92. GUARD WITHDRAWAL

Country controller command:

world_withdraw_membership_v1

Review screen shows:

* organization;
* immediate effect;
* voting loss;
* private access loss;
* office consequences if applicable.

Confirmation required.

After success:

* status withdrawn;
* ended_at set;
* representative ends;
* member capabilities revoked;
* open tasks reconciled;
* historical record retained.

⸻

93. GUARD EXPULSION

Requires:

* formal measure;
* GAG vote;
* 50% quorum;
* exact 2/3 threshold.

Execution cannot occur without valid certified decision.

⸻

94. UNITY MEMBERSHIP

Recognized sovereign countries receive membership automatically.

Membership history remains explicit.

Withdrawal:

voluntary.

Rejoining:

explicit.
Expulsion:

formal General Assembly process with 2/3 threshold.

⸻

95. SUSPENSIONS AND SANCTIONS

Add:

world_institutional_actions

Types:

* warning;
* inquiry;
* censure;
* sanction;
* voting_suspension;
* office_removal;
* assistance_freeze;
* membership_rights_suspension;
* project_suspension;
* investigation;
* peace_mission;
* other.

Fields:

* target country/person/office;
* authority;
* source decision;
* reason;
* starts_at;
* ends_at;
* status;
* visibility.

⸻

96. GUARD NON-COMPLIANCE

Implement:

1. formal inquiry;
2. response deadline;
3. country response;
4. Chairperson review;
5. authorized enforcement.

Possible temporary actions:

* voting suspension;
* assistance freeze.

No automatic expulsion.

⸻

97. MEDIATION

Add:

world_mediation_cases

States:

* requested;
* accepted;
* open;
* negotiating;
* settled;
* failed;
* referred_to_court;
* closed.

UNITY’s old “peaceful group” language maps here.

⸻

98. ETHICS COMMITTEE

UNITY includes real Ethics Committee.

Capabilities support:

* private cases;
* evidence;
* committee members;
* findings;
* sanction recommendations;
* archive.

Because the existing constitutional source does not fully define committee size/appointment:

the platform must make committee governance configurable.

Initial implementation rule:

* Ethics Committee organ exists;
* no fixed member count is hardcoded;
* committee membership must be explicitly configured before a case can be assigned;
* Solaris refuses to assign case to an empty committee;
* current revised UNITY Charter must define appointment process before general release.

Do not invent membership implicitly.

⸻

99. ETHICS CASE

Add:

world_ethics_cases

Fields:

* id;
* organization_id;
* subject_country_id nullable;
* subject_person_id nullable;
* allegation;
* filed_by;
* status;
* visibility;
* opened_at;
* concluded_at.

Related:

* evidence;
* committee notes;
* findings;
* recommendations;
* final sanctions.

⸻

100. INTERNATIONAL TERRA SOLARIS COURT

UNITY contains a functional International Terra Solaris Court.

Public areas:

* active public cases;
* recent judgments;
* file case;
* rules;
* archive.

Private case workspace:

* filings;
* evidence;
* orders;
* proceedings;
* judgment drafting.

⸻

101. COURT CASES

Add:

world_court_cases

Fields:

* id;
* identifier;
* applicant_country_id;
* respondent_country_id;
* claim;
* legal_basis;
* requested_remedy;
* status;
* filed_at;
* presiding_person_id;
* public_metadata;
* proceedings_visibility;
* revision.

States:

* filed;
* preliminary_review;
* response_pending;
* proceedings;
* hearing;
* judgment_pending;
* decided;
* reconsideration_requested;
* reconsideration;
* closed;
* archived.

⸻

102. COURT SUPPORT TABLES

Add:

* world_court_parties
* world_court_filings
* private.world_court_evidence
* world_court_hearings
* world_court_orders
* world_court_judgments
* world_court_reconsiderations

⸻

103. COURT JUDGMENT

Secretary-General issues judgment under current canon.

Judgment includes:

* findings;
* reasoning;
* orders;
* remedies;
* publication date;
* related filings;
* case status.

Judgment immutable after publication except correction/version record.

⸻

104. COURT REVIEW TERMINOLOGY

Do not label same-SG review as ordinary appeal.

Use:

Request for Reconsideration

or:

Request for Revision

Initial UI term:

Request reconsideration

because the reviewing authority remains the Secretary-General.

⸻

105. RECONSIDERATION DEFAULT POLICY

Until a more detailed Court rulebook exists:

* each party may submit one reconsideration request per judgment;
* request must state specific grounds;
* Secretary-General may accept or reject request;
* original judgment remains visible;
* reconsideration does not delete original judgment;
* revised decision is separately published;
* no hardcoded time deadline until constitutional rule defines one;
* case cannot be permanently archived while reconsideration is open.

This policy is configuration-backed and may later gain deadlines.

⸻

106. NEW UNION RECOGNITION

UNITY recognizes creation of new independent international unions.

New unions are not children/sub-organizations of UNITY.

Add:

world_union_recognition_applications

Fields:

* proposed_name;
* proposed_short_name;
* founding_countries;
* founding_charter_document;
* mission;
* governance;
* scope;
* exception_requested;
* status;
* submitted_at.

⸻

107. FOUNDING REQUIREMENT

Normal:

minimum 6 founding countries.

General Assembly may grant exception.

Recognition vote:

* 50% quorum;
* exact 2/3 approval.

After approval:

create/activate independent world_organizations row.

⸻

108. GUARD RECOGNITION

GUARD is grandfathered as recognized.

Do not require retroactive recognition vote.

History may state:

Recognized prior to Solaris Governance registry.

⸻

109. DOMESTIC POLITICS

Countries may model full domestic politics.

But feature depth is optional.

A simple country may expose only:

* government type;
* current leader;
* constitution summary.

A complex country may model:

* offices;
* cabinet;
* ministries;
* parliament;
* chambers;
* parties;
* elections;
* domestic bills;
* laws;
* courts;
* political history.

⸻

110. DOMESTIC AUTHORIZATION

Only the country’s current real controller can mutate that country’s domestic political canon, unless explicit delegated capability is added later.

Lore officials do not log in.

One country still has one real controlling participant.

⸻

111. DOMESTIC OFFICE MODEL

Reuse generic office/term concepts where sensible.

Domestic office:

* President;
* Prime Minister;
* monarch;
* minister;
* Speaker.

Holder:

normally world_lore_people.

Do not force domestic lore office terms to use real Solaris users.

⸻

112. DOMESTIC LEGISLATURES

Add configurable legislature.

Fields:

* name;
* chamber structure;
* seat count;
* election cycle;
* description.

Chambers may have:

* title;
* seat count;
* presiding office;
* rules.

No one parliamentary model is mandatory.

⸻

113. DOMESTIC LEGISLATION

Reuse measure/version/amendment concepts.

Domestic process may be configurable per country.

Examples:

democratic:

introduced
→ debate
→ vote
→ enacted.

monarchical:

proposal
→ council
→ assent.

authoritarian:

decree
→ effective.

Solaris must not force all fictional states into Westminster procedure.

⸻

114. DOMESTIC ELECTIONS

Domestic elections are primarily lore simulation controlled by the country controller.

They do not imply multiple real Solaris voters.

Store:

* office/chamber;
* candidates;
* parties;
* result;
* turnout;
* lore votes if desired;
* resulting office terms.

Do not use real authenticated-vote infrastructure unless a future feature explicitly allows multiplayer domestic voting.

⸻

115. PAGE BUILDER

Keep Page Builder.

Structured Terra Solaris data and Page Builder complement each other.

Structured:

* government;
* official officeholders;
* memberships;
* treaties;
* formal history.

Page Builder:

* narrative;
* cultural lore;
* custom sections;
* imagery;
* editorial storytelling.

Never force all lore into structured fields.

⸻

116. PUBLIC PRODUCT IA

Do not add sixth bottom tab.

Canonical remains:

* Home
* Explore
* Participate
* Results
* Me

Terra Solaris public entrance:

Explore → Terra Solaris

⸻

117. WORLD ROUTE TREE

Target conceptual routes:

/world

/world/countries

/world/organizations

/world/organizations/:slug

/world/organizations/:slug/leadership

/world/organizations/:slug/members

/world/organizations/:slug/assembly

/world/organizations/:slug/sessions

/world/organizations/:slug/agenda

/world/organizations/:slug/measures

/world/organizations/:slug/measures/:identifier

/world/organizations/:slug/resolutions

/world/organizations/:slug/statements

/world/organizations/:slug/documents

/world/organizations/:slug/archive

/world/court

/world/court/:caseId

/world/archive

Actual TanStack route filenames must follow repository conventions.

⸻

118. WORLD LANDING PAGE

Purpose:

editorial front page for Terra Solaris.

Desktop:

* world hero;
* current institutional activity;
* major organizations;
* selected countries;
* latest statements;
* major world-history events.

Mobile:

* current world situation;
* latest major update;
* organizations;
* country discovery;
* history.

No database dump.

⸻

119. ORGANIZATIONS DIRECTORY

Desktop:

* featured GUARD/UNITY;
* recognized organizations;
* filters;
* search.

Mobile:

* featured organizations;
* compact searchable list;
* filters in sheet.

⸻

120. ORGANIZATION PAGE

Desktop:

Local nav | Main content | Context rail

Local nav:

* Overview
* Leadership
* Members
* Assembly
* Agenda
* Proposals
* Resolutions
* Statements
* Documents
* Archive

Conditional:

* Member Area
* Manage

Mobile:

hero
→ local compact tabs
→ bounded Overview
→ drill-down.

Never render entire organization on one mobile page.

⸻

121. ORGANIZATION OVERVIEW CONTENT BUDGET

Show:

* identity;
* mission;
* leadership;
* next/current session;
* active measures preview;
* latest statement;
* recent resolutions;
* member count;
* key document link.

Do not show full:

* member list;
* archive;
* all proposals;
* all statements.

⸻

122. LEADERSHIP PAGE

Show:

* current term;
* Chairperson/SG;
* Deputy;
* represented country;
* term SSC X–Y;
* responsibilities;
* previous terms.

Desktop:

current leadership + historical timeline.

Mobile:

stacked current leadership + Previous Terms.

⸻

123. MEMBERS PAGE

Desktop:

structured list/table.

Columns:

* country;
* representative;
* status;
* joined;
* office.

Mobile:

country cards/rows.

No horizontal five-column table.

⸻

124. ASSEMBLY PAGE

GUARD:

General Assembly of GUARD.

UNITY:

General Assembly.

Show:

* current session;
* quorum;
* representatives;
* current agenda;
* open votes;
* upcoming session.

Desktop context rail shows numbers/status.

Mobile uses summaries and drill-down.

⸻

125. SESSION PAGE

Show:

* title;
* status;
* date;
* venue;
* attendance;
* agenda;
* open measures;
* decisions;
* minutes.

Desktop may use split view.

Mobile uses chronological sections.

⸻

126. AGENDA PAGE

Sections:

* Now
* Upcoming
* Completed

Leadership may manage ordering.

Member/public visibility follows item policy.

⸻

127. PROPOSALS DIRECTORY

Filters:

* active;
* adopted;
* rejected;
* withdrawn;
* category;
* sponsor;
* edition;
* identifier.

Desktop:

dense searchable workspace.

Mobile:

search + filter chips + single-column list.

⸻

128. PROPOSAL DETAIL

Desktop:

Navigation | Main proposal | Status/context

Main:

* identifier;
* title;
* sponsor;
* current version;
* full text;
* amendments;
* discussion;
* vote;
* timeline.

Context:

* state;
* session;
* threshold;
* quorum;
* deadline;
* category.

Mobile:

single focused document.

Sticky action only when useful:

* Vote;
* Submit amendment;
* Correct;
* Withdraw.

⸻

129. VOTE PAGE

Before voting show:

* exact subject;
* your represented country;
* ballot options;
* quorum;
* threshold;
* abstention behavior;
* deadline;
* secrecy/publication policy.

GUARD:

AYE
NAY
ABS

Review confirmation before final cast.

⸻

130. VOTE RECEIPT

Recorded vote:

Vote recorded
Oland
GAG.x
AYE
Receipt …

Secret election:

Ballot recorded
GUARD Chairperson Election
Oland participated
Receipt …

Do not include secret choice in durable user receipt.

⸻

131. RESOLUTION PAGE

Document-style.

Show:

* identifier;
* final text;
* adoption date;
* originating measure;
* vote;
* effective status;
* amendments;
* repeal/supersession.

⸻

132. STATEMENT PAGE

Editorial reading layout.

Desktop:

narrow reading column + metadata rail.

Mobile:

single clean column.

Show:

* issuing authority;
* date;
* related entities;
* corrections.

⸻

133. DOCUMENT READER

Desktop:

TOC | Document | Metadata/version

Mobile:

document

* Contents sheet.

Deep links to provision.

Search within document.

⸻

134. ORGANIZATION ARCHIVE PAGE

Desktop:

filter rail + result list.

Mobile:

search + chips + filter sheet.

Archived entity:

read-only.

No current-action controls.

⸻

135. MEMBER AREA

Authorized representative sees:

* country representation;
* upcoming session;
* required vote;
* internal agenda;
* private documents;
* spaces;
* internal announcements.

Actionable responsibilities first.

⸻

136. PRIVATE SPACE

Desktop:

Room list | Chat | Context

Context:

* members;
* files;
* pinned items;
* agenda;
* related measures.

Mobile/PWA:

chat occupies screen.

Room context in sheet/menu.

⸻

137. MANAGEMENT AREA

Authorized leaders get:

Manage GUARD

or:

Manage UNITY

Do not send them into SSC Organizer mode.

Management areas:

* Overview;
* Members;
* Leadership;
* Agenda;
* Sessions;
* Measures;
* Documents;
* Statements;
* Spaces;
* Settings;
* Audit.

Desktop:

local management sidebar.

Mobile:

needs-attention-first grouped navigation.
⸻

138. COUNTRY PUBLIC PAGE

Local sections:

* Overview
* Government
* Domestic Politics
* International
* SSC
* History

Overview remains bounded.

⸻

139. COUNTRY GOVERNMENT PAGE

Potential sections:

* state form;
* government system;
* head of state;
* head of government;
* legislature;
* judiciary;
* constitution;
* cabinet;
* ministries.

Hide unpopulated optional modules.

⸻

140. COUNTRY DOMESTIC POLITICS PAGE

Optional modules:

* Government
* Parties
* Parliament
* Elections
* Legislation
* Cabinet
* Political History

Countries with little domestic RP should not see enormous empty shells.

⸻

141. COUNTRY INTERNATIONAL PAGE

Show:

* UNITY;
* GUARD;
* other organizations;
* representative;
* offices held;
* treaties;
* sanctions;
* Court cases;
* international history.

⸻

142. MYSOLARIS COUNTRY MANAGEMENT

Editing belongs in MySolaris.

Target:

Me / MySolaris → My Country

Sections:

* Overview;
* Public Page;
* Government;
* Domestic Politics;
* International;
* Organizations;
* Page Builder;
* History;
* Media.

⸻

143. DESKTOP COUNTRY EDITOR

Recommended:

Section nav | Editor | Preview/context

Do not require preview for every structured form if unnecessary.

⸻

144. MOBILE COUNTRY EDITOR

Task-based drill-down.

Example:

Manage Oland
→ Government
→ Head of State
→ Edit
→ Save.

Near-full-screen sheets/forms.

⸻

145. PARTICIPATE INTEGRATION

Terra Solaris responsibilities appear beside SSC responsibilities.

Examples:

* GUARD vote;
* UNITY vote;
* Court response;
* proxy approval;
* proposal correction;
* session attendance;
* ethics response.

Urgent required SSC duties still outrank optional international activity.

⸻

146. HOME INTEGRATION

Home may show:

* one required political action;
* major followed world event;
* major leadership change;
* Court deadline.

Do not turn Home into political news feed.

⸻

147. ME INTEGRATION

Identity:

* Country
* HoD
* Country controller

Current:

* GUARD Representative
* UNITY Representative
* Chairperson/SG office

History:

* old terms;
* old roles;
* previous country relationships.

Following:

* GUARD;
* UNITY;
* countries.

⸻

148. SEARCH

Extend global search types:

* organization;
* proposal;
* resolution;
* statement;
* document;
* Court case;
* lore person;
* political party;
* office;
* world-history event.

Search must be permission-aware.

Private:

* room names;
* messages;
* committee cases;
* confidential Court evidence;

must never leak to unauthorized autocomplete.

⸻

149. MOBILE SYSTEM SAFE ZONES

Every Terra Solaris mobile screen obeys existing Top System Safe Zone.

No:

* title;
* back button;
* tab;
* avatar;
* status;
* action;

may enter unsafe system region.

Decorative backgrounds may extend edge-to-edge.

⸻

150. MOBILE BOTTOM NAVIGATION

Keep:

Home
Explore
Participate
Results
Me

Local Terra Solaris navigation uses:

* top back;
* local tabs;
* horizontal segmented nav;
* sheets;
* drill-down.

Never add second competing persistent bottom bar.

⸻

151. DESKTOP COMPOSITION

Where useful:

Sidebar | Main workspace | Context panel

Do not stretch text infinitely on wide monitors.

Reading content remains bounded.

⸻

152. TABLET COMPOSITION

Prefer selective two-pane.

Examples:

Proposal list | Proposal

Rooms | Chat

Archive filters | Results

Editor navigation | Form

⸻

153. MOBILE WEB VS INSTALLED PWA

Same routes.

Same canonical state.

Mobile browser:

* respects browser chrome;
* uses responsive shell.

PWA:

* standalone safe areas;
* push;
* route memory;
* fast resume;
* app-like sheets;
* haptics where appropriate.

Do not create separate feature logic.

⸻

154. LOADING STATES

Skeletons mirror final layout.

Do not blank whole app if existing safe cached projection exists.

Warm launch:

show cached read model
→ refresh authoritative state.

⸻

155. OFFLINE

Allowed read-only where safely cached:

* public organization;
* public rulebook;
* public archive;
* public country page.

Not allowed offline:

* vote;
* proposal final submission;
* membership change;
* Court filing;
* statement publication;
* sanction;
* leadership transition.

Show explicit connection requirement.

Never queue official vote silently for later.

⸻

156. ACCESS CHANGE WHILE SCREEN OPEN

If user loses capability:

* invalidate privileged projection;
* remove privileged actions;
* stop private realtime;
* navigate to safe public/member route if required;
* explain access changed.

No stale leadership controls.

⸻

157. COMMAND NAMING

Use versioned server-authoritative RPC/command naming.

Recommended:

* world_submit_measure_v1
* world_register_external_measure_v1
* world_return_measure_for_correction_v1
* world_schedule_measure_v1
* world_open_vote_v1
* world_cast_ballot_v1
* world_certify_vote_v1
* world_apply_membership_v1
* world_withdraw_membership_v1
* world_execute_membership_admission_v1
* world_execute_expulsion_v1
* world_request_proxy_v1
* world_approve_proxy_v1
* world_publish_statement_v1
* world_publish_document_version_v1
* world_create_space_v1
* world_file_court_case_v1
* world_submit_court_filing_v1
* world_issue_court_judgment_v1
* world_request_court_reconsideration_v1
* world_decide_court_reconsideration_v1
* world_recognize_union_v1
* world_transfer_country_control_v1

Use existing command infrastructure rather than ad-hoc Supabase writes.

⸻

158. COMMAND CONTRACT

Every consequential command:

* authenticates actor;
* resolves country;
* resolves acting capacity;
* checks capability;
* checks scope;
* validates current state;
* validates expected revision;
* accepts idempotency key;
* performs atomic transaction;
* emits events;
* records operation;
* records audit;
* returns receipt;
* reconciles consequences;
* handles retry safely.

⸻

159. REVISION MODEL

Mutable aggregates include:

revision bigint not null default 1

Each successful authoritative mutation increments revision.

Client sends:

expected_revision

Conflict returns:

state_changed

not generic failure.

UI reloads current state and explains conflict.

⸻

160. DOMAIN EVENTS

Canonical semantic events include:

* world.country.control_changed
* world.organization.created
* world.membership.application_submitted
* world.membership.admitted
* world.membership.withdrawn
* world.membership.expelled
* world.representation.changed
* world.office.term_started
* world.office.term_ended
* world.session.opened
* world.session.closed
* world.measure.submitted
* world.measure.registered
* world.measure.version_created
* world.measure.scheduled
* world.vote.opened
* world.vote.ballot_cast
* world.vote.certified
* world.resolution.adopted
* world.statement.published
* world.document.version_published
* world.space.created
* world.ethics.case_opened
* world.court.case_filed
* world.court.judgment_issued
* world.court.reconsideration_decided
* world.union.recognized

Events must be versioned.

Consumers must be idempotent.

⸻

161. EVENT CONSEQUENCES

Depending on event:

* invalidate projection;
* create/resolve task;
* send notification;
* update Following feed;
* create history event;
* update search index;
* update archive;
* change capabilities;
* close space access;
* create receipt.

Consequences must be explicitly registered.

⸻

162. PROJECTIONS

Do not let pages independently assemble canonical state from many raw tables.

Recommended projection RPCs/services:

* world_get_home
* world_get_directory
* world_get_organization
* world_get_members
* world_get_leadership
* world_get_assembly
* world_get_session
* world_get_measure
* world_get_vote
* world_get_archive
* world_get_country
* world_get_country_government
* world_get_country_international
* world_get_member_area
* world_get_manage_overview
* world_get_court_case
* world_get_my_country

Each projection has:

* source list;
* authorization;
* freshness;
* revision;
* cache policy;
* invalidation events;
* rebuild path.

⸻

163. PUBLICATION BOUNDARIES

Every entity has explicit visibility.

Do not infer privacy from hidden routes.

Possible visibility:

* public;
* members;
* leadership;
* committee;
* parties;
* private.

Court evidence defaults private.

Draft statements private.

Published statement public.

⸻

164. RLS

RLS must protect canonical tables.

Anonymous:

only public projections/content.

Authenticated non-member:

same public information plus own data.

Organization member:

member-scoped information.

Leadership:

leadership-scoped information.

Committee:

committee case access.

Court party:

case-scoped private filings/evidence.

Superadmin:

only through explicit system capability.

Frontend hiding is never security.

⸻

165. EMERGENCY SSC OWNER AUTHORITY

Implement narrow break-glass command.

Capability:

world.emergency.intervene

Required:

* strong authentication/reauth;
* target institution;
* reason;
* constitutional basis;
* consequence summary;
* confirmation;
* audit;
* permanent operation record.

Use only when:

* normal procedure failed;
* leadership cannot act;
* severe constitutional deadlock;
* system continuity requires intervention.

Do not expose as ordinary management button.

⸻

166. AUDIT

Each consequential operation records:

* operation ID;
* actor user;
* actor durable person;
* acting country;
* acting office;
* organization;
* capability;
* object;
* expected revision;
* previous state;
* resulting state;
* timestamp;
* source;
* justification where applicable.

Never log secrets.

⸻

167. RECEIPTS

Receipts required for:

* ballot;
* membership application;
* withdrawal;
* proposal submission;
* statement publication;
* Court filing;
* judgment;
* union recognition action;
* leadership transition.

Receipt IDs are stable and reconciliable.

⸻

168. REALTIME

Use realtime for:

* active institutional vote;
* active session;
* chat;
* urgent task resolution;
* leadership/access change.

Do not realtime-subscribe to:

* full archives;
* old rulebooks;
* static historical pages.

⸻

169. PERFORMANCE

Use:

* cursor pagination;
* projection-first loading;
* server aggregation;
* query deduplication;
* bounded fields;
* cache;
* event invalidation;
* lazy chat history.

Avoid:

* full archive downloads;
* N+1 country fetches;
* per-card subscriptions;
* repeated countries list fetches;
* polling static records.

⸻

170. DATA RETENTION

Permanent:

* resolutions;
* concluded measures;
* certified vote result;
* leadership terms;
* membership decisions;
* election result;
* judgments;
* rulebook versions;
* formal sanctions;
* formal statements.

Retained but private:

* chat;
* evidence;
* working institutional records according to policy.

Drafts may be pruned under future retention policy.

Do not implement destructive cleanup before retention policy exists.

⸻

171. RULEBOOK RECONCILIATION: GUARD

Before public launch, revised Solaris-native GUARD Rulebook must reflect:

* Resilience;
* Defence;
* two-edition term;
* Deputy Chairperson;
* Deputy chosen during campaign;
* succession;
* 50% quorum;
* abstentions in denominator;
* admission 2/3;
* expulsion 2/3;
* immediate voluntary withdrawal;
* proposal submission via Solaris or Chairperson;
* procedural review without political veto;
* exact voting math.

⸻

172. RULEBOOK RECONCILIATION: UNITY

Before launch, revised Charter must clarify:

* Secretary-General terminology;
* remove obsolete Chief Secretary wording;
* UNITY Council = General Assembly;
* peaceful group = mediation;
* Ethics Committee;
* Deputy appointment during campaign;
* two-edition terms;
* 50% quorum;
* abstention denominator;
* 2/3 expulsion;
* substantive/procedural classification;
* Charter amendment by 2/3 GA only;
* monthly/as-needed sessions;
* Court reconsideration;
* union recognition;
* emergency authority boundary.

⸻

173. FEATURE FLAGS

Recommended rollout flags:

* terra_world_public
* terra_organizations_public
* terra_governance
* terra_institutional_voting
* terra_documents
* terra_private_spaces
* terra_chat
* terra_enforcement
* terra_court
* terra_union_recognition
* terra_domestic_politics

Flags gate presentation and commands.

Do not use flags as substitute for RLS.

⸻

174. MIGRATION STRATEGY

All migrations additive first.

Do not mega-launch.

Sequence:

1. registry;
2. historical identity extensions;
3. organizations;
4. memberships/offices;
5. documents;
6. measures;
7. votes;
8. archive;
9. spaces;
10. Court;
11. domestic modules.

Backfill before cutover.

Legacy surfaces remain until parity.

⸻

175. INITIAL SEED

Seed:

* GUARD;
* UNITY;
* known memberships;
* current leaders;
* current representatives;
* current rulebook/Charter structured version;
* GUARD historical GAG records;
* current office terms;
* UNITY automatic membership;
* GUARD recognized status.

Seed must be idempotent.

⸻

176. IMPLEMENTATION WAVES

TG0: Reality audit

Inspect latest main and active PRs.

Produce machine-readable capability/domain inventory.

No schema duplication.

⸻

TG1: Country/world identity

Implement:

* control history;
* durable identity integration;
* country profile extension;
* world identity projections.

⸻

TG2: Institution foundation

Implement:

* organizations;
* organs;
* memberships;
* representation;
* offices;
* terms;
* capabilities.

⸻

TG3: Public world

Implement:

* /world;
* organization directory;
* GUARD/UNITY pages;
* country International;
* search integration.

⸻

TG4: Documents and archive

Implement:

* structured documents;
* provisions;
* versions;
* document reader;
* organization Archive;
* GUARD historical import.

⸻

TG5: Membership and leadership

Implement:

* GUARD applications;
* admission;
* withdrawal;
* expulsion;
* offices;
* succession;
* campaigns/election foundation.

⸻

TG6: Sessions

Implement:

* sessions;
* attendance;
* proxy;
* agenda;
* minutes.

⸻

TG7: Measures

Implement:

* Solaris submission;
* external intake;
* identifiers;
* procedural review;
* versions;
* amendments.

⸻

TG8: Voting

Implement:

* policy snapshots;
* eligibility;
* roll-call ballots;
* secret ballots;
* quorum;
* exact thresholds;
* certification;
* receipts.

⸻

TG9: Resolutions/publication

Implement:

* resolutions;
* decisions;
* statements;
* corrections;
* publication.

⸻

TG10: Follow/tasks/notifications

Extend:

* fan_follows;
* categories;
* Task Engine;
* push;
* Me.

⸻

TG11: Private spaces

Implement:

* room access;
* history policy;
* member workspace.

⸻

TG12: Chat

Implement minimal chat.

⸻

TG13: Enforcement

Implement:

* inquiry;
* sanction;
* mediation;
* Ethics Committee.

⸻

TG14: Court

Implement full Court registry and workflow.

⸻
TG15: Union recognition

Implement UNITY recognition workflow.

⸻

TG16: Domestic politics

Implement optional full political modules.

⸻

TG17: World history

Implement derived timeline/global Archive.

⸻

TG18: Product convergence

Complete:

* Home;
* Explore;
* Participate;
* Me;
* MySolaris;
* search;
* notification settings;
* responsive parity.

⸻

TG19: Certification

Run complete acceptance program.

⸻

177. PR STRUCTURE

Suggested coherent PR sequence:

1. TG foundation registry/current-owner integration
2. organizations/membership/offices
3. public world projections
4. documents/archive
5. membership/leadership workflows
6. sessions/proxy/agenda
7. measures/versioning
8. voting
9. resolutions/statements
10. follow/tasks/notifications
11. spaces
12. chat
13. enforcement/Ethics
14. Court
15. union recognition
16. domestic politics
17. global history
18. final integration/certification

Main must remain deployable after each PR.

⸻

178. UNIT TESTS

Required:

* term labeling;
* current controller;
* historical controller;
* membership states;
* proxy expiry;
* capability scopes;
* exact 1/2 quorum;
* simple majority;
* 2/3;
* 3/4;
* unanimity;
* abstention denominator;
* identifier generation;
* version sequencing;
* election rounds;
* secret ballot separation;
* archive classification.

⸻

179. CONTRACT TESTS

Test:

* commands;
* projections;
* RLS;
* events;
* consequences;
* notifications;
* task generation;
* search visibility;
* publication boundaries.

⸻

180. SECURITY TESTS

Explicit adversarial scenarios:

* anonymous member-area fetch;
* former member room access;
* expired proxy vote;
* Deputy calling Chairperson-only command;
* Chairperson bypassing 2/3 admission;
* second ballot;
* ballot after deadline;
* vote with stale revision;
* secret ballot choice disclosure;
* private Court evidence through search;
* private room name leakage;
* forged country ID;
* forged organization ID;
* stale leadership session;
* deleted user historical office;
* membership change during open vote;
* break-glass without reauth.

⸻

181. WORKFLOW REHEARSALS

GUARD admission

Apply
→ introduce
→ vote
→ 2/3
→ admit
→ capabilities
→ spaces
→ archive.

GUARD withdrawal

withdraw
→ access revoked
→ history preserved.

Proposal

DM/Solaris
→ intake
→ register
→ correction
→ schedule
→ debate
→ amendment
→ version
→ vote
→ resolution
→ archive.

Election

candidate
→ Deputy
→ campaign
→ secret round
→ runoff if needed
→ certify
→ office term.

Court

file
→ response
→ evidence
→ hearing
→ judgment
→ reconsideration
→ archive.

HoD transfer

new controller
→ account ownership
→ representation
→ capability transfer
→ old history preserved.

⸻

182. RESPONSIVE GOLDENS

Required visual snapshots:

* World
* Organizations
* Organization Overview
* Leadership
* Members
* Assembly
* Session
* Agenda
* Proposal list
* Proposal detail
* Vote
* Resolution
* Statement
* Rulebook
* Organization Archive
* Member Area
* Private Space
* Chat
* Manage Organization
* Country Government
* Domestic Politics
* International
* My Country
* Court root
* Court case
* Court filing
* Court judgment
* Participate institutional task
* Me current roles

Viewports:

* 320px;
* standard iPhone;
* large phone;
* installed PWA;
* tablet portrait;
* desktop;
* wide desktop.

⸻

183. ACCESSIBILITY

Every surface must support:

* keyboard;
* visible focus;
* VoiceOver/screen reader;
* dynamic text;
* no color-only voting meaning;
* reduced motion;
* reduced transparency;
* large tap targets;
* accessible tables;
* accessible bottom sheets;
* focus restore;
* status announcements after consequential command.

Voting options must have explicit text.

⸻

184. ERROR CONTRACT

Use existing V3 error categories.

Examples:

* connection;
* validation;
* permission;
* state_changed;
* conflict;
* server.

Consequential error shows operation ID where useful.

Never show internal SQL/RLS details to user.

⸻

185. PRODUCTION ISOLATION

Absolute:

CI, Playwright, browser audit, visual regression, migration rehearsal, crawler, load testing and automated QA must not use production Solaris Supabase.

Local/isolated Supabase only.

No fallback.

This applies to every Terra Solaris test suite.

⸻

186. RELEASE GATES

A feature is not complete because:

* migration exists;
* component exists;
* route loads;
* typecheck passes.

Require:

1. foundation;
2. integrated;
3. product parity;
4. tested;
5. certified.

⸻

187. DOMAIN DEFINITION OF DONE

Every new domain has:

* canonical owner;
* schema;
* constraints;
* commands;
* authorization;
* state machine;
* revisioning;
* idempotency;
* events;
* consequences;
* projections;
* tasks;
* notifications;
* audit;
* reconciliation;
* metrics;
* retention;
* backup classification;
* tests.

⸻

188. SCREEN DEFINITION OF DONE

Every screen specifies:

* purpose;
* audience;
* route owner;
* canonical source;
* permissions;
* loading;
* empty;
* stale;
* offline;
* error;
* permission change;
* desktop;
* tablet;
* mobile browser;
* installed PWA;
* keyboard;
* bottom-nav obstruction;
* top safe-zone;
* screen reader;
* Reduced Motion;
* publication policy;
* deep linking;
* migration;
* regression tests;
* acceptance scenario.

⸻

189. OBSERVABILITY

Metrics include:

* command success/failure;
* vote cast latency;
* vote certification;
* task consequence failures;
* notification delivery;
* chat delivery;
* projection latency;
* authorization denials;
* Court command failures;
* reconciliation drift.

Logs include operation/correlation identity.

No ballot secrecy leak.

⸻

190. RECOVERY

Back up irreplaceable:

* organization records;
* votes/results;
* office terms;
* memberships;
* measures;
* resolutions;
* documents;
* Court judgments;
* history.

Test restore.

Archive must be reproducible after restore.

⸻

191. NO DUPLICATE TRUTHS RULE

Forbidden:

* second country-owner table for current authority;
* second Follow system;
* second Task Engine;
* separate GUARD vote engine;
* separate UNITY vote engine;
* independent Archive copy;
* Page Builder acting as structured government truth;
* chat permissions being frontend-only;
* office title being authorization;
* world history being manually duplicated from formal state.

⸻

192. LONG-TERM GRAPH

Final Terra Solaris graph:

Country
↕
Current Controller
↕
Durable Person
↕
Government
↕
Organization Membership
↕
Representation
↕
Office / Office Term
↕
Session / Agenda
↕
Measure / Version / Amendment
↕
Vote / Result
↕
Resolution / Decision
↕
Document / Version
↕
Treaty
↕
Institutional Action
↕
Court Case / Judgment
↕
Historical Event

This is the world model.

⸻

193. FINAL PRODUCT PROMISE

Public visitor

Can understand:

* countries;
* organizations;
* leadership;
* rules;
* proposals;
* resolutions;
* world history;

without understanding Solaris internals.

Country controller

Can:

* govern their country;
* maintain lore;
* participate internationally;
* vote;
* respond to Court/institutional duties;

from MySolaris and Participate.

GUARD Chairperson

Can:

* run GUARD;
* manage sessions;
* manage membership workflow;
* publish statements;
* administer proposals;
* conduct votes;
* manage private workspaces;

without receiving global Solaris Organizer power.

UNITY Secretary-General

Can:

* administer UNITY;
* manage sessions;
* mediate;
* publish;
* operate Court authority;
* execute valid decisions;

without replacing the General Assembly.

Historian

Can reconstruct:

* who held office;
* who belonged to what;
* which proposal existed;
* which version was voted on;
* how countries voted where publication permits;
* what resolution resulted;
* what rulebook was effective;
* what Court decided.

⸻

194. IMPLEMENTATION SUCCESS CRITERION

Terra Solaris Governance is complete only when:

the public pages, MySolaris, institutional workspaces, database state, permissions, historical archive, notifications, tasks, votes, Court, mobile/PWA experience and exact release evidence all describe the same coherent political world.

If any surface tells a different truth, implementation is not complete.

⸻

195. FINAL IMPLEMENTATION RULE

Do not implement the plan as a pile of pages.

Implement:

canonical state → authoritative command → domain event → consequences → projection → user experience → historical record.

That architecture is the product.

The pages are merely how humans are allowed to touch it.