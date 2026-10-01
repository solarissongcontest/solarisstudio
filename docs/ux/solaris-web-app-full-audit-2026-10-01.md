# Solaris Studio Web App — Full Visual & UX Audit

Audit date: 2026-10-01  
Repository: `solarissongcontest/solarisstudio`  
Audited main commit: `399b657507370d18201ad2892433077cb0f847da`  
Route files inventoried: **215**

## Method

This audit covers every React route file under `src/routes` on the audited commit. It combines:

- complete route inventory;
- source-level layout-risk scanning across all routes;
- deeper manual source inspection of representative and high-risk public, participation, MySolaris and Organizer screens;
- Figma-assisted audit setup for whole-product visual comparison.

A Figma audit file was created and used as the visual workbench. Further Figma writes were blocked by the linked Starter-plan MCP rate limit during the audit, so this document is the complete authoritative route checklist until the Figma board can be synced again.

Static flags are **review signals, not automatic defects**. For example, horizontal overflow can be correct for a deliberately scrollable data table. The purpose of the flag is to force a real mobile/layout decision rather than let desktop assumptions pass unnoticed.

## Executive assessment

Solaris does not currently have one consistent visual generation. The codebase contains roughly five design eras:

1. newer app-shell / public hub screens;
2. Solaris Depth / Governance OS screens;
3. family-card public archive screens;
4. dense analytical tools with card-heavy dashboards and desktop tables;
5. older Organizer/admin workspaces built around horizontally scrollable operational tables.

The strongest screens are generally the newer public hub, Rules/Integrity v5.1, and the simpler archive directories. The weakest systemic areas are:

- **desktop-first data tables** in Organizer and advanced analytics;
- **card/surface over-density** in MySolaris, Pulse, Taste DNA and some complex tools;
- **typography drift**, especially 5xl–6xl editorial headings inside otherwise functional app surfaces;
- **local one-off page shells** that bypass the shared page rhythm;
- **mixed visual eras** within a single entity experience, especially country/profile and admin pages;
- **mobile fallback by horizontal scrolling** instead of true responsive information restructuring;
- **sticky/fixed chrome risk** on operational pages with many controls;
- **duplicated section/card primitives** rather than a smaller set of semantic layout patterns.

## Whole-product redesign rules

### 1. One layout grammar

Every normal web page should use one of a small number of page archetypes:

- Hub
- Directory
- Entity detail
- Data explorer
- Focused task
- Admin workspace
- Reading / governance
- Broadcast / show mode

Each archetype needs canonical max-width, header rhythm, section spacing, mobile collapse behavior and sticky-control policy.

### 2. Card containers must have semantic purpose

Use cards for conceptual grouping or actionable objects, not merely because content exists. Lists inside a shared surface should use rows and separators.

### 3. Desktop tables need mobile transformations

For operational tables, mobile should become one of:
- stacked records,
- priority columns + drill-in,
- responsive definition rows,
- horizontal scroll only when the table itself is the product and every column is genuinely required.

### 4. Typography needs role-based scale

Functional app pages should not casually jump to 5xl–6xl display type. Reserve editorial display scale for stories, show moments and major public narrative surfaces.

### 5. Shared chrome must own sticky/fixed behavior

Pages should not invent local bottom bars, top sticky stacks or overlapping controls without app-shell coordination.

### 6. Advanced tools need progressive disclosure

Tools such as Pulse, Result Lab, Broadcast Intelligence, Taste DNA and Voting DNA should show the first useful answer before exposing the full analytics workbench.

### 7. MySolaris needs decomposition

The 1,351-line MySolaris index currently carries too many visual responsibilities in one route. It should become a state-aware dashboard composed from smaller canonical modules and fewer simultaneous surfaces.

### 8. Organizer needs an operations design system

Admin screens require a dedicated compact system for:
- filters,
- status chips,
- record rows,
- responsive tables,
- sticky action areas,
- inspector/detail panes,
- destructive actions,
- audit metadata.

The current Organizer family contains too many one-off table and grid implementations.

## Family findings

### Navigation / core

**Current strengths**
- Newer public hub components are relatively restrained and responsive.
- Home already uses responsive breakpoints and meaningful grouping.

**Problems**
- Home still mixes several visual grammars: large display heading, glass blocks, family cards and data panels.
- It repeats strong hero-scale typography more than necessary.
- Some destination sections feel like mini dashboards rather than one coherent homepage.

