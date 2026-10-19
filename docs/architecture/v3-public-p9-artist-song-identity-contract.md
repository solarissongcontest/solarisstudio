# Public V3 P9 — Artist and Song identity contract

Status: **foundation / System identity blocked**

Owner: Public V3 Chat 2A

## Canonical product requirement

Public V3 requires first-class Artist and Song pages.

Artist pages need stable identity plus public biography/photo, country relationships, songs, editions, results and stories.

Song pages need stable identity plus artist, country, edition, credits, media, show appearances, result, analysis links and stories.

Publication safety is non-negotiable: an unpublished Entry must not leak through entity endpoints, Search, Open Graph, sitemap, preload, HTML source or API error detail.

## Current authority finding

A bounded read-only production schema check on 2026-10-18 found no `public` or `private` tables or functions whose names contain `artist` or `song`. Current repository projections still carry artist/song as Entry/participation display fields rather than first-class entity identity.

Known mutable text fields include:

- `entries.artist`
- `entries.song_title`
- `edition_participations.artist`
- `edition_participations.song`
- `participants.artist`
- `participants.song`
- internal / National Final Entry artist and song-title fields

Solaris has durable IDs for Entries, editions, countries and contest entities. Those IDs do not make artist/song display text a durable first-class Artist or Song identity.

## Why name-derived identity is forbidden

Public must not create Artist/Song identity by:

- lower-casing display names;
- slugifying artist or song text;
- normalizing punctuation or diacritics;
- concatenating country + edition + name and pretending it is global identity;
- reusing a mutable Entry title as a permanent entity key.

Those strategies cannot safely distinguish namesakes, renamed acts, collaborations, punctuation changes, translated titles, duplicate song titles, returning artists or corrected metadata. Historical URLs would also become dependent on editable display text.

## Current safe boundary

An Entry UUID may anchor catalogue evidence such as “this published Entry currently displays artist X and song Y.”

It does **not** by itself answer:

- whether two Entries represent the same artist;
- whether a collaboration should be one Artist entity or several;
- whether corrected spelling is the same identity;
- whether two same-title songs are the same composition/recording;
- how artist aliases should resolve;
- how a withdrawn/replaced Entry affects a Song entity;
- whether a returning song is one Song entity or a new appearance.

`src/lib/v3-artist-song-identity.ts` therefore models current catalogue data as `entry_reference`, which is deliberately non-routable.

## Required System identity model

System V3 should provide durable first-class public identity for Artists and Songs before P9 page cutover. The physical schema remains Chat 1 / System ownership.

### Artist

The Public contract requires:

- opaque stable artist id independent of display name;
- canonical display name;
- alias / historical-name lineage where needed;
- publication state that cannot be widened by Organizer permissions on a public read path;
- public biography/photo references only when publishable;
- relationships to published Entries/Songs, countries/delegations, editions, results and stories;
- deterministic merge/split behavior for duplicate identity corrections;
- safe tombstone/redirect semantics if identities are merged.

### Song

The Public contract requires:

- opaque stable song id independent of title;
- canonical title;
- relationship to one or more Artist identities;
- relationship to canonical Entry appearance(s);
- credits and media through existing canonical Entry/media authority rather than copied browser state;
- show appearances/results/analysis/story references;
- publication state tied to server-authoritative Entry/publication truth;
- deterministic merge/split behavior if duplicate identity is corrected.

## Public projection requirement

Public must consume publication-safe System projections, not raw private submission tables.

For direct/list/search entity projections, System must ensure:

- only publishable fields are returned;
- every related Entry/edition/show/story is independently publication-safe;
- future scheduled publication uses server time;
- Organizer capabilities do not widen public visibility;
- unavailable/private entities fail closed without revealing hidden titles, artists, IDs, media URLs or reasons;
- list/search and direct-by-id paths enforce the same visibility semantics.

## Route contract

First-class routes become legal only after durable public identity exists:

- `/artists/:artistId`
- `/songs/:songId`

Route IDs are opaque durable identifiers supplied by System. Display names may only be decorative routing metadata if explicitly non-authoritative and redirects remain stable.

Until then:

- Explore may show publication-safe Entry catalogue evidence;
- edition/country/show pages may display artist/song text already permitted by their canonical publication projection;
- Search must not mint standalone Artist/Song URLs from display text;
- sitemap/Open Graph/preload must not enumerate imaginary first-class entity routes.

## P9 acceptance scenarios

### P9-A — namesake artists

Two different published artists share one display name. They receive different durable Artist IDs and distinct entity pages. Search disambiguates using published context without rewriting identity.

### P9-B — returning artist

The same artist returns in another edition with a spelling or alias change. System links the appearances to one Artist identity while preserving edition-specific historical presentation where required.

### P9-C — duplicate song titles

Two unrelated songs share the same title. They receive distinct Song IDs and routes. No title-slug collision occurs.

### P9-D — unpublished Entry

An Organizer-capable user opens the public app while an Entry is scheduled/unpublished. Artist/Song projection, Search, HTML, Open Graph, sitemap and preload expose none of the hidden entity/Entry data.

### P9-E — identity correction

Two records later prove to be the same Artist or Song. System performs an auditable canonical merge/redirect; previously shared durable URLs resolve safely instead of silently changing with display text.

## Release gate

P9 remains **foundation / System identity blocked** until:

- durable Artist and Song identity exists in System authority;
- publication-safe direct and list/search projections exist;
- alias/merge behavior is defined;
- Public first-class pages consume those projections;
- Search, Explore, sitemap, Open Graph and preload use only publication-safe first-class identity;
- exact-head Quality and Browser Audit pass;
- anonymous and Organizer-capable public-view acceptance tests prove unpublished data does not leak.
