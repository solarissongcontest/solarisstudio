# Public V3 P9 — Artist and Song identity contract

Status: **foundation / System identity blocked**

Owner: Public / Participant / Fan V3 (Chat 2)

## Canonical product requirement

Public V3 requires first-class Artist and Song pages.

Artist pages need stable identity plus public biography/photo, country relationships, songs, editions, results and stories.

Song pages need stable identity plus artist, country, edition, Credits, media, show appearances, result, analysis links and stories.

Publication safety is non-negotiable: an unpublished Entry must not leak through entity endpoints, Search, Open Graph, sitemap, preload, HTML source or API error detail.

## Current schema finding

Read-only hosted-Supabase inspection on 2026-10-17 found no first-class public artist or song entity tables.

Artist/song values currently live as mutable text on Entry/participation records, including:

- `entries.artist`
- `entries.song_title`
- `edition_participations.artist`
- `edition_participations.song`
- `participants.artist`
- `participants.song`
- `internal_entries.artist` / `song_title`
- `national_final_entries.artist` / `song_title`

The schema does have durable IDs for Entries, editions, countries and `contest_entities`, but those IDs do not make artist/song display text a durable first-class identity.

## Why name-derived identity is forbidden

Public must not create artist/song identity by:

- lower-casing display names;
- slugifying artist or song text;
- normalizing punctuation/diacritics;
- concatenating country + edition + name and pretending it is global identity;
- reusing a mutable Entry title as a permanent entity key.

Those strategies cannot safely distinguish namesakes, renamed acts, collaborations, punctuation changes, translated titles, duplicate song titles, returning artists, or corrected metadata. They also make historical URLs depend on editable display text.

## Current safe boundary

A published Entry UUID may anchor catalogue evidence such as “this published Entry currently displays artist X and song Y.”

It does **not** by itself answer:

- whether two Entries represent the same artist;
- whether a collaboration should be one artist entity or several;
- whether a corrected artist spelling is the same identity;
- whether two same-title songs are the same composition/recording;
- how artist aliases should resolve;
- how a withdrawn/replaced Entry affects a Song entity;
- whether a song returning in another edition is one Song entity or a new edition appearance.

`src/lib/v3-artist-song-identity.ts` therefore models current data as `entry_reference`, which is deliberately non-routable.

## Required System identity model

System V3 should provide durable first-class public identity for Artists and Songs before P9 page cutover.

The exact physical schema remains System-owned. The semantic contract must provide:

### Artist

- opaque stable artist id independent of display name;
- canonical display name;
- alias / historical-name lineage where needed;
- publication status that cannot be widened by Organizer permissions on a public read path;
- public biography/photo references only when publishable;
- relationships to published Entries/Songs, countries/delegations, editions, results and stories;
- deterministic merge/split behavior for duplicate identity corrections;
- safe tombstone/redirect semantics if identities are merged.

### Song

- opaque stable song id independent of title;
- canonical title;
- relationship to one or more artist identities;
- relationship to the canonical Entry appearance(s);
- Credits and media through existing canonical Entry/media authority rather than copied browser state;
- show appearances/results/analysis/story references;
- publication status tied to server-authoritative Entry/publication state;
- deterministic merge/split behavior if a duplicate identity is corrected.

## Public projection requirement

Public must consume a publication-safe System projection, not raw private submission tables.

For each entity projection, System must ensure:

- only publishable entity fields are returned;
- every related Entry/edition/show/story is independently publication-safe;
- future scheduled publication uses server time;
- Organizer capabilities do not widen public visibility;
- unavailable/private entities fail closed without revealing hidden titles, artists, IDs, media URLs or reasons;
- list/search and direct-by-id endpoints enforce the same visibility semantics.

## Route contract

First-class routes become legal only after the durable public identity exists:

- `/artists/:artistId`
- `/songs/:songId`

Route IDs are opaque durable identifiers from System. Display names may be decorative slugs only if they are explicitly non-authoritative and redirects remain stable; they must never be the identity key.

Until then:

- Explore may show a publication-safe Entry catalogue;
- edition/country/show pages may display artist/song text already permitted by their canonical publication projection;
- Search must not mint standalone artist/song URLs from display text;
- sitemap/Open Graph must not enumerate imaginary entity routes.

## P9 acceptance scenarios

### P9-A — namesake artists

Two different published artists have the same display name. They receive different durable Artist IDs and different entity pages. Search may disambiguate with published context without rewriting identity.

### P9-B — returning artist

The same artist returns in another edition with a spelling/alias change. System links both appearances to the same Artist identity while preserving edition-specific display history where required.

### P9-C — duplicate song titles

Two unrelated songs share the same title. They receive different Song IDs and routes. No title slug collision occurs.

### P9-D — unpublished Entry

An Organizer-capable user opens the public app while an Entry is scheduled/unpublished. The Artist/Song public projection, Search, HTML, Open Graph, sitemap and preload expose none of the hidden entity/Entry data.

### P9-E — identity correction

Two records later prove to be the same Artist or Song. System performs an auditable canonical merge/redirect; previously shared durable URLs resolve safely rather than silently changing based on a new display label.

## Release gate

P9 remains **foundation / System identity blocked** until:

- durable Artist and Song identity exists in System authority;
- publication-safe direct and search/list projections exist;
- alias/merge behavior is defined;
- Public first-class pages consume those projections;
- Search, Explore, sitemap, Open Graph and preload use only publication-safe first-class identity;
- exact-head Quality and Browser Audit pass;
- anonymous and Organizer-capable public-view acceptance tests prove unpublished data does not leak.
