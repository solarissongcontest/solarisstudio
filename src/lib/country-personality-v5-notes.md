# Country personality V5 visual contract

This file exists as a compact implementation checklist for regression reviews.

- 19 visible personalities: Classic, Editorial, Minimal, Flag Focus, Poster, Split, Spotlight, Broadcast, Panorama, Luxurious, Glass Card, Newspaper, Ribbon, Duotone, Passport, Horizon, Traditional, Sci-Fi, Water Drop.
- Internal compatibility values remain `monument` for Luxurious and `heritage` for Traditional.
- Gotham is the readable UI/body typeface. Classica Crastao is reserved for expressive display identities.
- Each personality has one primary flag treatment and at most restrained supporting detail.
- Country mobile hero target heights are locked in `country-personalities-v5.css` from 210 to 300 px on the canonical 390 px design target.
- Wiki mobile heroes are reduced to 145–205 px so the article remains primary.
- The appearance picker is two columns on phone widths with visual thumbnails, names and categories; the longer description is shown only for the selected personality.
- Decorations are curated per personality instead of exposing arbitrary combinations.
- Sci-Fi and Water Drop are real stored theme values backed by a database constraint migration.
