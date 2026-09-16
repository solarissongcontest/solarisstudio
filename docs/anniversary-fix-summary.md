# Anniversary launch fixes

This patch makes the 17 September anniversary use canonical, publication-aware history rather than row order or current-edition placeholders.

## Fixed

- deterministic latest champion ordering by exact edition date / edition number
- private or unresolved Grand Finals excluded from anniversary records
- SSC22 zero-point placeholders cannot become champions, records, closest finishes or historical wins
- anniversary-year country count comes from canonical period participation rather than the global country directory
- MySolaris now has a real route-native personalized anniversary recap
- Anniversary Preview no longer promises disabled portal-era Country/Records modules
- all-time Anniversary Hub participation stats use canonical edition participation collapse
- historical delegation cards are explicitly an editorial legacy index, not an official ranking
- Studio 2 Anniversary Engine now detects legacy country debuts from all participant-row shapes rather than requiring `show_id IS NULL`
- age calculation does not call Solaris four years old before 17 September

## Intentionally unchanged

- `Europe/Paris` remains the canonical anniversary timezone
- missing historical edition dates are not fabricated
- empty Storytelling moments are not filled with generated public content merely for launch

## Verified production 2026 period

`2025-09-17 <= event_date < 2026-09-17` currently resolves to 7 chapters, 22 public shows, 307 canonical entries and 61 participating countries. The latest resolved champion is Diaria (SSC21, 611); the closest final is Oland over Ørnådal by 14 in SSC17.
