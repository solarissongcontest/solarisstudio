# Solaris Studio V3 Public capability report

> Generated from `docs/v3/public-capability-registry.ts`. Do not edit this report by hand. Run `bun run generate:v3-registry-report` after changing the registry.

This is a migration-inventory snapshot, **not a V3 release certificate**. Repository coverage is independently enforced by `bun run check:v3-registry`; exact-SHA release certification still requires the complete V3 gates and rehearsals.

## Snapshot

- **Registered Public capabilities:** 34
- **Unknown is not a valid registry classification:** enforced by the registry type
- **Route/navigation/feature/notification/PWA/sitemap coverage:** enforced separately by the registry guard

### Classification counts

- **contextualize:** 18
- **merge:** 8
- **redesign:** 5
- **restrict:** 3

### Specification status counts

- **building:** 4
- **cutover:** 1
- **mapped:** 16
- **parity:** 13

### Target-area counts

- **auth:** 1
- **contextual:** 4
- **explore:** 9
- **home:** 2
- **live:** 1
- **me:** 3
- **participate:** 9
- **results:** 5

## Capability migration table

| Capability | Classification | Target area | Target route | Status | Acceptance scenario |
| --- | --- | --- | --- | --- | --- |
| participant-confirmation | contextualize | participate | /participate/confirmation | parity | P0-CONFIRMATION-001 |
| participant-entry | contextualize | participate | /participate/entry | parity | P0-ENTRY-001 |
| participant-jury | contextualize | participate | /participate/jury | parity | P0-JURY-001 |
| participant-media | contextualize | participate | /participate/media | building | P0-MEDIA-001 |
| participant-next-in-line | contextualize | participate | /participate/next-in-line | mapped | P0-NEXT-IN-LINE-001 |
| participant-televote | contextualize | participate | /participate/televote | parity | P0-TELEVOTE-001 |
| public-account-settings | contextualize | me | /my-solaris/account | parity | P0-ACCOUNT-001 |
| public-anniversary | contextualize | explore | /explore | mapped | P0-ANNIVERSARY-001 |
| public-app-launch | restrict | contextual | / | cutover | P0-APP-LAUNCH-001 |
| public-archive-games | contextualize | explore | /explore | mapped | P0-ARCHIVE-GAMES-001 |
| public-auth | redesign | auth | /auth | mapped | P0-AUTH-001 |
| public-beta-test | restrict | contextual | / | mapped | P0-BETA-001 |
| public-country-entity | merge | explore | /countries/:code | building | P0-COUNTRY-001 |
| public-dev-labs | restrict | contextual | / | mapped | P0-DEV-001 |
| public-edition-hub | redesign | explore | /editions/:slug | parity | P0-EDITION-001 |
| public-encyclopedia | merge | explore | /explore | mapped | P0-REFERENCE-001 |
| public-explore | merge | explore | /explore | building | P0-EXPLORE-001 |
| public-fantasy | contextualize | participate | /participate/fantasy | mapped | P0-FANTASY-001 |
| public-home | redesign | home | / | parity | P0-HOME-001 |
| public-live-show-mode | contextualize | live | /show-mode | mapped | P0-LIVE-001 |
| public-me | merge | me | /my-solaris | building | P0-ME-001 |
| public-notifications | contextualize | me | /notifications | parity | P0-NOTIFICATIONS-001 |
| public-participate | redesign | participate | /participate | parity | P0-PARTICIPATE-001 |
| public-predictions | merge | participate | /participate/predictions | mapped | P0-PREDICTIONS-001 |
| public-pulse | merge | home | / | mapped | P0-PULSE-001 |
| public-result-analysis | merge | results | /results/analysis | mapped | P0-RESULT-ANALYSIS-001 |
| public-results | redesign | results | /results | parity | P0-RESULTS-001 |
| public-rules-guidance | contextualize | contextual | /rules | parity | P0-RULES-001 |
| public-scoreboard | contextualize | results | /shows/:slug | parity | P0-SCOREBOARD-001 |
| public-search | contextualize | explore | /explore?search=1 | parity | P0-SEARCH-001 |
| public-site-directory | merge | explore | /explore | mapped | P0-SITE-DIRECTORY-001 |
| public-stories | contextualize | explore | /explore | mapped | P0-STORIES-001 |
| public-taste-dna | contextualize | results | /results/taste-dna | mapped | P0-TASTE-DNA-001 |
| public-voting-dna | contextualize | results | /results/voting-dna | mapped | P0-VOTING-DNA-001 |

## Release interpretation

A capability reaching `parity` means its migration row has implementation/parity evidence suitable for the capability programme. It does **not** by itself permit legacy removal or a V3-complete claim. Legacy cutover still requires parity evidence, production-safe migration, zero uncovered capability signals, recovery/rehearsal evidence, and exact-final-SHA certification.