**Direction**
Make Home the canonical public state-aware hub and derive Explore/Participate/Results entry surfaces from the same rhythm.

### Core content

**Countries**
- Directory responsiveness is good.
- Country detail is extremely large and mixes multiple country-design systems in one route.
- Country profile should become a canonical entity shell with plug-in sections instead of accumulating styling generations.

**Editions**
- Directory is visually strong but still card-heavy.
- Edition detail has a good underlying hierarchy and should become the canonical entity-detail reference.

**Shows / Results**
- Generally structurally solid.
- Results is comparatively restrained.
- Show detail is complex and should ensure advanced voting modules stay below the core result/status answer.

**Stories**
- Editorial 6xl typography is defensible here, but Stories currently looks like a separate site family. It needs the same global navigation/content-width rhythm while retaining its editorial personality.

### Explore / data

**Strong**
- Analysis, Records and Relationships have decent responsive structures.
- Scorecharts is comparatively simple.

**Needs redesign**
- Voting DNA detail uses forced-width tables.
- Result Lab and Broadcast Intelligence hide/scroll wide table structures and need purpose-built mobile data views.
- Pulse is extremely surface-heavy and visually noisy.
- Taste DNA is also card-dense and should reduce simultaneous panels.
- Advanced tools need a clear answer-first layer before the full controls/data.

### Participation

**Strong**
- Confirmations and Televoting have strong responsive foundations.
- Governance OS contextual rules are now integrated into important tasks.

**Needs attention**
- Jury Voting remains card/surface dense.
- Prediction League still uses a forced-width horizontally scrolling table.
- Participate itself is a large route and should remain a task hub, not become another dashboard.
- Any fixed help/task controls must coordinate with App Mode safe areas.

### MySolaris

This is one of the highest-priority design systems to simplify.

The current index route is 1,351 lines and contains dozens of rounded/surface treatments. It is responsive, but responsiveness alone does not prevent density overload.

**Direction**
- one primary status/action area;
- “needs attention” before informational modules;
- fewer simultaneous cards;
- module-level hierarchy;
- clear separation between account, country, entry, tasks and history;
- no duplicated mini-dashboard patterns.

### Organizer / admin

This is the largest systemic UX debt area.

Repeated source flags show desktop tables with forced widths such as 680px, 760px, 780px, 820px and 980px across:
- Countries
- Eligibility
- Jury Integrity
- Results Reveal
- Voting Lab
- Hosts
- Broadcast Rundown
- Televote analytics/backtest/combined views

Horizontal scrolling is acceptable for some power-user tables, but it should not be the default mobile strategy.

**Direction**
Create one Organizer responsive-record system:
- desktop: dense table / split inspector;
- tablet: reduced columns + detail drawer;
- mobile: record cards/rows with primary status and drill-in;
- persistent actions handled by one shell-level sticky action region.

### Rules / Integrity / Help

The recent Solaris Depth pass has materially improved this family:
- stars are preserved but moved out of reading areas;
- content gets protected surfaces;
- service-state warnings are inline rather than floating;
- Integrity reporting owns a focused task workspace;
- Rules and Integrity now have correct app-tab ownership.

Remaining work is mostly consistency with the rest of Solaris rather than a structural redesign.

## Static-risk legend

- **P0 mobile** — forced minimum width + horizontal overflow; requires deliberate mobile redesign.
- **P0 collision** — fixed-bottom chrome; verify against app tab bars, keyboards and safe areas.
- **P1** — horizontal-scroll or extreme display-type signal; inspect closely.
- **P2** — sticky chrome / large display type / unusually large card radius.
- **baseline** — no static risk pattern from this scan. This does **not** mean visually perfect.

## Route-by-route inventory


### Account / auth

| Route | Priority | Static signals |
|---|---|---|
| `auth/index.tsx` | baseline | none from this scan |
| `auth/reset.tsx` | baseline | none from this scan |
| `me/index.tsx` | baseline | none from this scan |
| `settings.tsx` | baseline | none from this scan |

### Core content

