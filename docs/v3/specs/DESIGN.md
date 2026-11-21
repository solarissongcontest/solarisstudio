# Solaris Studio V3 — Unified Design & Three-Experience Specification

**Status:** proposed consolidated, actively maintained design authority for V3.  
**Scope:** all user-visible Public, Fan, Participant, MySolaris/Delegation, World and Organizer layouts.  
**Source precedence:** this document consolidates the 19 November 2026 visual/UX audit and Country/Edition cinematic redesign, the three-experience manifesto, the Public design/navigation completion plan and the page-by-page directory plan. Their original full versions are preserved in `docs/v3/archive/` as **historical input, not parallel active design instructions**.

> **One visual feature, one design owner.** Do not implement the same Country hero, Edition layout, directory filter, header or page family from a competing historical guide. When a missing design requirement is discovered in the archive, reconcile it here through a reviewed change rather than reactivating the archive as a second authority.

## 1. Hard boundaries and precedence

1. Production safety, canonical data ownership, privacy, authorization, integrity, accessibility and official publication rules override all visual effects.
2. This file owns **product composition, visual grammar, page-level hierarchy, responsive presentation and visual acceptance**. `NAVIGATION.md` owns floating dock geometry, gestures and system safe zones. `SYSTEM.md` owns canonical state and mutations. `WORLD.md` owns fictional governance and official world facts. `ORGANIZER.md` owns operational behavior.
3. Public top-level destinations remain **Home · Explore · Participate · Results · Me**; Organizer remains **Overview · Tasks · Control · Live · More**. Do not invent extra root navigation to solve page-level complexity.
4. A source-backed route being implemented, integrated or cut over does **not** establish visual parity or release certification.
5. The approved direction is **Cinematic Editorial Solaris**. Preserve the recognizable dark Solaris identity and coherent light appearance without copying any external site's proprietary assets or code.
6. Working domain behavior is preserved. Replace fragmented layouts and duplicated client presentation reasoning, not correct backend rules.
7. The 19 November redesign is a **complete composition redesign** where required, not merely a header/banner pasted above the old UI.

## 2. One product, three deliberately different presentations

| Runtime family | Appearance and interaction | Explicit exclusions |
|---|---|---|
| **Installed mobile PWA** | Immersive AppShell, compact app toolbar, touch-first drill-downs/sheets, focused task flows, canonical five-tab floating Liquid Glass dock | No mobile-web masthead/footer or duplicate browser navigation |
| **Ordinary mobile browser** | Purpose-built editorial WEBSITE header, concise breadcrumbs/back/search, real links/history/deep links, restrained lists and controls | No installed PWA dock by default; a narrow viewport is not proof of app installation |
| **Desktop/laptop browser** | Expansive website shell, visible navigation/sidebar, purposeful grids and contextual panes, readable tables, strong keyboard/mouse productivity | No stretched phone composition or phone dock |

Runtime detection must use the existing app/platform contract. Layout breakpoint selects composition **within** a runtime family, not app identity. Tablet browsers remain web; installed tablets remain app. Rotation, browser chrome, keyboard and hydration must not cause shell flashes, overlapping nav or duplicate data requests.

All three presentations share the same IDs, URLs, canonical queries, business logic, permissions, real published data and server-owned rollout decisions. Share semantic models and reusable primitives; never mount three hidden pages with three fetches.

## 3. Visual grammar

**Four complementary modes**

- **Cinematic:** Country, Edition and important major event moments. One immersive, high-quality, publication-approved image/artwork and carefully placed text.
- **Editorial:** Home, Explore, Wiki/Encyclopedia, Stories, Reference, Archive and World discovery. Typography, thoughtful rhythm, readable media and meaningful related content.
- **Data-driven:** Results, records, voting, scorecharts and analytical views. Rankings, numbers, provenance and readable tables are the main content.
- **Operational:** Organizer and MySolaris. Compact, precise, predictable forms and actions; prioritize workflow clarity rather than cinematic spectacle.

