# Solaris completion products

## Public Encyclopedia

Route: `/encyclopedia`

Uses the shared public archive projection. Searchable reference entities include editions, countries, published entries, artists and shows. Canonical country, edition and show routes are reused rather than duplicated.

## Country Voting DNA

Routes: `/voting-dna`, `/voting-dna/$code`

Descriptive country analytics. Directional support uses published detailed jury ballots. Jury/televote result totals remain separate. Sample size and methodology are visible.

## Prediction League

Route: `/prediction-league`

A scored public standings layer over Prediction Arena. Database output includes only public, leaderboard-opted-in fan profiles and only scores from rounds whose result layer is published.

## Fantasy SSC

Routes: `/fantasy`, `/admin/fantasy`

MVP rules:

- fixed roster size;
- explicit deterministic costs;
- maximum budget;
- optional captain multiplier;
- server-authoritative lock;
- versioned v1 scoring;
- scoring only after result publication;
- privacy-safe opt-in leaderboard.

Database enforcement lives in the completion-products migration and is not delegated to client-side validation.

## Time Machine

Route: `/admin/time-machine`

Read-only evidence projection over contest events and audit markers at or before a selected timestamp. Sensitive audit payloads are not returned by the Time Machine RPC.

## Solaris Command Assistant

Route: `/admin/command-assistant`

First release is deliberately read-only. Human wording is matched to a fixed command registry. Unknown wording returns no command rather than inventing a query. Mutating commands remain out of scope until a separately verified confirmation/audit layer exists.