| Route | Priority | Static signals |
|---|---|---|
| `countries/$code.tsx` | baseline | none from this scan |
| `countries/index.tsx` | baseline | none from this scan |
| `editions/$slug.tsx` | baseline | none from this scan |
| `editions/index.tsx` | baseline | none from this scan |
| `results/$slug.tsx` | baseline | none from this scan |
| `results/index.tsx` | baseline | none from this scan |
| `shows/$showId.tsx` | baseline | none from this scan |
| `shows/index.tsx` | P2 | oversized 5xl heading |
| `stories/$editionSlug.tsx` | P1 | oversized 6xl heading |
| `stories/index.tsx` | P1 | oversized 6xl heading |
| `wiki/$code.tsx` | baseline | none from this scan |
| `wiki/index.tsx` | P1 | horizontal overflow |

### Country Hub

| Route | Priority | Static signals |
|---|---|---|
| `_authenticated/country-hub/hod.tsx` | baseline | none from this scan |
| `_authenticated/country-hub/index.tsx` | baseline | none from this scan |
| `_authenticated/country-hub/notices.tsx` | baseline | none from this scan |
| `_authenticated/country-hub/page-builder.tsx` | baseline | none from this scan |
| `_authenticated/country-hub/readiness.tsx` | baseline | none from this scan |
| `_authenticated/country-hub/theme.tsx` | baseline | none from this scan |

### Dev / beta / legacy

| Route | Priority | Static signals |
|---|---|---|
| `_authenticated/admin/admin-beta-feedback.tsx` | baseline | none from this scan |
| `_authenticated/admin/anniversary-dates.tsx` | baseline | none from this scan |
| `_authenticated/admin/anniversary.tsx` | baseline | none from this scan |
| `_authenticated/admin/beta-feedback.tsx` | baseline | none from this scan |
| `_authenticated/admin/beta-test.tsx` | P2 | oversized 5xl heading, sticky top chrome |
| `_authenticated/admin/beta1-feedback.tsx` | baseline | none from this scan |
| `_authenticated/admin/beta2-feedback.tsx` | baseline | none from this scan |
| `_authenticated/admin/beta3-feedback.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `anniversary/index.tsx` | baseline | none from this scan |
| `beta-test/index.tsx` | P2 | oversized 5xl heading, sticky top chrome |

### Explore / data

| Route | Priority | Static signals |
|---|---|---|
| `analysis/index.tsx` | baseline | none from this scan |
| `archive-games/index.tsx` | baseline | none from this scan |
| `broadcast-intelligence/index.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `broadcast-intelligence/jury.tsx` | baseline | none from this scan |
| `compare/index.tsx` | baseline | none from this scan |
| `encyclopedia/index.tsx` | baseline | none from this scan |
| `fantasy/index.tsx` | baseline | none from this scan |
| `library.tsx` | baseline | none from this scan |
| `pulse/index.tsx` | P1 | horizontal overflow, extra-large card radius |
| `records/index.tsx` | baseline | none from this scan |
| `relationships/$pair.tsx` | baseline | none from this scan |
| `relationships/index.tsx` | baseline | none from this scan |
| `result-lab/index.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `scorecharts/index.tsx` | baseline | none from this scan |
| `taste-dna/index.tsx` | baseline | none from this scan |
| `voting-dna/$code.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `voting-dna/index.tsx` | baseline | none from this scan |

### MySolaris

| Route | Priority | Static signals |
|---|---|---|
| `_authenticated/my-solaris/account.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/activity.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/country.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/entry.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/history.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/index.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/notices.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/page-builder.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/predictions.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/saved.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/tasks.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/theme.tsx` | baseline | none from this scan |
| `_authenticated/my-solaris/voting.tsx` | baseline | none from this scan |

### Navigation / core

| Route | Priority | Static signals |
|---|---|---|
| `app-launch.tsx` | baseline | none from this scan |
| `explore/index.tsx` | baseline | none from this scan |
| `index.tsx` | P2 | oversized 5xl heading |
| `show-mode/index.tsx` | baseline | none from this scan |
| `site-directory/index.tsx` | baseline | none from this scan |
| `tools/index.tsx` | baseline | none from this scan |

### Organizer / admin