**Surface hierarchy**

- Level 0: quiet canvas/ambient background. Subtle edition-derived tint permitted.
- Level 1: ordinary content, flat lists, dividers, metadata, timelines, headings, charts.
- Level 2: restrained emphasized cards only for bounded exceptions such as featured contest, live moment, winner, urgent task, receipt, player or major error.
- Level 3: control material. Liquid Glass belongs mainly to selected navigation, floating controls and transient sheets, not every ordinary article/list row.

**Typography and spacing**

- Use the established Solaris UI type family for body, controls and normal page titles; expressive display fonts only for approved cinematic/artwork moments.
- Installed directory headings: roughly 30–34 CSS px; mobile-web editorial mastheads roughly 28–32 px; desktop mastheads roughly 36–44 px when appropriate.
- Section headings approximately 19–23 px; collection row titles 15–17 px; metadata 12–14 px with sufficient contrast. These are targets to reconcile with existing design tokens, not a mandate to duplicate hard-coded values.
- Prefer the shared 4/8/12/16/24/32 px rhythm, with phone page inset generally 16–20 px. Keep reading widths comfortable; use screen width intentionally on desktop.
- Flags remain canonically **3:2**, including long names and placeholder/fallback cases.
- Use real status meanings, not decorative colors implying fabricated publication, eligibility or urgency.
- Avoid cards within cards, oversized search panels, repeated headings, long AI-like descriptions, awkward empty space, giant mobile filter stacks, unreadable numbers and decorative gradients masking content.
- User-facing language must be concise, natural, task-relevant and non-technical. Avoid internal architecture jargon in normal product screens.

## 4. Shared page and directory primitives

Use existing responsible components/hooks rather than a new parallel design framework:

- Contextual title/masthead and one short introduction at most.
- Clear search with visible label, keyboard handling, clear action, normalized query and suitable URL synchronization for web.
- Distinct scope selection (for example current edition vs all), facets, query and published result counts.
- Active selection must be distinguishable by more than color: selected shape/fill/border or mark and correct accessible state.
- Distinguish published total, filtered matches and displayed count; no ambiguous standalone "67 matching".
- Lists/grids that follow domain information: flags, chronological editions, scheduled broadcasts, editorial stories, reference articles, rulebook chapters, music catalogue and tools/actions should not all become the same rounded-card directory.
- Real empty states, no-match states, errors with retry, unpublished/locked states, disabled states, long text and missing-media states.
- Primary root pages summarize; dedicated collection pages provide complete datasets. Do not dump every entity onto Home/Explore.
- Avoid broad background fan-out, duplicate realtime subscriptions, client-only speculative published content and unnecessary fetching; respect bundle and production-egress budgets.

## 5. Global shell and interaction

- Mobile header is compact and respects the protected **Top System Safe Zone**. Safe zone is shell-owned, not per-page padding hacks.
- Keep meaningful text and controls entirely below the effective safe content boundary. Nonessential background/artwork may extend behind system chrome.
- The installed dock is shell-owned. Maintain scrolling clearance for the last item, keyboard, safe area, focus and sheet controls.
- Normal browser must not show duplicate app dock and web site navigation.
- Bottom bar geometry, selected lens, minimization, drag/swipe arbitration, reduced-motion alternatives and exact safe-zone calculations are specified **only in `NAVIGATION.md`**.
- Preserve native web back/forward/share/deep link semantics where applicable.
- Do not make drag or swipe the only way to operate a feature.
- Every interactive control gets a clear focus state and comfortable tap size (normally at least about 44 CSS px for primary touch targets).

## 6. Country detail: complete cinematic composition

Country is a full entity story, not an old compact profile with an image above it.

