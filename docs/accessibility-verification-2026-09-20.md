# Accessibility verification — 20 September 2026

Target: WCAG 2.2 AA.

## 24 September outage note

Global maintenance mode is currently active because the production database service is restricted. The maintenance page itself is covered by the responsive Browser Audit on mobile and desktop. Manual verification of the underlying signed-out, signed-in, MySolaris and Organizer surfaces must be repeated after normal database service is restored and before maintenance mode is disabled.

The restoration sequence is tracked in:

- `docs/post-outage-restoration-checklist-2026-09-24.md`

## Automated contract

Quality and Browser Audit remain release gates. New products use semantic headings, labelled controls, normal buttons/links, table headers and non-colour status copy.

## Manual representative matrix

Before public rollout, verify the following at minimum:

- keyboard-only global and section navigation;
- mobile drawer open/close, focus and Escape;
- command palette focus return;
- Encyclopedia search/filter;
- Voting DNA country index and data table;
- Prediction League edition selector and leaderboard;
- Fantasy roster selection **without drag-and-drop**, captain selector and save state;
- Time Machine timestamp control and evidence timeline;
- Command Assistant text input and result navigation;
- 200% browser zoom;
- 320 px viewport reflow;
- large default browser text;
- reduced-motion preference;
- loading, empty, unavailable and error states;
- status meaning remains understandable without colour.

## Implementation notes

Fantasy selection is checkbox-based. Drag-and-drop is not required for any roster action.

Charts are not the sole carrier of Voting DNA information; the product presents textual totals, sample sizes and accessible tables.

Time Machine and Command Assistant use ordinary labelled form controls and text status surfaces.

Any manual failure blocks rollout of the affected feature until it is fixed and retested.