| Route | Priority | Static signals |
|---|---|---|
| `_authenticated/admin/$.tsx` | baseline | none from this scan |
| `_authenticated/admin/$slug.tsx` | baseline | none from this scan |
| `_authenticated/admin/access-permissions.tsx` | P1 | horizontal overflow, sticky top chrome |
| `_authenticated/admin/action-center.tsx` | baseline | none from this scan |
| `_authenticated/admin/action-centre.tsx` | baseline | none from this scan |
| `_authenticated/admin/broadcast-rundown.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `_authenticated/admin/command-assistant.tsx` | baseline | none from this scan |
| `_authenticated/admin/communications.tsx` | baseline | none from this scan |
| `_authenticated/admin/control-room-v2.tsx` | baseline | none from this scan |
| `_authenticated/admin/control-room.tsx` | baseline | none from this scan |
| `_authenticated/admin/countries.$countryId.tsx` | P1 | horizontal overflow |
| `_authenticated/admin/countries.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `_authenticated/admin/country-accounts.tsx` | baseline | none from this scan |
| `_authenticated/admin/design.$slug.tsx` | P1 | horizontal overflow |
| `_authenticated/admin/edition-simulator.tsx` | baseline | none from this scan |
| `_authenticated/admin/edition-theme.$slug.tsx` | baseline | none from this scan |
| `_authenticated/admin/editions.tsx` | P1 | horizontal overflow |
| `_authenticated/admin/eligibility.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `_authenticated/admin/entries/$slug.tsx` | baseline | none from this scan |
| `_authenticated/admin/fantasy.tsx` | baseline | none from this scan |
| `_authenticated/admin/feature-rollout.tsx` | P1 | horizontal overflow, sticky top chrome |
| `_authenticated/admin/flag-audit.tsx` | baseline | none from this scan |
| `_authenticated/admin/friend-voting.tsx` | P1 | horizontal overflow |
| `_authenticated/admin/guide.tsx` | baseline | none from this scan |
| `_authenticated/admin/hod-history.tsx` | baseline | none from this scan |
| `_authenticated/admin/hosts.tsx` | P0 mobile | horizontal overflow, forced minimum width, sticky top chrome |
| `_authenticated/admin/inbox.tsx` | baseline | none from this scan |
| `_authenticated/admin/incidents.tsx` | baseline | none from this scan |
| `_authenticated/admin/index.tsx` | baseline | none from this scan |
| `_authenticated/admin/integrity-appeals.tsx` | baseline | forced minimum width |
| `_authenticated/admin/integrity-case.$caseId.tsx` | baseline | none from this scan |
| `_authenticated/admin/integrity-disclosure.tsx` | baseline | none from this scan |
| `_authenticated/admin/integrity-evidence.tsx` | baseline | none from this scan |
| `_authenticated/admin/integrity-identity.tsx` | baseline | none from this scan |
| `_authenticated/admin/integrity-investigations.tsx` | baseline | forced minimum width |
| `_authenticated/admin/integrity-preclearance.tsx` | baseline | none from this scan |
| `_authenticated/admin/integrity-resolution.$caseId.tsx` | baseline | none from this scan |
| `_authenticated/admin/integrity.tsx` | baseline | none from this scan |
| `_authenticated/admin/jury-integrity.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `_authenticated/admin/jury/$slug.tsx` | baseline | none from this scan |
| `_authenticated/admin/lineup-sync/$slug.tsx` | baseline | none from this scan |
| `_authenticated/admin/media-assets.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `_authenticated/admin/menu.tsx` | baseline | none from this scan |
| `_authenticated/admin/more.tsx` | baseline | none from this scan |
| `_authenticated/admin/operations.tsx` | baseline | none from this scan |
| `_authenticated/admin/participant-status/$slug.tsx` | baseline | none from this scan |
| `_authenticated/admin/predictions.tsx` | P2 | sticky top chrome |
| `_authenticated/admin/public-ux.tsx` | baseline | none from this scan |
| `_authenticated/admin/publication/$slug.tsx` | baseline | none from this scan |
| `_authenticated/admin/results-reveal.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `_authenticated/admin/results.tsx` | baseline | none from this scan |
| `_authenticated/admin/route.tsx` | baseline | none from this scan |
| `_authenticated/admin/rule-interpretations.tsx` | baseline | none from this scan |
| `_authenticated/admin/rules-manager.tsx` | baseline | none from this scan |
| `_authenticated/admin/shows/$slug.tsx` | baseline | none from this scan |
| `_authenticated/admin/status.tsx` | baseline | none from this scan |
| `_authenticated/admin/storytelling.tsx` | baseline | none from this scan |
| `_authenticated/admin/submission-versions.tsx` | P2 | sticky top chrome |
| `_authenticated/admin/sync-health.tsx` | baseline | none from this scan |
| `_authenticated/admin/system.tsx` | baseline | none from this scan |
| `_authenticated/admin/televote/$slug.tsx` | baseline | none from this scan |
| `_authenticated/admin/time-machine.tsx` | baseline | none from this scan |
| `_authenticated/admin/voting-lab.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `_authenticated/admin/voting-system/$slug.tsx` | baseline | none from this scan |
| `_authenticated/admin/workflows.tsx` | baseline | none from this scan |
| `confirmations/admin/calendar.tsx` | baseline | none from this scan |
| `confirmations/admin/countries.tsx` | baseline | none from this scan |
| `confirmations/admin/editions.tsx` | baseline | none from this scan |
| `confirmations/admin/index.tsx` | baseline | forced minimum width |
| `confirmations/admin/recovery-codes.tsx` | baseline | none from this scan |
| `confirmations/admin/responses.tsx` | baseline | none from this scan |
| `confirmations/admin/responses/$id.tsx` | P2 | sticky top chrome |
| `confirmations/admin/rounds.tsx` | baseline | none from this scan |
| `confirmations/admin/settings.tsx` | baseline | none from this scan |
| `confirmations/admin/sign-in.tsx` | baseline | none from this scan |
| `confirmations/admin/sync.tsx` | baseline | none from this scan |
| `televoting/admin/accounts.tsx` | baseline | none from this scan |
| `televoting/admin/analytics.tsx` | P1 | horizontal overflow, oversized 5xl heading, oversized 6xl heading |
| `televoting/admin/anti-abuse.tsx` | baseline | none from this scan |
| `televoting/admin/audit-log.tsx` | baseline | none from this scan |
| `televoting/admin/backtest.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `televoting/admin/combined.tsx` | P0 mobile | horizontal overflow, forced minimum width, oversized 5xl heading, sticky top chrome |
| `televoting/admin/detection.tsx` | baseline | none from this scan |
| `televoting/admin/editions.tsx` | baseline | none from this scan |
| `televoting/admin/friend-voting.tsx` | baseline | none from this scan |
| `televoting/admin/index.tsx` | baseline | forced minimum width |
| `televoting/admin/integrity-declarations.tsx` | baseline | none from this scan |
| `televoting/admin/integrity.tsx` | baseline | none from this scan |
| `televoting/admin/intelligence.tsx` | baseline | none from this scan |
| `televoting/admin/result-integrity.tsx` | baseline | none from this scan |
| `televoting/admin/results.tsx` | baseline | none from this scan |
| `televoting/admin/rounds.tsx` | baseline | none from this scan |
| `televoting/admin/rounds/$id/entries.tsx` | P1 | oversized 5xl heading, oversized 6xl heading |
| `televoting/admin/sign-in.tsx` | baseline | none from this scan |
| `televoting/admin/televote.tsx` | baseline | none from this scan |