**Content order**
1. One immersive cinematic hero using an authorized published Country image or designed factual fallback; intentional on-image title, correct readable contrast and just one important contextual control.
2. Smooth fade bridge: roughly the last 25–40% of artwork transitions into the page background without a visible separator line or giant framed card.
3. Distinct identity strip: canonical 3:2 flag, current/official name, brief region/identity and relevant current-entry context. Do not duplicate the hero title with another huge heading.
4. Concise, high-value Overview: what this country is, what it is doing now and where a reader can explore more.
5. Contextual links/sections such as Entries, Results, History, World, Voting, Relationships and Stories as published and relevant. Preserve the complete canonical country capability set.
6. Clear historical identity: present-day country branding must not silently rewrite archived edition-specific names, flags or official records.

**Composition by runtime**
- Installed PWA: compact identity, focused sections and drill-down; preserve app navigation and server-owned rollout.
- Mobile browser: editorial masthead, 3:2 flag/identity, concise facts and browser-native section links; no giant desktop hero or PWA toolbar copied verbatim.
- Desktop: expansive image and purposeful editorial sections/sidebar where useful; avoid huge empty gutters.

**Artwork rules**
- Text gets locally appropriate scrim/contrast, not a hard gray opaque box.
- Focal point, responsive crop and text-safe regions are deliberate.
- Missing image uses a designed neutral fallback; never invent a photograph, artist or political fact.
- Long country names, native names, metadata and language variants must wrap without overflows.
- The artistic emphasis must not interfere with published entry and result information.

## 7. MySolaris Country Hero Studio

UI preview and authoritative media publication are different capabilities.

The final experience includes choose/upload, validation and processing feedback, focal point/crop and responsive previews, draft history, publish review, authoritative acknowledgement, revision history, rollback and visible recovery.

- Reuse canonical country ownership and existing media owner. Do not invent second current country owner.
- Required upload size/type limits, derivatives, versioning, concurrency/CAS, audit and rollback belong to System/Media contracts; UI must not implement these as browser authority.
- Public Country reads use only approved, published hero revisions; a private draft is never evidence of public publication.
- Different presentation previews must represent installed mobile, mobile browser and desktop.
- A preview-only source module is not feature-complete.
- Historical identity/published images remain reproducible; corrections must not silently erase audit history.
- Hosted migrations or media-storage configuration require separate approval.

## 8. Edition detail: distinct cinematic event identity

Edition is an event hub, not a copy of Country.

1. Edition-approved artwork with controlled focal point, accessible title and seamless hero transition.
2. Correct edition number/name, actual host, date, current/historical/contest lifecycle state.
3. One most relevant approved action (for example current contest, Schedule, Watch/Live or published Results), not six equal hero buttons.
4. Appropriate sections: Overview, Participants, Songs, Shows/Schedule, Stories, Results.
5. Compact content previews followed by full dedicated collections; avoid a single massive Overview.
6. Winner and ranking displays must use bounded **published** official result reads, never broad unpublished fallbacks or speculative client calculations.
7. Installed PWA keeps its canonical focused edition composition; mobile-web gets purposeful chronological browsing; desktop gets richer event context.
8. Preserve a historical edition's genuine visual identity, publication status and record provenance.
9. Index of editions uses chronology, clear current/past distinction, intelligible winner reads and no cropped long country names.

## 9. Discovery and editorial route contracts

