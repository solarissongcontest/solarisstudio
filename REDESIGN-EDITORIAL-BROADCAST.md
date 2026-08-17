# Solaris Studio Editorial Broadcast Redesign

This branch shifts Solaris Studio from a glass-first interface into a broadcast newsroom + data platform system built equally for desktop and mobile.

## Core rules

- Editorial/data UI is the default.
- Atmospheric imagery remains, but is darker and integrated into meaningful hero moments.
- Liquid glass is reserved for navigation, overlays and a small number of premium interactive surfaces.
- Default content panels use denser solid surfaces, clearer borders and a smaller radius system.
- Page headers use stronger display typography and editorial divider treatment.
- Mobile is a first-class layout, not a compressed desktop layout.
- Primary actions remain at least 44px tall on touch screens.
- Pages must not require horizontal viewport scrolling at 360px.
- Desktop tables may become cards, expandable rows or focused summaries on small screens.

## Shared primitives

`Panel` supports four variants:

- `data` (default): dense analytics/data surface
- `editorial`: open content section with divider
- `glass`: selective liquid-glass treatment
- `plain`: container-free layout

`PageHeader` provides the newsroom hierarchy used across public and analytics pages.

`StatTile` is number-led and designed to work in compact statistical strips.

The redesign converges on shared patterns for page and section headers, metric cards, entity rows/cards, media cards, status pills, segmented controls, responsive data tables, mobile data cards, filters, action bars, empty/error/loading states and responsive dialog-to-sheet behavior.

## Public information architecture

Primary public navigation is:

**Home / Explore / Insights / Predict / Me**

Explore contains:

- Editions
- Countries
- Shows
- Wiki

Insights contains:

- Analysis
- Pulse
- Relationships
- Records
- Solaris Labs / advanced tools

On mobile the same five primary destinations are exposed through the bottom navigation. Secondary destinations stay inside contextual menus rather than becoming a horizontally scrolling miniature desktop nav.

## Public discovery

The public homepage is an editorial newsroom rather than a dashboard grid. It prioritizes the latest meaningful contest story, current edition context, result narratives, scoreboard state and selected interactive desks.

Discovery hubs give entities hierarchy rather than rendering every record as an identical card:

- Editions lead with the newest public edition and then move into the archive.
- Shows lead with the latest edition's broadcasts and then expose earlier shows.
- Countries surface archive leaders before the searchable delegation directory.

## Admin information architecture

Admin navigation is organized around organizer workflows rather than implementation history:

- Operations
- Contest Data
- Confirmations
- Voting
- Integrity
- System

Desktop uses a persistent/collapsible operational sidebar. Mobile uses a drawer and contextual actions rather than attempting to place the entire admin suite in a bottom navigation bar.

Admin pages prioritize state and required action. Broken syncs, incomplete mappings, runtime failures, pending work and integrity warnings appear before decorative metrics.

Specialist Confirmations and Televoting admin routes are authenticated by the unified service gate and rendered inside the same Solaris Operations shell as the core organizer routes.

Dense tables remain tables where screen width permits. On phones they use contained scrolling, focused rows or purpose-built cards where the page provides them, without leaking horizontal overflow to the viewport.

## Responsive standards

Every major public and admin screen is designed around these checkpoints:

- 360px
- 390/393px
- 430px
- 768px
- 1024px and wider
- mobile landscape

Mobile controls collapse or wrap instead of depending on a miniature desktop layout. Modals are constrained to the viewport and become sheet-like on small screens.

Keyboard focus, screen-reader labels, reduced-motion behavior, reduced-transparency fallbacks, semantic heading order and contrast are part of the shared system.

## Visual balance

Target balance:

- 70% editorial/data interface
- 20% atmospheric imagery
- 10% glass

The public product combines a modern music broadcaster, editorial publication and statistics platform. Admin is visibly related but calmer and denser, with neutral surfaces and semantic state color taking priority over decoration.

## Implementation sequence

1. Foundation: tokens, type scale, surface hierarchy and responsive primitives.
2. Global shells: public navigation/mobile bottom nav and admin sidebar/mobile drawer.
3. Public discovery: Home, Editions, Countries and Shows.
4. Public detail: edition, country and show pages.
5. Public intelligence: Analysis, Pulse, Relationships, Records and Predictions.
6. Admin foundation: Operations, responsive tables, filters and action bars.
7. Specialist admin: Contest Data, Confirmations, Televoting, Integrity, HOD History, Analytics and Sync Health.
8. QA and polish: responsive extremes, accessibility, loading/error states, performance and animation.

## Implementation status

**Stages 1–8 are complete on `merge/confirmations`.**

The finishing pass also:

- added the missing `/shows` discovery hub that the Explore navigation already referenced;
- rebuilt Countries around archive leaders, search and compact delegation cards;
- moved ordinary content cards away from liquid glass into denser editorial/data surfaces;
- retained premium glass for navigation and selected hero/overlay surfaces;
- added viewport containment for wide data, mobile dialog constraints and safe-area handling;
- added shared focus-visible, reduced-motion and reduced-transparency behavior;
- preserved the unified Solaris Operations shell for core, Confirmations and Televoting admin routes.

The repository Quality workflow remains the blocking verification gate for production build, generated routes, TypeScript, unit tests and lint.
