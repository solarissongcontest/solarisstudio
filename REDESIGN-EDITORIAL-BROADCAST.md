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

The redesign should converge on shared primitives for page and section headers, metric cards, entity rows/cards, media cards, status pills, segmented controls, responsive data tables, mobile data cards, filter sheets, sticky action bars, empty/error/loading states and responsive dialog-to-sheet behavior.

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

Discovery hubs should give entities hierarchy rather than rendering every record as an identical card:

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

Admin pages should prioritize state and required action. Broken syncs, incomplete mappings, runtime failures, pending work and integrity warnings appear before decorative metrics.

Dense tables remain tables where screen width permits. On phones they become purpose-built cards or focused rows with the important state and actions visible without lateral scrolling.

## Responsive standards

Every major public and admin screen should be checked at approximately:

- 360px
- 390/393px
- 430px
- 768px
- 1024px and wider
- mobile landscape

Mobile filters and sorting should collapse into compact controls or bottom sheets when inline controls become crowded. Modals should become full-height or near-full-height sheets where that improves usability.

Keyboard focus, screen-reader labels, reduced-motion behavior, semantic heading order and WCAG-safe contrast are part of the visual system rather than a final QA decoration.

## Visual balance

Target balance:

- 70% editorial/data interface
- 20% atmospheric imagery
- 10% glass

The public product should feel like a modern music broadcaster, editorial publication and statistics platform in one system. Admin should be visibly related but calmer and denser, with neutral surfaces and semantic state color taking priority over decoration.

## Implementation sequence

1. Foundation: tokens, type scale, surface hierarchy and responsive primitives.
2. Global shells: public navigation/mobile bottom nav and admin sidebar/mobile drawer.
3. Public discovery: Home, Editions, Countries and Shows.
4. Public detail: edition, country and show pages.
5. Public intelligence: Analysis, Pulse, Relationships, Records and Predictions.
6. Admin foundation: Operations, responsive tables, filters and action bars.
7. Specialist admin: Contest Data, Confirmations, Televoting, Integrity, HOD History, Analytics and Sync Health.
8. QA and polish: responsive extremes, accessibility, loading/error states, performance and animation.

Foundation and shells must precede isolated page redesigns so shared patterns do not fragment into near-duplicate components.
