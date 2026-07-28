# Solaris Spectacle Suite — Rebuild Plan

The uploaded PDF gives 66 Terra Solaris countries with flags and 6 continents (North Hydra, South Hydra, Atlas, North Electra, South Electra, Gienah). I'll reload the country database from it first, then rebuild the app in phases.

## Phase 1 — Data foundation
- Reload `countries` from the PDF: 66 nations, flag images uploaded to CDN, correct continent as `region`. Remove leftover demo countries not on the list.
- Editions keyed by **edition number** (SSC 1, SSC 20), year optional; name/theme, host country, logo.
- Shows become first-class: every show owns its own participants, running order, voting system, votes, results, theme and broadcast settings. Nothing inherits votes from another show.
- Participation rows require only a country; artist/song/running order all optional and fillable later.
- New tables: `voting_systems` (point scale, awarded count, tie-breaks, weighting formula), `themes` (reusable scoreboard designs), `broadcast_settings` per show.
- Public read policies so **anything published is visible signed-out**; auth only gates create/edit/delete.

## Phase 2 — Organizer studio
- Edition manager: create/edit/delete editions, add shows (Semi 1, Semi 2, Grand Final, custom), reorder, publish per show.
- Country picker for a show: search 66 countries, add in bulk, fill entry details later.
- Fast vote entry: one row per point value with type-ahead country search ("Ast" → Asteria), duplicate/self-vote validation, incomplete-ballot detection, paste support.
- Televote entry with the same speed workflow.
- Qualification rules for semis (top N advance) feeding the final's participant list.

## Phase 3 — Voting system builder
- Arbitrary point scales (1–12, 5/10/15/20, 100/80/60/40, anything), unlimited values, custom awarded count.
- Jury/televote weighting with any split or custom formula; tie-break rule ordering.
- Configurable voting order and reveal order per show.

## Phase 4 — Scoreboard theme engine
- Per-edition/per-show theme with background (image/video/animated), overlay opacity, blur, brightness; logo and event title; primary/secondary/accent/text/border colors; fonts.
- Country cards: shape, radius, height/width, padding, spacing, shadow, glass strength.
- Flag shape options (rectangle, rounded, circle, square).
- Layout engine: single row, two rows, vertical list, two-column, custom grid — e.g. 26 finalists as 13 + 13, all countries always on screen.
- Themes saved to a library and reusable across editions; live preview while editing.

## Phase 5 — Broadcast production
- Scene system: opening titles, contest intro, country intro, voting presentation, scoreboard, jury reveal, televote reveal, winner, credits — each with its own layout.
- Redesigned compact scoreboard: smooth spring reordering, persistent leader highlight, position-change arrows, count-up points, 12-point glow/flash/particles/confetti.
- Spokesperson window: small/medium/large/hidden plus drag-to-reposition.
- Voting HUD: current voting country, countries voted/remaining, points remaining, most 12s, current leader, jury/televote split.
- Televote reveal modes: bottom-to-top, reverse ranking, custom order, batch.
- Control room: play/pause/prev/next/restart, skip animation, jump to country, jump to televote, black screen, emergency skip, live speed change.
- Timing controls: 0.25×–2× master plus separate point-animation, leaderboard-movement, country-pause, 12-point-pause and reveal-delay sliders.

## Phase 6 — Analytics & history
- Per-event: jury / televote / combined rankings, matrix, relationships, 12-point map, similarity, historical comparison.
- Voting matrix redesigned with flag + full country name (no 3-letter codes), clickable cells drilling into given/received/history/transfers.
- Cross-edition analytics spanning every edition, show, semi and final regardless of voting system used.
- Country profiles: participations, finals, qualification rate, average placement/points, best/worst, trends, supporters, rivals, 12-point history.
- Point transfer analysis (A→B totals, averages, counts, highest award, frequency), relationship timelines, bloc/friendship/rivalry/swing detection, point-source breakdown, jury-vs-televote evolution, records hall.
- Visualisations: network graph, transfer map, relationship timeline, similarity graph, historical leaderboard, alliance clusters.

## Phase 7 — Replay & public site
- Any completed show replays its original broadcast: original theme, order, timing, animations, results — pausable, rewindable, scrubbable to any vote.
- Public routes for published editions/shows/scoreboards/records with no login.

## Technical notes
- Stays on TanStack Start + React + Tailwind + Framer Motion + Lovable Cloud.
- Theme/voting-system/broadcast config stored as validated JSONB, rendered through CSS variables so scoreboard and broadcast share one renderer.
- Analytics computed from raw votes across all shows, normalised per voting system so different scales stay comparable.
- Existing SSC I demo data is migrated into the new show-based structure rather than deleted.

I'll work through the phases in order and report progress as each lands.