### Other

| Route | Priority | Static signals |
|---|---|---|
| `__root.tsx` | P0 collision | fixed bottom chrome |
| `_authenticated/route.tsx` | baseline | none from this scan |
| `broadcast/$showId.tsx` | P0 collision | oversized 5xl heading, fixed bottom chrome |
| `dev/design-v2-lab.tsx` | P1 | horizontal overflow |
| `dev/edition-designs.tsx` | P1 | horizontal overflow |
| `dev/flag-media.tsx` | baseline | none from this scan |
| `dev/personality-gallery.tsx` | P1 | horizontal overflow |
| `dev/personality-lab.tsx` | P1 | horizontal overflow |

### Participation

| Route | Priority | Static signals |
|---|---|---|
| `confirmations/edit/$token.tsx` | P1 | oversized 5xl heading, oversized 6xl heading |
| `confirmations/index.tsx` | baseline | none from this scan |
| `confirmations/next-in-line.tsx` | baseline | none from this scan |
| `confirmations/recover.tsx` | baseline | none from this scan |
| `jury-voting.tsx` | baseline | none from this scan |
| `next-in-line.tsx` | baseline | none from this scan |
| `participate/index.tsx` | baseline | none from this scan |
| `prediction-league/index.tsx` | P0 mobile | horizontal overflow, forced minimum width |
| `predictions/$showId.tsx` | baseline | none from this scan |
| `predictions/index.tsx` | baseline | none from this scan |
| `predictions/share/$token.tsx` | baseline | none from this scan |
| `televoting/how-to-vote.tsx` | baseline | none from this scan |
| `televoting/index.tsx` | baseline | none from this scan |
| `televoting/results.tsx` | baseline | none from this scan |