| Surface | Canonical composition to finish |
|---|---|
| **Home** | Stable order: Context → Now → Current Contest → Coming Up → Latest. Dynamic urgency/Live emphasis without constant reordering. No permanent SSR/hydration placeholder. |
| **Explore** | One useful global search, prominent current contest and editorial discovery, then Archive/secondary categories; never just a giant settings/sitemap card list. |
| **Countries** | Clear All/current-edition scope, accessible selected state, compact filters, canonical 3:2 flag grid, short intro and useful count. |
| **Editions** | Chronological collection, readable historical winners and a restrained current-edition feature. |
| **Shows / Live** | Live/current, next, recently completed, full schedule; relevant official show and voting states only. |
| **Songs / Artists / Music** | Coherent catalogues, real media/identity metadata, featured discovery and dedicated entities rather than generic tools-page composition. |
| **Stories** | Editorial cover, short text hierarchy, date/edition, readable article composition and related content. |
| **Archive** | Deliberate historical discovery by time/edition and entity, not an unfiltered backend directory. |
| **Wiki / Encyclopedia / Reference** | One discoverable reference product with durable article identity, headings/anchors, related topics, safe publication and usable category/search flows. |
| **Rules / chapters** | Readable official text hierarchy, table of contents, anchor navigation, genuine current and historical version identity. |
| **Tools / site directory** | Useful actions, concise categorization, no redundant "Browse" + "Follow the contest" heading stack or generic settings rows. |
| **World directory / bodies** | Publication-safe editorial entities, readable long institutional descriptions/office definitions and consistent private/public boundaries. |
| **Results / Records** | Authentic published snapshots, readable scorecharts and comparisons, safe spoiler handling and strong numeric hierarchy, never decorations hiding data. |
| **Participate** | Actions and deadlines before menus, distinguish required/optional/urgent, coherent tasks, drafts, receipts and recovery. |
| **Me / Delegation** | Clear identity, membership, activity, history, receipts, following/saved items, device/session settings; compact forms, no duplicated Task Center. |
| **Organizer** | Calm operational hierarchy, explicit edition/show context, optimized filters, keyboard and mobile utility; retain specialist capability parity. |

This table is the **single layout owner per route family**. Domain behavior continues to live in its own spec.

## 10. States, accessibility and performance

Every major screen and workflow must intentionally handle:
- Loaded/populated; initial loading; warm refresh; empty; no search matches; disabled/hidden; unauthorized; deadline expired; pending; retry; uncertain operation; offline; stale; error; long content; missing artwork; unpublished/hidden result.
- Keyboard focus and order; visible 2px-class focus indications where appropriate; semantic headings and labels; screen reader meaning; high contrast/forced colors; reduced motion and transparency; no drag-only affordances.
- Responsive layout matrix including 320, 390, 430, tablet widths and 1440 CSS px. Verify browser and installed app independently and at least one long-name stress case.
- Real inspected component/full-route screenshots, not just source string assertions. Synthetic fixtures must be labelled synthetic.
- Full iOS/standalone behavior requires device evidence; simulated WebKit is not proof of physical iPhone behavior.
- Respect the fixed compressed client bundle budget of **1,843,200 bytes** without raising it. Use lazy loading, safe chunking and bounded publication queries.
- Preserve Core Web Vitals performance goals from the Public specification and local-only Supabase test isolation.

## 11. Definition of design-done

A route is visually complete only when:
1. Canonical content and permissions are correct.
2. Runtime-specific composition is intentional in PWA, mobile web and desktop.
3. Hierarchy, typography, spacing, interactive states and meaningful controls are product-ready.
4. Loading/error/empty/retry and long-content cases are designed.
5. Responsive screenshots and keyboard accessibility are inspected on the actual candidate.
6. Any real physical-device acceptance requirement is met or explicitly remains open.
7. Tests and final exact-head evidence are passing; broader rollout and release approvals are separate.

**Never label a route V3-complete just because a new font, gradient, hero, header, rounded card or bottom bar exists.**

## 12. Legacy source disposition

This active file replaces the design-authority portions of the following archived user specifications:
- 19 November Visual & UX Redesign Masterplan.
- 19 November Country & Edition Cinematic Editorial specification.
- Three-Experience Design Manifesto.
- Updated Public Product, Design & Navigation Completion Master Plan.
- Full Specific V3 Page Design Plan.

These historical files are retained in `docs/v3/archive/` to preserve full detail and provenance. **They must not be implemented as independent competing design guides.** Where a historically specified required capability is missing from this consolidated file, open a scoped reconciliation and amend this one source, respecting canonical System/Public/Organizer/World authorities. Earlier plans are not permission to reintroduce superseded visual compositions.