### Rules / Integrity / Help

| Route | Priority | Static signals |
|---|---|---|
| `guide/index.tsx` | baseline | none from this scan |
| `integrity/anonymous-appeal.tsx` | baseline | none from this scan |
| `integrity/appeal.$caseId.tsx` | baseline | none from this scan |
| `integrity/appeals.tsx` | baseline | none from this scan |
| `integrity/cases/$caseId.tsx` | baseline | none from this scan |
| `integrity/cases/index.tsx` | baseline | none from this scan |
| `integrity/decisions.tsx` | baseline | none from this scan |
| `integrity/index.tsx` | baseline | none from this scan |
| `integrity/preclearance.tsx` | baseline | none from this scan |
| `integrity/privacy.tsx` | baseline | none from this scan |
| `integrity/process.tsx` | baseline | none from this scan |
| `integrity/recover.tsx` | baseline | none from this scan |
| `integrity/report/category.tsx` | baseline | none from this scan |
| `integrity/report/details.tsx` | baseline | none from this scan |
| `integrity/report/index.tsx` | baseline | none from this scan |
| `integrity/report/privacy.tsx` | baseline | none from this scan |
| `integrity/report/receipt.tsx` | baseline | none from this scan |
| `integrity/report/review.tsx` | baseline | none from this scan |
| `integrity/report/support.tsx` | baseline | none from this scan |
| `rules/$ruleId.tsx` | baseline | none from this scan |
| `rules/answers.tsx` | baseline | none from this scan |
| `rules/applied.tsx` | baseline | none from this scan |
| `rules/changes.tsx` | baseline | none from this scan |
| `rules/chapters/$chapter.tsx` | baseline | none from this scan |
| `rules/chapters/index.tsx` | baseline | none from this scan |
| `rules/check.tsx` | baseline | none from this scan |
| `rules/index.tsx` | baseline | none from this scan |
| `rules/interpretations.tsx` | baseline | none from this scan |
| `rules/participating.tsx` | baseline | none from this scan |
| `rules/search.tsx` | baseline | none from this scan |

## Immediate priority queue

### P0: redesign mobile data presentation
- `prediction-league/index.tsx`
- `voting-dna/$code.tsx`
- `result-lab/index.tsx`
- `broadcast-intelligence/index.tsx`
- Organizer Countries, Eligibility, Jury Integrity, Results Reveal, Voting Lab, Hosts and Broadcast Rundown
- Televote admin Backtest / Combined and similar forced-width operational tables

### P1: reduce visual density
- MySolaris home
- Pulse
- Taste DNA
- Jury Voting
- Televote Analytics
- Country detail

### P1: typography / shell consistency
- Stories index/detail
- Home
- Televote Analytics
- any beta/legacy page still exposed to real users

## Completion criteria for the redesign program

A page family is not considered finished until:
- 320px width has no accidental horizontal page scroll;
- 200% text zoom does not obscure controls;
- mobile does not merely shrink desktop tables;
- bottom app chrome never covers the final interactive row;
- sticky top regions do not stack into unusable layers;
- page title/section hierarchy follows the archetype;
- the number of simultaneously visible surfaces is intentionally limited;
- empty/loading/error/offline states use the same family grammar;
- keyboard and screen-reader focus order matches visual hierarchy;
- tablet layouts are designed, not just stretched phone layouts;
- visual identity remains Solaris without every region becoming glass/card decoration.

## Figma follow-up

The Figma audit file is named **“Solaris Studio Web App — Full Visual Audit”**. Once the linked plan’s MCP quota becomes available again, sync this route matrix into Figma and add side-by-side archetype redesign boards for:
1. Home / Explore / Participate;
2. Country / Edition / Show entity pages;
3. Advanced data tools;
4. MySolaris;
5. Organizer operational tables;
6. Rules / Trust & Integrity.
